# Design

The visual spec for the app. Source of truth is `tmp/prototypes/notes.html`
(the "Ledger" variant, `?v=1`); this file is the readable version of it.
Applies to every section (Notes, Meeting Notes, Tasks, Artifacts). Notes is the
reference implementation.

Feel: monochrome, Linear density, soft 6px radius, serif titles, mono body, sans UI.
Motion is feedback only. Nothing fades in.

## Tokens

Names follow shadcn/basecoat so they drop into `styles/app.css` after the
`basecoat-css/mira` import and override it. Mira is the dense pack that
honours `--radius`: buttons, rows and tabs get `radius-md` (6px), the tab
track and code blocks `radius-lg` (8px), kbd and inline code `radius-sm` (4px).

| token | light | dark |
| --- | --- | --- |
| `--background` | `#fcfcfc` | `#0f0f0f` |
| `--foreground` | `#161616` | `#ededed` |
| `--muted` (hover bg, code bg, segmented track) | `#f2f2f2` | `#222222` |
| `--muted-foreground` (dates, meta, ghost buttons) | `#767676` | `#8a8a8a` |
| `--subtle-foreground` (group labels, status, dot) | `#a3a3a3` | `#5c5c5c` |
| `--border` | `#e6e6e6` | `#2c2c2c` |
| `--input` (outline button, selected tab in dark) | `#e6e6e6` | `#3a3a3a` |
| `--border-strong` (blockquote rule, link underline) | `#d0d0d0` | `#333333` |
| `--accent` / `--accent-foreground` (solid button) | `#161616` / `#fcfcfc` | `#ededed` / `#0f0f0f` |
| `--ring` (focus outline) | `#161616` | `#ededed` |
| `--radius` | `8px` | `8px` |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | |

Dark mode: basecoat's `.dark` class on `<html>`, set by `window.basecoat.theme`
(persisted in `localStorage.themeMode`, falling back to `prefers-color-scheme`
via the inline boot script in `Layout.tsx`). Basecoat sets `color-scheme` so
native controls, scrollbars and shiki's `light-dark()` follow.

In the implementation, `--subtle-foreground` is `text-muted-foreground/60` and
`--border-strong` is `border-foreground/20`; no extra tokens are declared.
Dark `--muted` / `--border` / `--input` sit higher than the prototype's
(`#1a1a1a` / `#232323`) because basecoat paints the selected tab and outline
buttons with translucent `--input`, which needs the extra lift to read.
A `.kbd` inside the New button adds `dark:bg-foreground/10` for the same
reason.

Selection is inverted: `::selection { background: foreground; color: background }`.

No other colors. No shadows except the 1px ring under the active segmented tab.

## Type

| role | family | fallback |
| --- | --- | --- |
| `--font-sans` — all UI chrome | Inter 400/500/600 | `ui-sans-serif, system-ui` |
| `--font-serif` — page and note titles, markdown headings | Newsreader 400/500 (opsz axis) | `ui-serif, Georgia` |
| `--font-mono` — note body, source and preview, excerpts | IBM Plex Mono 400/500 | `ui-monospace, Menlo` |

Body default: sans 13px / 1.5, `-webkit-font-smoothing: antialiased`.

| element | size | weight | line-height | notes |
| --- | --- | --- | --- | --- |
| page h1 ("Notes", note title) | 34px serif | 400 | 1.15 | `letter-spacing: -0.01em`, 10px below |
| markdown h2 | 22px serif | 500 | — | margin `1.6em 0 0.4em` |
| markdown h3 | 18px serif | 500 | — | margin `1.4em 0 0.3em` |
| note body (textarea + rendered) | 14px mono | 400 | 1.75 | `tab-size: 2` |
| code block | 13px mono | 400 | 1.6 | `--muted` bg, `12px 14px` padding |
| inline code | 0.92em mono | — | — | `--muted` bg, `0.1em 0.35em` padding |
| list row title | 13.5px sans | 400 | — | ellipsis, one line |
| row date, meta row, "Edited Sep 9" | 12px sans | 400 | — | `--muted-foreground`, tabular nums |
| button label, back link | 12.5px sans | 500 | — | |
| segmented tab | 12px sans | 500 | — | |
| status ("Saving…", "Saved") | 11.5px sans | 400 | — | `--subtle-foreground`, tabular nums |
| month group label | 11px sans | 500 | — | uppercase, `letter-spacing: 0.08em`, `--subtle-foreground` |
| kbd | 10.5px sans | 500 | — | |

Dates are short: `Sep 9`, `Aug 28`. No year until it differs from the current one.

## Layout

Every page is one column, `max-width: 1000px`, centered, padding
`40px 32px 96px`. Structure is identical on list and note pages so navigation
never shifts the frame:

```
crumbs   26px tall, flex space-between, 40px below
h1       34px serif, 10px below
meta     min-height 42px, 1px --border bottom, 24px below
content
```

