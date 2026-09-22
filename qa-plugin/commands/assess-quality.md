---
description: Assess the quality of code changes by running a review and a test-coverage check in parallel, then produce a consolidated report.
argument-hint: [optional path or description of what to assess — defaults to the current uncommitted changes]
---

Assess the quality of $ARGUMENTS (if empty, use the current uncommitted changes — check `git status` / `git diff` to scope this).

## Step 1 — Parallel analysis

Launch both of these subagents **at the same time, in a single message with two tool calls**, since they are independent of each other:

- `code-reviewer` — review the target code for correctness, readability, security, and consistency with existing patterns in the repo. It is read-only and will only report findings.
- `test-coverage` — check the target code for missing test coverage and write the tests needed to close any gaps it finds.

Wait for both to finish before continuing. Do not start Step 2 until you have both results.

## Step 2 — Consolidated report (depends on Step 1)

Once both subagents have returned, use the `report-format` skill to produce a single, concise quality report that combines their findings. Follow that skill's structure exactly.
