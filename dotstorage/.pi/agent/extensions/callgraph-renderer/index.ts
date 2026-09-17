import {
  getLanguageFromPath,
  highlightCode,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  Text,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

type DiffKind = "added" | "changed" | "removed" | "context";

type CallgraphDetails = {
  graph: string;
  language: string;
};

const MAX_GRAPH_LINES = 2_000;
const MAX_GRAPH_BYTES = 50 * 1024;
const PATH_AT_END =
  /^(.*?)(\s{2,})((?:(?:[~.@\w-]+\/)*[.@\w-]+\.[A-Za-z0-9]+(?::\d+(?:[-:]\d+)*)?(?:\s+\(new\))?|\(external\)))$/u;
const TREE_PREFIX = /^([\s│├└─┬┼]*)(.*)$/u;

const languageAliases: Record<string, string> = {
  cxx: "cpp",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  sh: "bash",
  ts: "typescript",
  tsx: "typescript",
};

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  return languageAliases[normalized] ?? normalized;
}

function normalizeGraph(input: string): string {
  const normalized = input.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();

  if (lines[0]?.trim().startsWith("```") && lines.at(-1)?.trim() === "```") {
    lines.shift();
    lines.pop();
  }

  return lines.join("\n");
}

function inferLanguage(graph: string): string | undefined {
  for (const line of graph.split("\n")) {
    const match = PATH_AT_END.exec(line.replace(/^[+!\-]\s?/, ""));
    const path = match?.[3]?.replace(/\s+\(new\)$/, "");
    if (!path || path === "(external)") continue;
    const language = getLanguageFromPath(path.replace(/:\d+(?:[-:]\d+)*$/, ""));
    if (language) return language;
  }
  return undefined;
}

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

type HighlightSpan = {
  start: number;
  end: number;
  color: "syntaxFunction" | "syntaxType";
};

function highlightSignaturePart(source: string, language: string, theme: Theme): string {
  const spans: HighlightSpan[] = [];
  const functionMatch = /^([A-Za-z_$][\w$]*(?:(?:::|\.)[A-Za-z_$][\w$]*)*)(?=\s*\()/u.exec(source);
  if (functionMatch) {
    spans.push({ start: 0, end: functionMatch[1].length, color: "syntaxFunction" });
  }

  if (functionMatch || !source.includes("/")) {
    for (const match of source.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/gu)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!spans.some((span) => start < span.end && end > span.start)) {
        spans.push({ start, end, color: "syntaxType" });
      }
    }
  }

  if (spans.length === 0) return highlightCode(source, language)[0] ?? source;

  spans.sort((left, right) => left.start - right.start);
  let cursor = 0;
  let rendered = "";
  for (const span of spans) {
    if (span.start > cursor) {
      const plain = source.slice(cursor, span.start);
      rendered += highlightCode(plain, language)[0] ?? plain;
    }
    rendered += theme.fg(span.color, source.slice(span.start, span.end));
    cursor = span.end;
  }
  if (cursor < source.length) {
    const plain = source.slice(cursor);
    rendered += highlightCode(plain, language)[0] ?? plain;
  }
  return rendered;
}

function highlightFragment(fragment: string, language: string, theme: Theme): string {
  if (!fragment) return "";

  try {
    const parts = fragment.split(/(\s+→\s+)/u);
    return parts
      .map((part, index) => {
        if (index % 2 === 1) return theme.fg("syntaxOperator", part);
        return highlightSignaturePart(part, language, theme);
      })
      .join("");
  } catch {
    return theme.fg("text", fragment);
  }
}

function styleGraphContent(content: string, language: string, theme: Theme): string {
  if (!content) return "";

  const treeMatch = TREE_PREFIX.exec(content);
  const tree = treeMatch?.[1] ?? "";
  const rest = treeMatch?.[2] ?? content;
  const styledTree = tree ? theme.fg("toolDiffContext", tree) : "";

  const header = /^(phase|entry|suite)(\s+)(.*)$/u.exec(rest);
  if (header) {
    const [, label, spacing, value] = header;
    const styledLabel = theme.fg("accent", theme.bold(label));
    if (label === "phase") {
      return styledTree + styledLabel + spacing + theme.fg("mdHeading", value);
    }
    return styledTree + styledLabel + spacing + highlightFragment(value, language, theme);
  }

  const pathMatch = PATH_AT_END.exec(rest);
  if (!pathMatch) {
    return styledTree + highlightFragment(rest, language, theme);
  }

  const [, signature, spacing, path] = pathMatch;
  return (
    styledTree +
    highlightFragment(signature, language, theme) +
    spacing +
    theme.fg(path === "(external)" ? "dim" : "muted", path)
  );
}

function markerFor(kind: DiffKind, theme: Theme): string {
  switch (kind) {
    case "added":
      return theme.fg("toolDiffAdded", "+ ");
    case "changed":
      return theme.fg("accent", "! ");
    case "removed":
      return theme.fg("toolDiffRemoved", "- ");
    case "context":
      return "  ";
  }
}

function xtermColor(r: number, g: number, b: number): number {
  const red = Math.round((r / 255) * 5);
  const green = Math.round((g / 255) * 5);
  const blue = Math.round((b / 255) * 5);
  return 16 + 36 * red + 6 * green + blue;
}

