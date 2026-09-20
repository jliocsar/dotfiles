#!/usr/bin/env bun
// MessageDisplay hook: custom renderers for fenced code blocks in assistant
// messages. Display-only: the transcript and the model keep the original text.
//
// Fence languages handled:
//   mermaid                -> ASCII diagram via mermaid-ascii (graph / sequence)
//   claude-code-callgraph  -> ANSI-colored callgraph, implement-skill convention:
//                             "+ " added, "! " changed, "- " removed, unmarked
//                             context, tree glyphs, an "entry <signature>"
//                             root line, and "signature  path:line" trailers.
//
// Colors come from the active Claude Code theme: settings.json `theme`, and
// for "custom:<slug>" the overrides in $CLAUDE_CONFIG_DIR/themes/<slug>.json.
//
// Deltas arrive as batches of whole lines and a fence spans several batches,
// so an open fence is buffered in a per-message state file and hidden until
// its closing fence arrives; the rendered block is then emitted in one go.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type HookInput = { message_id: string; final: boolean; delta: string };
type OpenFence = { lang: string; lines: string[] };
type Theme = { base: "dark" | "light"; colors: Record<string, string> };

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const STATE_DIR = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "claude-render-fences");
const RENDERED_LANGS = new Set(["mermaid", "claude-code-callgraph"]);

// Tokens the callgraph renderer reads, with fallbacks for the built-in presets
// (custom themes only carry overrides, everything else falls through here).
const BUILTIN_COLORS: Record<Theme["base"], Record<string, string>> = {
  dark: {
    text: "#ffffff", subtle: "#5f5f5f", inactive: "#999999", claude: "#d77757",
    success: "#4eba65", error: "#ff6b80", warning: "#ffc107", permission: "#b1b9f9",
    planMode: "#72c7e6", diffAdded: "#225c2b", diffRemoved: "#7a2936",
    blue_FOR_SUBAGENTS_ONLY: "#61afef", yellow_FOR_SUBAGENTS_ONLY: "#e5c07b",
    cyan_FOR_SUBAGENTS_ONLY: "#56b6c2",
  },
  light: {
    text: "#000000", subtle: "#a0a0a0", inactive: "#666666", claude: "#d77757",
    success: "#2c7a39", error: "#ab2b3f", warning: "#966c1e", permission: "#5769f7",
    planMode: "#1d7fa3", diffAdded: "#69db7c", diffRemoved: "#ffa8b4",
    blue_FOR_SUBAGENTS_ONLY: "#4078f2", yellow_FOR_SUBAGENTS_ONLY: "#986801",
    cyan_FOR_SUBAGENTS_ONLY: "#0184bc",
  },
};

function loadTheme(): Theme {
  let themeSetting = "dark";
  try {
    themeSetting = JSON.parse(readFileSync(join(CONFIG_DIR, "settings.json"), "utf8")).theme ?? "dark";
  } catch {}
  let base: Theme["base"] = themeSetting.includes("light") ? "light" : "dark";
  let overrides: Record<string, string> = {};
  if (themeSetting.startsWith("custom:")) {
    try {
      const custom = JSON.parse(readFileSync(join(CONFIG_DIR, "themes", `${themeSetting.slice(7)}.json`), "utf8"));
      base = custom.base?.includes("light") ? "light" : "dark";
      overrides = custom.overrides ?? {};
    } catch {}
  }
  return { base, colors: { ...BUILTIN_COLORS[base], ...overrides } };
}

// --- ANSI helpers ---------------------------------------------------------

const TRUECOLOR = /truecolor|24bit/i.test(process.env.COLORTERM ?? "");

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function xterm256(r: number, g: number, b: number): number {
  const cube = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * cube(r) + 6 * cube(g) + cube(b);
}

function sgrColor(hex: string, layer: 38 | 48): string {
  const [r, g, b] = hexToRgb(hex);
  return TRUECOLOR ? `\x1b[${layer};2;${r};${g};${b}m` : `\x1b[${layer};5;${xterm256(r, g, b)}m`;
}

