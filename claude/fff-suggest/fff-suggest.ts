// Claude Code `fileSuggestion` command: replaces the built-in @ mention
// file search with fff (typo-resistant, frecency-ranked).
//
// Contract (reverse-engineered from the 2.1.209 bundle):
//   stdin:  JSON { query, cwd, session_id, ... }
//   stdout: newline-separated file paths (top 15 are shown)
//   budget: 5s timeout, exit 0 required
import { FileFinder } from "@ff-labs/fff-bun";

const MAX_RESULTS = 15;
const SCAN_TIMEOUT_MS = 4000; // stay under Claude Code's 5s kill

const input = (await Bun.stdin.json()) as { query?: string; cwd?: string };
const basePath = input.cwd ?? process.cwd();
const query = input.query ?? "";

const created = FileFinder.create({
  basePath,
  // One-shot process: watcher and content index are pure startup cost here.
  disableWatch: true,
  disableContentIndexing: true,
  disableMmapCache: true,
});
if (!created.ok) {
  // No output = no suggestions; never fail the picker.
  process.exit(0);
}
const finder = created.value;

const scanned = await finder.waitForScan(SCAN_TIMEOUT_MS);
if (scanned.ok) {
  const result = finder.fileSearch(query, { pageSize: MAX_RESULTS });
  if (result.ok) {
    const paths = result.value.items.map(
      (item) => item.relativePath,
    );
    if (paths.length > 0) console.log(paths.join("\n"));
  }
}
finder.destroy();
process.exit(0);
