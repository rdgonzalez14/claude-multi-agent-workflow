# qa-plugin

A Claude Code plugin that assesses the quality of code changes before they're committed — a read-only review, an automated test-coverage pass, and a consolidated report — bundled together with a marketplace so it can be installed by name.

This repo is two things at once:
1. **The plugin itself** (`.claude-plugin/`, `agents/`, `commands/`, `skills/`, `hooks/`).
2. **The marketplace that offers it** (`.claude-plugin/marketplace.json`), so it installs with `/plugin install`.

`course-api/` is a small Express API included only as a target codebase for the plugin to operate on — it is not part of the plugin.

## What's included

- **`agents/code-reviewer.md`** — read-only subagent (`Read, Grep, Glob`) that reviews code for correctness, readability, security, and consistency with existing patterns.
- **`agents/test-coverage.md`** — writing subagent (`Read, Grep, Glob, Edit, Write, Bash`) that finds untested behavior, writes the missing tests, and runs the suite.
- **`commands/assess-quality.md`** — the `/assess-quality` workflow: runs `code-reviewer` and `test-coverage` in parallel, then (once both finish) produces a consolidated report using the `report-format` skill.
- **`skills/report-format/SKILL.md`** — defines the exact Markdown structure for the consolidated quality report.
- **`hooks/hooks.json`** — a `Stop` hook that archives the report `/assess-quality` produced to `development-logs/` in the target repo, via a bundled script referenced through `${CLAUDE_PLUGIN_ROOT}`.

See `NOTES.md` for install steps, a scoping decision, and an orchestration decision.

## Local testing

```bash
cd course-api && npm install   # once, to prepare the target codebase
claude --plugin-dir .          # from the repo root
```

After edits, run `/reload-plugins` rather than restarting. Verify each component fires under its namespaced name (`/qa-plugin:assess-quality`, etc.) and that the workflow drives the subagents in the right order.

## Installing from the marketplace

```
/plugin marketplace add <this-repo>
/plugin install qa-plugin@qa-plugin-marketplace
```