function mixHex(hex: string, towards: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(towards);
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

const fg = (hex: string, text: string) => `${sgrColor(hex, 38)}${text}\x1b[39m`;
const bg = (hex: string, text: string) => `${sgrColor(hex, 48)}${text}\x1b[49m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;

// --- callgraph renderer ----------------------------------------------------

type DiffKind = "added" | "changed" | "removed" | "context";

const PATH_AT_END =
  /^(.*?)(\s{2,})((?:(?:[~.@\w-]+\/)*[.@\w-]+\.[A-Za-z0-9]+(?::\d+(?:[-:]\d+)*)?(?:\s+\(new\))?|\(external\)))$/u;
const TREE_PREFIX = /^([\s│├└─┬┼]*)(.*)$/u;
const ENTRY = /^(entry)(\s+)(.*)$/u;
const FUNCTION_NAME = /^([A-Za-z_$][\w$]*(?:(?:::|\.)[A-Za-z_$][\w$]*)*)(?=\s*\()/u;
const TYPE_NAME = /\b[A-Z][A-Za-z0-9_]*\b/gu;

function parseDiffLine(line: string): { kind: DiffKind; content: string } {
  const marker = line[0];
  if (marker === "+" || marker === "!" || marker === "-") {
    return {
      kind: marker === "+" ? "added" : marker === "!" ? "changed" : "removed",
      content: line.slice(line[1] === " " ? 2 : 1),
    };
  }
  return { kind: "context", content: line };
}

// Colors the function name and Capitalized type names in one signature part.
function highlightSignaturePart(source: string, colors: Record<string, string>): string {
  const spans: { start: number; end: number; hex: string }[] = [];
  const functionMatch = FUNCTION_NAME.exec(source);
  if (functionMatch) {
    spans.push({ start: 0, end: functionMatch[1].length, hex: colors.blue_FOR_SUBAGENTS_ONLY ?? colors.permission });
  }
  if (functionMatch || !source.includes("/")) {
    for (const match of source.matchAll(TYPE_NAME)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!spans.some((span) => start < span.end && end > span.start)) {
        spans.push({ start, end, hex: colors.yellow_FOR_SUBAGENTS_ONLY ?? colors.warning });
      }
    }
  }
  if (spans.length === 0) return source;
  spans.sort((left, right) => left.start - right.start);
  let cursor = 0;
  let rendered = "";
  for (const span of spans) {
    rendered += source.slice(cursor, span.start) + fg(span.hex, source.slice(span.start, span.end));
    cursor = span.end;
  }
  return rendered + source.slice(cursor);
}

function highlightFragment(fragment: string, colors: Record<string, string>): string {
  return fragment
    .split(/(\s+→\s+)/u)
    .map((part, index) =>
      index % 2 === 1 ? fg(colors.cyan_FOR_SUBAGENTS_ONLY ?? colors.planMode, part) : highlightSignaturePart(part, colors),
    )
    .join("");
}

function styleGraphContent(content: string, colors: Record<string, string>): string {
  if (!content) return "";
  const treeMatch = TREE_PREFIX.exec(content);
  const tree = treeMatch?.[1] ?? "";
  const styledTree = tree ? fg(colors.subtle, tree) : "";

  // Peel the trailing "  path:line" first so it never leaks into signature
  // highlighting (a "/" in the path would otherwise suppress type coloring).
  let rest = treeMatch?.[2] ?? content;
  let styledPath = "";
  const pathMatch = PATH_AT_END.exec(rest);
  if (pathMatch) {
    const [, signature, spacing, path] = pathMatch;
    rest = signature;
    styledPath = spacing + fg(path === "(external)" ? colors.subtle : colors.inactive, path);
  }

  const entry = ENTRY.exec(rest);
  if (entry) {
    const [, label, spacing, signature] = entry;
    return styledTree + fg(colors.claude, bold(label)) + spacing + highlightFragment(signature, colors) + styledPath;
  }
  return styledTree + highlightFragment(rest, colors) + styledPath;
}

function renderCallgraph(lines: string[], theme: Theme): string[] {
  const { colors } = theme;
  const changedBg = mixHex(colors.warning, theme.base === "dark" ? "#000000" : "#ffffff", 0.8);
  const marker: Record<DiffKind, string> = {
    added: fg(colors.success, "+ "),
    changed: fg(colors.warning, "! "),
    removed: fg(colors.error, "- "),
    context: "  ",
  };
  const lineBg: Record<DiffKind, string | undefined> = {
    added: colors.diffAdded,
    changed: changedBg,
    removed: colors.diffRemoved,
    context: undefined,
  };
  const parsed = lines.map(parseDiffLine);
  const hasDiffGutter = parsed.some(({ kind }) => kind !== "context");
  return parsed.map(({ kind, content }) => {
    // Context rows in a marked graph are usually written with two leading
    // spaces to line up with "+ " rows; the gutter replaces that indent.
    const body = hasDiffGutter && kind === "context" && content.startsWith("  ") ? content.slice(2) : content;
    const line = (hasDiffGutter ? marker[kind] : "") + styleGraphContent(body, colors);
    const hex = lineBg[kind];
    return hex ? bg(hex, line) : line;
  });
}

// --- mermaid renderer ------------------------------------------------------

function renderMermaid(lines: string[]): string[] | undefined {
  const result = Bun.spawnSync(["mermaid-ascii", "-f", "-"], { stdin: Buffer.from(lines.join("\n") + "\n"), stderr: "ignore" });
  const ascii = result.success ? result.stdout.toString().replace(/\n+$/, "") : "";
  return ascii ? ascii.split("\n") : undefined;
}

// --- fence state machine ---------------------------------------------------

function renderFence(fence: OpenFence, theme: Theme): string {
  const rendered = fence.lang === "mermaid" ? renderMermaid(fence.lines) : renderCallgraph(fence.lines, theme);
  const body = rendered ?? fence.lines;
  const lang = rendered ? "text" : fence.lang;
  return ["```" + lang, ...body, "```"].join("\n") + "\n";
}

function main(): void {
  const input: HookInput = JSON.parse(readFileSync(0, "utf8"));
  const stateFile = join(STATE_DIR, input.message_id);
  let open: OpenFence | undefined;
  if (existsSync(stateFile)) {
    try { open = JSON.parse(readFileSync(stateFile, "utf8")); } catch {}
  }

  const theme = loadTheme();
  const endsWithNewline = input.delta.endsWith("\n");
  const lines = input.delta.split("\n");
  if (endsWithNewline) lines.pop();

  let out = "";
  for (const line of lines) {
    if (open === undefined) {
      const openMatch = /^\s*```([\w-]+)\s*$/u.exec(line);
      if (openMatch && RENDERED_LANGS.has(openMatch[1])) {
        open = { lang: openMatch[1], lines: [] };
      } else {
        out += line + "\n";
      }
    } else if (/^\s*```\s*$/u.test(line)) {
      out += renderFence(open, theme);
      open = undefined;
    } else {
      open.lines.push(line);
    }
  }
  if (!endsWithNewline && out.endsWith("\n")) out = out.slice(0, -1);

  if (input.final) {
    // Unterminated fence at end of message: show it raw rather than swallow it.
    if (open) out += "```" + open.lang + "\n" + open.lines.join("\n") + "\n";
    rmSync(stateFile, { force: true });
  } else if (open) {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(open));
  } else {
    rmSync(stateFile, { force: true });
  }

  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "MessageDisplay", displayContent: out } }));
}

main();
