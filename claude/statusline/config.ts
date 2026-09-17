// ─────────────────────────────────────────────────────────────
// Statusline config — edit icons, colors, thresholds, widths.
// Palette is intentionally monochrome: everything is gray/dimmed
// except warning states, which use yellow (warn) and red (danger).
// ─────────────────────────────────────────────────────────────
// ─── Colors (24-bit truecolor) ───
// Fixed palette: the same gray reads on both light and dark backgrounds,
// so there is no theme lookup here.
const rgb = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;

export const COLORS = {
  reset: "\x1b[0m",
  // Delta One palette: text.placeholder / warning / deleted from Delta's
  // bundled theme (reads on both Delta One Light #fafafa and Dark #191c1f).
  gray: rgb(0x87, 0x8a, 0x98), // #878a98 — everything that is not a warning
  yellow: rgb(0xde, 0xc1, 0x84), // warn
  red: rgb(0xd0, 0x72, 0x77), // danger
  // Zenbones palette:
  // gray: rgb(0x88, 0x8f, 0x94), yellow: rgb(0xc2, 0xb4, 0x74), red: rgb(0xc4, 0x77, 0x68)
};

export const SEPARATOR = ` ${COLORS.gray}•${COLORS.reset} `;
// Visible width of SEPARATOR, used by the wrapping layout.
export const SEPARATOR_WIDTH = 3;

export const BOLD = "\x1b[1m";

// ─── Icons (Nerd Font) ───
// Swap for any icon you prefer. Leave empty string "" to drop the icon.
export const ICONS = {
  model: "󱚤",
  folder: "",
  branch: "",
  worktree: "",
  context: "󱇛",
  fiveHour: "",
  sevenDay: "󰃮",
  cwd: "",
  effort: "", // nf-md-brain
  over200k: "", // nf-fa-warning
  cacheHit: "󱐋",
  // Env labels
  work: "",
  personal: "󰀄",
};

export const LABELS = {
  work: { icon: ICONS.work, text: "Work" },
  personal: { icon: ICONS.personal, text: "Personal" },
};

// ─── Thresholds (percent) ───
// Usage %: <=warn → gray, <=danger → yellow, > → red
// Cache hit %: <cold → red, <warm → yellow, >=warm → gray
export const THRESHOLDS = {
  warn: 60,
  danger: 85,
  cacheCold: 50,
  cacheWarm: 80,
};

// ─── Widths (chars) ───
export const WIDTHS = {
  branch: 30,
  dir: 25,
  // Columns kept free at the end of each rendered line, so a slightly
  // off terminal width estimate never forces a hard wrap.
  safetyMargin: 4,
  // Used when the terminal width can't be detected.
  fallbackColumns: 80,
};

export const ELLIPSIS = "…";
