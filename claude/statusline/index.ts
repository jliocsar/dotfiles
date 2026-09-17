#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";

import {
  BOLD,
  COLORS,
  ELLIPSIS,
  ICONS,
  LABELS,
  SEPARATOR,
  SEPARATOR_WIDTH,
  THRESHOLDS,
  WIDTHS,
} from "./config";

// ─── Types ───
type Input = {
  cwd?: string;
  model?: { id?: string; display_name?: string };
  workspace?: {
    current_dir?: string;
    project_dir?: string;
    git_worktree?: string;
  };
  context_window?: {
    used_percentage?: number | null;
    context_window_size?: number | null;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
  worktree?: {
    name?: string;
    branch?: string;
  };
  effort?: { level?: string };
  exceeds_200k_tokens?: boolean;
};

// ─── Helpers ───
const HOME = homedir();
const { reset, gray } = COLORS;

// Single color applied to icon + text. Extra space between icon and text
// (Nerd Font glyphs render better with visual breathing room).
const seg = (color: string, icon: string, label: string) =>
  `${color}${icon ? `${icon}  ` : ""}${label}${reset}`;

const truncate = (s: string, max: number) =>
  s.length <= max ? s : s.slice(0, max - 1) + ELLIPSIS;

// Gray unless the value crosses into a warning state.
const thresholdColor = (pct: number) => {
  if (pct > THRESHOLDS.danger) return COLORS.red;
  if (pct > THRESHOLDS.warn) return COLORS.yellow;
  return gray;
};

// Higher is better (inverse of thresholdColor): cache hit %.
const cacheHitColor = (pct: number) => {
  if (pct < THRESHOLDS.cacheCold) return COLORS.red;
  if (pct < THRESHOLDS.cacheWarm) return COLORS.yellow;
  return gray;
};

// ─── Section builders ───
function envLabelSection(): string {
  const label = process.env.WORK === "1" ? LABELS.work : LABELS.personal;
  return `${BOLD}${seg(gray, label.icon, label.text)}`;
}

function modelSection(input: Input): string {
  const name = input.model?.display_name ?? input.model?.id ?? "?";
  return seg(gray, ICONS.model, name);
}

const EFFORT_LABELS: Record<string, string> = {
  max: "max!!!!",
};

// Only xhigh and above are loud enough to warrant a warning color.
function effortSection(input: Input): string | null {
  const level = input.effort?.level;
  if (!level) return null;
  const body = EFFORT_LABELS[level] ?? level;
  if (level === "max" || level === "ultracode") {
    return `${BOLD}${seg(COLORS.yellow, ICONS.effort, body)}`;
  }
  if (level === "xhigh") return seg(COLORS.yellow, ICONS.effort, body);
  return seg(gray, ICONS.effort, body);
}

function over200kSection(input: Input): string | null {
  if (!input.exceeds_200k_tokens) return null;
  return seg(COLORS.red, ICONS.over200k, ">200k");
}

function locationSection(input: Input): string {
  // Worktree session: {worktree}:{branch}
  if (input.worktree?.name) {
    const worktree = truncate(input.worktree.name, WIDTHS.branch);
    const branch = input.worktree.branch
      ? `:${truncate(input.worktree.branch, WIDTHS.branch)}`
      : "";
    return seg(gray, ICONS.worktree, `${worktree}${branch}`);
  }

  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();
  const branch = gitBranch(cwd);
  if (branch) return seg(gray, ICONS.branch, truncate(branch, WIDTHS.branch));

  const base = cwd.split(sep).filter(Boolean).pop() ?? cwd;
  return seg(gray, ICONS.folder, truncate(base, WIDTHS.dir));
}

function cwdSection(input: Input): string {
  const cwd = resolve(
    input.workspace?.current_dir ?? input.cwd ?? process.cwd(),
  );
  const name =
    cwd === HOME ? "~" : (cwd.split(sep).filter(Boolean).pop() ?? cwd);
  return seg(gray, ICONS.cwd, truncate(name, WIDTHS.dir));
}

function contextSection(input: Input): string {
  const raw = input.context_window?.used_percentage;
  const size = formatWindow(input.context_window?.context_window_size);
  const suffix = size ? ` (${size})` : "";
  if (raw == null) return seg(gray, ICONS.context, `—%${suffix}`);
  const pct = Math.floor(raw);
  return seg(thresholdColor(pct), ICONS.context, `${pct}%${suffix}`);
}

function formatWindow(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `${millions % 1 === 0 ? millions : millions.toFixed(1)}m`;
  }
  return `${Math.round(n / 1000)}k`;
}