**crumbs** — left: a back link (`← Home` on the list, `← Notes esc` on a note).
Right: an `.actions` cluster, 4px gap. On the list it's only the theme toggle.
On a note it's only the theme toggle.

**meta** — sans 12px `--muted-foreground`, items separated by 10px and a 3px
`.dot` (`--subtle-foreground`, the only round thing in the app). A trailing
`.end` cluster is pushed to the far edge with `margin-left: auto`, 6px gap.

- list: `[archive Archived] · 9 notes · Newest first` … `[+ New  n]` (outline with `border-transparent`)
- note: `Edited Sep 9` … `[status] [Source | Preview] [trash]`

## Notes list

Rows grouped by month. Group label sits `22px 0 6px` (no top padding on the
first). Row:

- `display: grid; grid-template-columns: 1fr auto; gap: 16px`
- 34px tall, 1px `--border` rule along the bottom drawn as an `::after`
  inset 8px on each side, so it lines up with the meta divider and ignores the
  row's radius
- horizontal padding 8px with `margin: 0 -8px` so text stays flush with the
  frame while the hover background bleeds past it
- title left, date right
- hover and `:active`: `--muted` background, 120ms `ease`. Hover only under
  `(hover: hover) and (pointer: fine)`
- focus: 2px `--ring` outline, offset -2px
- Untitled notes render the literal word `Untitled` in the normal foreground.
  No italics, no dimming

Empty list shows a single group label reading `Nothing yet`.

## Note page

Title is the h1, but it's a borderless `<input>` inside it (`font: inherit`,
transparent, no outline, placeholder `Untitled`), so clicking the title edits
it in place on every entry type. Enter and Escape blur. It saves on the same
idle / blur rule as the body and updates `document.title`. Meta holds the date
and the editing controls. Body follows directly, no extra rule.

Default view is **Preview**. A freshly created note opens in **Source** because
its body is empty. The two views share the `.body` box; the inactive one is
`display: none`, no transition.

Source is the CodeMirror editor styled to inherit `.body` (mono 14px / 1.75, no
gutter, no outline). Textarea fallback `min-height: 60vh`, placeholder
`Start typing. The first line becomes the title.`

Preview is `.markdown`: paragraphs `0 0 1em`; lists have no bullets, each item
`padding-left: 1.4em` with an en dash `–` in `--muted-foreground` at `0.2em`;
links underline in `--border-strong` with `text-underline-offset: 3px`;
blockquote is a 1px `--border-strong` left rule, `1em` inset, text in
`--muted-foreground`.

Save status text lives in `.meta .end`, before the segmented control:
`Saving…` (`--muted-foreground`) then `Saved` (`--subtle-foreground`). Empty
when idle.

## Components

All chrome is sans. Every pressable thing scales to `0.97` on `:active`, 140ms
`--ease-out`.

