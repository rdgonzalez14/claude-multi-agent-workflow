# NOTES

## What the plugin does

`qa-plugin` runs a quality assessment over a set of code changes: a read-only review for correctness, readability, security, and consistency with existing patterns, plus an automated pass that finds untested behavior and writes tests to close the gaps. Both results are combined into one consolidated Markdown report, and a hook archives that report to `development-logs/` in the target repo whenever the workflow completes.

## How to install

```
/plugin marketplace add <this-repo>
/plugin install qa-plugin@qa-plugin-marketplace
```

For local development instead, load it straight from a checkout: `claude --plugin-dir .` from the repo root, then run `/reload-plugins` after each edit.

Once installed, run `/qa-plugin:assess-quality` (or `/assess-quality` if unambiguous) against a set of changes — by default it scopes to the current uncommitted diff, or pass a path/description as an argument.

## Scoping decision: why `code-reviewer` is read-only and `test-coverage` isn't

`code-reviewer` is restricted to `Read, Grep, Glob` on purpose. Its whole job is to produce a written assessment of code someone else wrote — correctness, security, consistency — and a reviewer that can also edit files invites it to silently "fix" things instead of surfacing them as findings for a human to weigh. Keeping it read-only forces every issue it finds into the report, which is what actually gets read and acted on.

`test-coverage`, by contrast, needs `Edit, Write, Bash` in addition to the read/search tools, because its job isn't to report — it's to close gaps by writing new test files and running the suite to confirm they pass. Withholding write access would turn it into just another reviewer, duplicating `code-reviewer`'s job instead of doing its own. The model split follows the same logic: `code-reviewer` uses `opus` because judging correctness, security, and "does this match the existing pattern" across a diff benefits from stronger reasoning, while `test-coverage` uses `sonnet` since writing tests that follow an already-identified pattern is a more mechanical task.

## Orchestration decision: why `/assess-quality` runs Step 1 in parallel and Step 2 sequentially

Step 1 launches `code-reviewer` and `test-coverage` together, in a single message, because they're independent — the review doesn't need to know what tests get written, and the tests don't need to know what the reviewer flagged. Running them in parallel halves the wall-clock time for what would otherwise be two sequential subagent calls doing unrelated work.

Step 2 (the consolidated report, via the `report-format` skill) has to wait for both subagents to finish, since it summarizes both sets of findings into a single document — there's nothing to consolidate until both results exist. That's a genuine dependency, not an arbitrary ordering choice, so it runs strictly after Step 1 completes.
