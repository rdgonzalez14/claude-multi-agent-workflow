---
name: report-format
description: Defines the exact structure for the quality report produced by /assess-quality, combining code-reviewer and test-coverage findings into one concise document. Load this before writing that report so its structure and level of detail stay consistent every run — this format is also what the qa-plugin log hook expects to find when it archives the report to development-logs/.
---

Produce the report as Markdown with exactly this structure:

```
# Quality assessment — <one-line verdict>

## Review findings
<findings from code-reviewer, or "No issues found.">

## Test coverage
<findings from test-coverage, or "No coverage gaps found.">

## Next steps
<only include this section if something needs a human decision>
```

Rules:

- **Verdict line** — one short phrase in the title, e.g. "Ready to merge", "Needs fixes before merging", "Minor issues only". Pick the one that matches the overall severity of what both subagents found.
- **Review findings** — one bullet per finding: `- **file:line** — what's wrong. Why it matters.` Keep it to one or two lines. Only expand into a sub-bullet with more detail (a short snippet, the concrete failure scenario, or a suggested fix) for findings that are actually important: correctness bugs, security issues, or anything that would break in production. Don't add extra detail to minor style notes.
- **Test coverage** — one bullet per gap found and the test added to close it: `- **file** — what was untested; added <test name/description>.` If a gap couldn't be closed (e.g. it needs a design decision), say so instead of a test name.
- **Missing findings** — if a subagent found nothing, say so in one line (`No issues found.` / `No coverage gaps found.`) rather than omitting the section entirely.
- **Next steps** — omit this section completely if there's nothing left needing a human decision. Don't include it just to say "none."
- Keep the whole report scannable in under a minute; the detail expansions are the only place it's allowed to get longer.