**Button `.btn`** — 26px tall, `0 9px` padding, 6px gap, 12.5px/500, 1px
`--border`, 6px radius. Icon 14px, stroke 1.75, `currentColor`, paths copied
from lucide into `Icon.tsx` (what basecoat's own docs use). Every text button
leads with one: `plus` New, `archive` Archived, `code` Source, `eye` Preview,
`archive-restore` Unarchive, `trash` Delete.
Variants via `data-variant`:

- default: bordered, `--foreground`; hover `--muted` bg
- `ghost`: transparent border, `--muted-foreground`; hover `--muted` bg + `--foreground`
- `solid`: `--accent` bg + `--accent-foreground`; hover opacity 0.9
- `icon`: 26×26, no padding, no border, `--muted-foreground`. Used for theme
  toggle (sun) and delete (trash)

Transitions: `transform 140ms --ease-out, background-color 140ms ease,
border-color 140ms ease`. Focus: 2px `--ring` outline, 2px offset.

**Back link `.back`** — not a `.btn`. 26px tall, zero padding, 6px gap,
12.5px/500, `--muted-foreground`. Hover only changes color to `--foreground`,
120ms `ease`. Focus outline offset 4px. Carries an optional `.kbd` hint.

**Segmented control `.seg`** — `--muted` track, 2px padding, 2px gap. Tabs are
22px tall, `0 9px`, 12px/500, `--muted-foreground`. Selected tab: `--background`
fill, `--foreground` text, `0 1px 2px rgba(0,0,0,.08), 0 0 0 1px --border`
(dark: just `0 0 0 1px --border-strong`). Color 140ms `ease`. Roles:
`role=tablist` / `role=tab` + `aria-selected`.

**Kbd `.kbd`** — 18px tall, `0 5px`, 10.5px/500, `--muted-foreground`, 1px
`--border` with a 2px bottom edge, `--background` fill. Lowercase labels:
`esc`, `n`, `j`, `k`.

**Dot `.dot`** — 3×3px, `--subtle-foreground`, round.

## Motion

Frequency rule first: opening a note, going back, switching Source/Preview and
creating a note all happen many times a day, so they swap instantly. No
entrance, no stagger, no page fade.

What does animate, and only these:

| what | property | duration | easing |
| --- | --- | --- | --- |
| button / tab press | `transform: scale(0.97)` | 140ms | `--ease-out` |
| button hover | `background-color`, `border-color` | 140ms | `ease` |
| row hover | `background-color` | 120ms | `ease` |
| back link, tab, text hover | `color` | 120–140ms | `ease` |
| status text swap | `opacity` | 200ms | `ease` |

`prefers-reduced-motion: reduce` disables all of the above. Hover styles are
gated behind `(hover: hover) and (pointer: fine)`.

## Keyboard

| key | where | does |
| --- | --- | --- |
| `n` | anywhere outside a field | new note, opens in Source, focuses the editor |
| `esc` | in the editor | blurs |
| `esc` | on a note, outside a field | back to the list |
| `j` / `k` | on the list | move focus between rows |

Every keyboard action is instant.

## Home

`/` is the root every list's `← Home` points at. Same frame as every other
page; no back link, and the crumbs' right side holds the theme toggle and a
ghost `Sign out`.

- h1: today's date, long form (`Wednesday, September 16`), local clock.
- meta: the four section links separated by dots; `ctrl k` + `jump anywhere`
  flush right.
- content: two equal columns, 40px gap, one column under `sm`. Left is
  `Calendar` then `Recent`; right is `Open tasks` with `All N lists ↗`.

**Calendar** is a progress rail. Rows are 34px, `44px 8px 1fr auto` with a
12px column gap, no bottom rule. Mono 12px time on the left; a 1px vertical
rail drawn as `::before` at `left: 57px` spanning the full row height so rows
join into one line; a 7px pip in the 8px column with 4px left margin; title;
action. State per row, from the clock:

- past: rail `--foreground`, hollow pip (`--muted-foreground/40` border on
  `--background`), time and title `--muted-foreground`
- now: rail `--foreground` for the whole row, filled `--foreground` pip, time
  `--foreground`
- upcoming: rail `--border`, filled `--foreground` pip

Right side of a row: `Open note` ghost button when the event has a note,
`+ New note` ghost button on the in-progress event (posts to `/meetings`),
`in 2h` / `in 40m` in `--muted-foreground/60` for upcoming, nothing for past.
Empty: `Nothing on the calendar`. Events are mocked until calendar sync lands
(SPEC §3.2).

**Recent** is five entries across every section, newest first, list rows as on
the Notes list with `Section · Sep 15` on the right.

**Open tasks** is every unchecked task across non-archived lists: 30px rows,
native 14px checkbox, text, list title in muted on the right. Ticking posts
`/e/:slug/tasks/:index/done` and reloads; the checked row strikes its text.
Empty: `All done`.

## Not decided yet

- Deleting from the list is soft (archive, one click, no confirm). The
  `Archived` toggle in the meta row lists archived notes with `Unarchive` and
  `Delete`; hard delete confirms via a basecoat `alert-dialog` opened with
  invoker commands (`command="show-modal"`), no JS.
- Meeting Notes (`/meetings`) is the same `ListPage` / `EntryPage` as Notes,
  parameterised by a `Section` (`domain.ts`): path, heading, count noun. The
  `meeting` snapshot and calendar buttons from SPEC §3.2 aren't built yet.
- Tasks (`/tasks`) shares the list page. The entry page drops the
  `Source | Preview` tabs and renders the body as a checklist: 28px rows,
  native 14px checkbox with `accent-foreground`, then a borderless mono text
  input, plus a trailing empty row with placeholder `New task`. Done rows
  strike their text in `--muted-foreground`. The list row shows `2/4` before
  the date, in `--foreground` when everything is done.
- Sign in (`/login`) skips the frame: a 280px column centered in the viewport
  with the serif h1, a basecoat `.input` for the password, `Wrong password` in
  12px muted below it after a failure, and a full-width default `.btn`.
  `Sign out` lives on Home.
- Artifacts (`/artifacts`) shares the list page; `New` is a file picker styled
  as the same button and the row shows the size before the date. The entry
  page keeps the ghost title, puts `mime · size · Edited` in the meta row with
  `Open` / `Download` ghost buttons where the tabs would be, and renders the
  file below: `<img>` / `<iframe>` / `<video>` / `<audio>` capped at 75vh, or
  a dashed `No preview for {mime}` box. `Share` (link icon, count badge when
  links exist) sits before `Open` and toggles a native `popover` anchored to
  its bottom-right edge (CSS anchor positioning; unsupported browsers get it
  centred): 400px, 4px padding, active links as 32px rows — mono `/s/token`,
  `Expires Sep 23`, ghost `Copy` (→ `Copied`), icon `×` revoke — then a
  hairline and a pinned row with a `1h 1d 7d ∞` segmented radio group and a
  `New link` button. Empty state is one muted sentence. Creating or revoking
  reloads with the panel open. `esc` closes the panel first, then goes back.
