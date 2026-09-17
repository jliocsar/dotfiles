---
name: phases
description: Break one task into reviewed implementation phases and write them to tmp/phases/<slug>/ for /implement to execute.
disable-model-invocation: true
---

Turn one task into a set of phase files that `/implement` executes later, one phase at a time.

You do not write or modify product code in this skill. You read, you ask, you plan, you write phase files.

The plan that produced this task is not your concern — it may live in a handoff file, a ticket, or just this conversation. Take the task as given.

## 1. Intake

Read the task from wherever the user pointed you. Then explore the codebase until you can name the files the change lands in, the existing patterns it must follow, and the seams it crosses.

Then ask every clarifying question in **one numbered block**. Ask about anything the task and the codebase leave genuinely ambiguous — behaviour under edge cases, which existing pattern wins when two conflict, what is explicitly out of scope. Do not ask what you can determine by reading. Do not drip-feed questions across several messages.

Stop and wait for answers.

## 2. Propose the breakdown

Present the phases as a numbered list, each with a one-line goal and a one-line reason it is its own phase. No code, no call graphs — that is `/implement`'s job.

A phase is correct when it is independently reviewable and independently committable, and when a reviewer can tell from the goal alone whether it succeeded. Prefer fewer, larger phases over many trivial ones; a phase that cannot be described without "and also" is two phases.

Stop and wait. Iterate on the breakdown until the user approves it. Write nothing to disk before approval.

## 3. Write the files

On approval, write one file per phase:

```
tmp/phases/<slug>/01-<name>.md
tmp/phases/<slug>/02-<name>.md
```

`<slug>` comes from the ticket id when there is one (`jc-123-rate-limits`), otherwise from the task. Ordering comes from the numeric prefix; there is no index file.

Each file:

```markdown
---
status: pending
tests: true
---

# Phase 1 — <goal in one line>

## Scope
In:  <what this phase changes>
Out: <what it deliberately does not touch>

## Files
<paths you expect to touch, with a word on each>

## Depends on
<earlier phase numbers, or "nothing">

## Done when
<observable outcome a reviewer can check>

## Decisions
<answers from intake that this phase depends on>
```

Set `tests: false` when the repository has no test infrastructure — `/implement` then skips the test graph without mentioning it. Do not propose standing up a test harness unless the user asks.

Leave the rest of the file empty. `/implement` appends the approved interfaces and call graph to it as each gate passes, so a resumed session does not re-litigate settled design.

Tell the user the directory you wrote and stop. Do not start implementing.