function rgbBackground(hex: string, line: string, theme: Theme): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const ansi =
    theme.getColorMode() === "truecolor"
      ? `\x1b[48;2;${r};${g};${b}m`
      : `\x1b[48;5;${xtermColor(r, g, b)}m`;
  return `${ansi}${line}\x1b[49m`;
}

function changedLineBackground(line: string, theme: Theme): string {
  if (theme.name === "zenbones-dark") return rgbBackground("#1E2B35", line, theme);
  if (theme.name === "zenbones-light") return rgbBackground("#B9C9D3", line, theme);
  return theme.bg("toolPendingBg", line);
}

function applyLineBackground(line: string, kind: DiffKind, theme: Theme): string {
  switch (kind) {
    case "added":
      return theme.bg("toolSuccessBg", line);
    case "changed":
      return changedLineBackground(line, theme);
    case "removed":
      return theme.bg("toolErrorBg", line);
    case "context":
      return line;
  }
}

class CallgraphComponent implements Component {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly graph: string,
    private readonly language: string,
    private readonly theme: Theme,
  ) {}

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const safeWidth = Math.max(1, width);
    const parsed = this.graph.split("\n").map(parseDiffLine);
    const hasDiffGutter = parsed.some(({ kind }) => kind !== "context");
    const gutterWidth = hasDiffGutter ? 2 : 0;
    const contentWidth = Math.max(1, safeWidth - gutterWidth);
    const rendered: string[] = [];

    for (const { kind, content } of parsed) {
      const styled = styleGraphContent(content, this.language, this.theme);
      const wrapped = wrapTextWithAnsi(styled, contentWidth);

      for (let index = 0; index < wrapped.length; index++) {
        const gutter = hasDiffGutter
          ? index === 0
            ? markerFor(kind, this.theme)
            : "  "
          : "";
        const padded = truncateToWidth(gutter + wrapped[index], safeWidth, "", true);
        rendered.push(applyLineBackground(padded, kind, this.theme));
      }
    }

    this.cachedWidth = width;
    this.cachedLines = rendered;
    return rendered;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

function graphFromResult(result: {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
}): CallgraphDetails | undefined {
  const details = result.details as Partial<CallgraphDetails> | undefined;
  if (typeof details?.graph !== "string" || typeof details.language !== "string") return undefined;
  return { graph: details.graph, language: details.language };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "render_callgraph",
    label: "Callgraph",
    description:
      "Render an API graph, call graph, or test graph as a native transcript component. " +
      "The graph uses the implement-skill convention: '+ ' added, '! ' changed, '- ' removed, " +
      "and unmarked context lines. Pass the repository language so signatures and types receive syntax highlighting.",
    promptSnippet: "Render callgraphs as syntax-highlighted native diff components",
    promptGuidelines: [
      "Use render_callgraph instead of fenced diff or text blocks whenever presenting an API graph, call graph, or test graph for review; pass the graph exactly once, include its implementation language, and do not repeat the graph in assistant prose.",
    ],
    parameters: Type.Object({
      graph: Type.String({
        description:
          "The complete callgraph without Markdown fences. Preserve tree glyphs and diff markers exactly.",
      }),
      language: Type.Optional(
        Type.String({
          description:
            "Syntax language such as typescript, rust, lua, go, python, or cpp. Omit only when a changed-node path makes it inferable.",
        }),
      ),
    }),
    renderShell: "self",

    async execute(_toolCallId, params) {
      const graph = normalizeGraph(params.graph);
      const lineCount = graph ? graph.split("\n").length : 0;
      const byteCount = Buffer.byteLength(graph, "utf8");

      if (!graph) throw new Error("Callgraph cannot be empty.");
      if (lineCount > MAX_GRAPH_LINES || byteCount > MAX_GRAPH_BYTES) {
        throw new Error(
          `Callgraph exceeds the ${MAX_GRAPH_LINES}-line or ${MAX_GRAPH_BYTES}-byte rendering limit.`,
        );
      }

      const language = normalizeLanguage(params.language ?? inferLanguage(graph) ?? "text");
      return {
        content: [
          {
            type: "text" as const,
            text: `Rendered ${language} callgraph:\n\n${graph}`,
          },
        ],
        details: { graph, language } satisfies CallgraphDetails,
      };
    },

    renderCall(args, theme) {
      const language = args.language ? normalizeLanguage(args.language) : "auto";
      const title = theme.fg("toolTitle", theme.bold("callgraph"));
      const languageLabel = theme.fg("muted", language);
      const legend = [
        theme.bg("toolSuccessBg", theme.fg("toolDiffAdded", " + add ")),
        changedLineBackground(theme.fg("accent", " ! change "), theme),
        theme.bg("toolErrorBg", theme.fg("toolDiffRemoved", " - remove ")),
      ].join(" ");
      return new Text(`${title} ${languageLabel}  ${legend}`, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = graphFromResult(result);
      if (!details) {
        const text = result.content.find((part) => part.type === "text");
        return new Text(text?.text ?? "Unable to render callgraph", 0, 0);
      }
      return new CallgraphComponent(details.graph, details.language, theme);
    },
  });
}