function fiveHourSection(input: Input): string | null {
  const limit = input.rate_limits?.five_hour;
  if (!limit) return null;
  const pct = limit.used_percentage;
  const remaining = limit.resets_at ? remainingMs(limit.resets_at) : null;
  if (pct == null && remaining == null) return null;
  const pctText = pct == null ? "—%" : `${Math.floor(pct)}%`;
  const remainingText = remaining == null ? "" : ` (${formatHM(remaining)})`;
  const color = pct == null ? gray : thresholdColor(pct);
  return seg(color, ICONS.fiveHour, `${pctText}${remainingText}`);
}

function sevenDaySection(input: Input): string | null {
  const limit = input.rate_limits?.seven_day;
  if (!limit) return null;
  const pct = limit.used_percentage;
  const remaining = limit.resets_at ? remainingMs(limit.resets_at) : null;
  if (pct == null && remaining == null) return null;
  const pctText = pct == null ? "—%" : `${Math.floor(pct)}%`;
  const remainingText = remaining == null ? "" : ` (${formatDH(remaining)})`;
  const color = pct == null ? gray : thresholdColor(pct);
  return seg(color, ICONS.sevenDay, `${pctText}${remainingText}`);
}

function cacheHitSection(input: Input): string | null {
  const usage = input.context_window?.current_usage;
  if (!usage) return null;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const fresh = usage.input_tokens ?? 0;
  const total = cacheRead + cacheCreate + fresh;
  const hit = total > 0 ? Math.round((cacheRead / total) * 100) : 0;
  return seg(cacheHitColor(hit), ICONS.cacheHit, `${hit}%`);
}

// ─── Time helpers ───
function remainingMs(resetsAtSec: number): number {
  const remaining = resetsAtSec * 1000 - Date.now();
  return remaining > 0 ? remaining : 0;
}

function formatHM(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}m`;
}

function formatDH(ms: number): string {
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d${hours}h`;
}

// ─── Git ───
function gitBranch(cwd: string): string | null {
  // Walk up from cwd for .git (dir or file = worktree pointer)
  let dir = resolve(cwd);
  while (true) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) return readBranchFromGit(gitPath);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readBranchFromGit(gitPath: string): string | null {
  // `.git` can be a file (worktree/submodule pointer): "gitdir: /path/to/actual"
  const content = safeRead(gitPath);
  const headPath =
    content && content.startsWith("gitdir:")
      ? join(content.replace("gitdir:", "").trim(), "HEAD")
      : join(gitPath, "HEAD");
  const head = safeRead(headPath);
  if (!head) return null;
  const ref = head.match(/ref: refs\/heads\/(.+)/);
  if (ref && ref[1]) return ref[1].trim();
  return head.trim().slice(0, 7);
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// ─── Layout ───
const ANSI = /\x1b\[[0-9;]*m/g;

// Printable width of a segment: escape sequences occupy no cells, and the
// Nerd Font glyphs in use are single-width in a patched mono font.
const visibleWidth = (segment: string) =>
  [...segment.replace(ANSI, "")].length;

function terminalColumns(): number {
  if (process.stdout.columns && process.stdout.columns > 0) {
    return process.stdout.columns;
  }
  const envColumns = parseInt(process.env.COLUMNS ?? "", 10);
  if (envColumns > 0) return envColumns;
  try {
    const probe = Bun.spawnSync({
      cmd: ["sh", "-c", "stty size < /dev/tty 2>/dev/null"],
    });
    const size = (probe.stdout?.toString().trim() ?? "").split(/\s+/);
    const columns = Number(size[1]);
    if (columns > 0) return columns;
  } catch {}
  return WIDTHS.fallbackColumns;
}

// Greedily pack segments into lines that fit the terminal width. A segment
// wider than the whole line gets its own line rather than being dropped.
function wrap(segments: Array<string>, columns: number): string {
  const lines: Array<string> = [];
  let line = "";
  let lineWidth = 0;

  for (const segment of segments) {
    const width = visibleWidth(segment);
    if (lineWidth === 0) {
      line = segment;
      lineWidth = width;
      continue;
    }
    if (lineWidth + SEPARATOR_WIDTH + width <= columns) {
      line += SEPARATOR + segment;
      lineWidth += SEPARATOR_WIDTH + width;
    } else {
      lines.push(line);
      line = segment;
      lineWidth = width;
    }
  }
  if (lineWidth > 0) lines.push(line);

  return lines.join("\n");
}

// ─── Main ───
async function main() {
  const raw = await Bun.stdin.text();
  const input: Input = raw.trim() ? JSON.parse(raw) : {};

  const sections: Array<string | null> = [
    envLabelSection(),
    modelSection(input),
    effortSection(input),
    cwdSection(input),
    locationSection(input),
    contextSection(input),
    over200kSection(input),
    fiveHourSection(input),
    sevenDaySection(input),
    cacheHitSection(input),
  ];

  const columns = terminalColumns() - WIDTHS.safetyMargin;
  process.stdout.write(wrap(sections.filter(Boolean) as Array<string>, columns));
}

main().catch((err) => {
  process.stderr.write(String(err));
  process.exit(1);
});
