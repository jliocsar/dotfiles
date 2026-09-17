---
name: implement
description: Execute phase files from tmp/phases/<slug>/ one at a time through an interactive API → call graph → red/green → review → commit loop.
disable-model-invocation: true
---

Execute one phase at a time from `tmp/phases/<slug>/`, gated on the user at every step.

Read only the phase you are working on. Never load the whole directory into context.

`/implement <slug>` picks the first file whose frontmatter says `status: pending`. `/implement <slug> 03` picks that phase. With no `<slug>`, list the directories under `tmp/phases/` and ask. If there are no phase files, say so and suggest `/phases` — do not improvise a breakdown.

## The loop, per phase

```
A  APIs, interfaces, types      ⏸ iterate until approved
B  call graph                   ⏸ iterate until approved
C  tests → red → green → review ⏸ iterate until approved
D  commit → halt
```

Every ⏸ is a hard stop. You do not write product code before A and B are approved. You do not commit before C is approved. You do not start the next phase after D.

### Gate A — the contract

Two things, in one message.

**The API**, as a depth-1 call graph: the entry point and its direct callees only, with types. This is the boundary the phase exposes.

**The interfaces**, as real declarations in the repository's language — actual TypeScript, Rust, Go, whatever it is. Not pseudocode, not a diagram. This is the code the user is approving.

**The test graph**, using the template below, unless the phase frontmatter says `tests: false` — in which case omit it and say nothing about it.

Iterate until approved.

### Gate B — the shape

The full call graph for the phase, using the template below, depth 3 below the entry point. Types on nodes.

Iterate until approved. Append the approved graph and the Gate A interfaces to the phase file before moving on.

### Gate C — the code

1. Write the tests from the approved test graph. Run them. Confirm they fail, and confirm they fail for the reason you expect rather than a typo or a missing import. Report the red output.
2. Implement against the approved call graph until they pass.
3. Run the full suite. Tests outside this phase must stay green; if one breaks, that is part of this phase's work.
4. Invoke `plannotator-review` so the user reviews tests and implementation as one diff.

Then apply the feedback and re-review until approved.

### Gate D — commit

Commit the phase. The message describes the work in this phase and follows the pattern already in `git log` — match its format, prefix convention, and tone rather than imposing one.

Set `status: done` and record the sha in the phase frontmatter. Then stop. Do not push. Do not open the next phase. The user decides when to continue, usually after a `/clear`.

## When to re-render

Feedback at any gate, and discoveries you make mid-implementation, fall into two buckets.

**Re-render the graph** when the set of nodes or edges changes: a function added, removed, renamed, or moved to another file; a caller pointed somewhere new; a signature or type changed. If reality forces this on you while implementing, stop and re-render rather than quietly diverging from the approved shape.

**Say nothing and carry on** when only the inside of a node changes: values, error messages, local names, ordering within a body, formatting. Re-rendering an unchanged graph wastes the user's attention.

## Templates

Both graphs are rendered as diffs: a fenced block tagged `diff`, so the gutter is the diff marker itself and the renderer colours it. `+` add, `!` change, `-` remove, space unchanged. Marker plus its space makes the gutter two characters wide, which keeps the tree art aligned.

**If a graph has no `!` and no `-` nodes, drop the gutter and tag the block `text` instead.** A wall of green carries no information. This is a mechanical rule, not a judgement call — new features render clean, changes render as a diff, and a phase that adds a file while rerouting an existing caller renders as a diff because the reroute is the interesting part.

Paths appear only on `+`, `!` and `-` nodes; unchanged nodes are context and do not need one. Third-party and standard-library leaves collapse to `(external)` with no children.

```diff
phase 2 — rate limit the order endpoint
entry  POST /orders → handleOrder()

  handleOrder(req: OrderRequest) → Promise<Result<Order>>
  ├─ validateBody(raw: unknown) → OrderRequest
+ ├─ checkRateLimit(key: string) → Promise<RateVerdict>     api/ratelimit.ts (new)
+ │  └─ redis.incr()                                        (external)
  └─ persistOrder(o: Order) → Promise<Row>
!     ├─ buildRow(o: Order, tenantId: TenantId) → Row       db/orders.ts:96
-     └─ rawInsert(row: Row) → Promise<void>                db/raw.ts:12
+     └─ insertWithRetry(row: Row) → Promise<Row>           db/orders.ts (new)
```

Same tree, gutter dropped, for a phase that only adds:

```text
phase 1 — csv export pipeline
entry  exportCsv()

exportCsv(q: Query) → Promise<Stream>
├─ fetchRows(q: Query) → AsyncIterable<Row>
└─ writeStream(rows: AsyncIterable<Row>) → Stream
```

The test graph is the same shape and the same markers, with suites as parents and test names as leaves. Names and scopes only — the assertions show up at Gate C.

```diff
phase 2 — rate limit the order endpoint
suite  api/orders.test.ts

  checkRateLimit()
+ ├─ allows a request under the limit
+ ├─ rejects over-limit with 429
+ └─ resets the window after ttl
  handleOrder()
  ├─ rejects an invalid body
! └─ surfaces 429 from the limiter
```
