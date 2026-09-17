import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type HunkReviewNote = {
  noteId: string;
  filePath: string;
  hunkIndex?: number;
  oldRange?: [number, number];
  newRange?: [number, number];
  body: string;
  title?: string;
};

type ReviewRun = {
  exitCode: number | null;
  sawLiveSession: boolean;
  comments: HunkReviewNote[];
};

const EMPTY_COMPONENT = {
  render: () => [],
  invalidate: () => {},
};

function runHunk(args: string[], cwd: string, stdio: "inherit" | "pipe") {
  return new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const child = spawn("hunk", args, { cwd, stdio });
    let stdout = "";

    if (stdio === "pipe") {
      child.stdout?.on("data", (chunk: Buffer) => {
        // Session JSON is intentionally small. Avoid accumulating unexpected output forever.
        if (stdout.length < 1_000_000) stdout += chunk.toString();
      });
    }

    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout }));
  });
}

async function readHumanComments(cwd: string): Promise<HunkReviewNote[] | undefined> {
  try {
    const result = await runHunk(
      ["session", "comment", "list", "--repo", cwd, "--type", "user", "--json"],
      cwd,
      "pipe",
    );
    if (result.code !== 0) return undefined;

    const parsed = JSON.parse(result.stdout) as { comments?: unknown };
    if (!Array.isArray(parsed.comments)) return undefined;

    return parsed.comments.filter(isHunkReviewNote);
  } catch {
    // The session is unavailable until Hunk registers it and after it quits.
    return undefined;
  }
}

function isHunkReviewNote(value: unknown): value is HunkReviewNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.noteId === "string" &&
    typeof note.filePath === "string" &&
    typeof note.body === "string"
  );
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function runReview(cwd: string): Promise<ReviewRun> {
  let polling = true;
  let sawLiveSession = false;
  let comments: HunkReviewNote[] = [];

  const monitor = (async () => {
    while (polling) {
      const latest = await readHumanComments(cwd);
      if (latest) {
        sawLiveSession = true;
        comments = latest;
      }
      if (polling) await wait(250);
    }
  })();

  let exitCode: number | null = null;
  try {
    exitCode = (await runHunk(["diff"], cwd, "inherit")).code;
  } finally {
    polling = false;
    await monitor;
  }

  // Build this after the monitor stops so a final in-flight read is included.
  return { exitCode, sawLiveSession, comments };
}

function formatComment(comment: HunkReviewNote) {
  const target = comment.newRange
    ? `new lines ${comment.newRange[0]}–${comment.newRange[1]}`
    : comment.oldRange
      ? `old lines ${comment.oldRange[0]}–${comment.oldRange[1]}`
      : `hunk ${(comment.hunkIndex ?? 0) + 1}`;
  const title = comment.title ? `${comment.title}: ` : "";
  return `- ${comment.filePath} (${target}): ${title}${comment.body}`;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hunk-review", {
    description: "Review the working-tree diff in Hunk and send saved human comments to the agent",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/hunk-review requires Pi's interactive terminal UI.", "error");
        return;
      }
      if (args.trim()) {
        ctx.ui.notify("/hunk-review takes no arguments; it always runs `hunk diff`.", "warning");
        return;
      }

      const review = await ctx.ui.custom<ReviewRun>((tui, _theme, _keybindings, done) => {
        // Let Pi render this temporary component once before giving the terminal to Hunk.
        setTimeout(() => {
          void (async () => {
            tui.stop();
            let result: ReviewRun;
            try {
              result = await runReview(ctx.cwd);
            } catch (error) {
              result = { exitCode: null, sawLiveSession: false, comments: [] };
              ctx.ui.notify(
                `Could not start Hunk: ${error instanceof Error ? error.message : String(error)}`,
                "error",
              );
            } finally {
              tui.start();
              tui.requestRender(true);
            }
            done(result);
          })();
        }, 0);
        return EMPTY_COMPONENT;
      });

      if (review.exitCode !== 0) {
        ctx.ui.notify("Hunk did not exit normally; no review result was sent to the agent.", "warning");
        return;
      }
      if (!review.sawLiveSession) {
        ctx.ui.notify(
          "Hunk closed before its live session could be read; no approval was sent to the agent.",
          "warning",
        );
        return;
      }

      if (review.comments.length === 0) {
        pi.sendUserMessage(
          "Hunk review completed. The reviewer added no comments, so the diff is approved.",
        );
        return;
      }

      pi.sendUserMessage(
        [
          "Hunk review completed with the following human review comments. Treat them as user feedback and address them appropriately:",
          "",
          ...review.comments.map(formatComment),
        ].join("\n"),
      );
    },
  });
}
