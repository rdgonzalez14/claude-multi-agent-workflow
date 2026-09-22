# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This repo is two things at once:
1. **A Claude Code plugin** that bundles a multi-agent workflow (subagents, a workflow command, a skill, and a hook).
2. **The marketplace that offers that plugin**, so it can be installed with `/plugin install`.

`course-api/` is a small Express API included purely as the target codebase the plugin's subagents and workflow operate on (review it, run its tests, etc.) — it is not itself part of the plugin.

## Plugin structure (to build)

- `.claude-plugin/plugin.json` — manifest with `name` and `version`. Only manifest files live inside `.claude-plugin/`; every other component folder sits at the repo root.
- `.claude-plugin/marketplace.json` — marketplace catalog listing the plugin (`name` must match `plugin.json`, `source: "./"`).
- `agents/` — scoped subagents. Each needs a `description` (naming when to use it), a body stating what to do and return, a `tools` line limited to what the job needs, and a `model` matched to the job's difficulty. At least one read-only agent and at least one that writes/edits.
- `commands/` — workflow command(s) that orchestrate the subagents, with at least one parallel step and one dependent (sequential) step.
- `skills/<name>/SKILL.md` — a skill fitting the plugin's theme.
- `hooks/hooks.json` — a hook fitting the plugin's theme. Any bundled script path must use `${CLAUDE_PLUGIN_ROOT}`, never a hardcoded absolute path.
- `README.md` — plugin documentation.
- `NOTES.md` — what the plugin does and how to install it, one scoping decision (why a subagent got the tools/model it did), and why the workflow command's steps run in parallel vs. sequence.

## Local testing

- `cd course-api && npm install` once to prepare the target codebase.
- Load the plugin from the repo root: `claude --plugin-dir .`
- After edits, run `/reload-plugins` to pick them up rather than restarting.
- Verify each component fires under its namespaced name, and that the workflow command drives the subagents in the correct order.
- Before publishing, test the full install path in a fresh session: `/plugin marketplace add <this repo>` then `/plugin install <plugin-name>@<marketplace-name>`.

## Validation

A **Validate plugin** GitHub Actions check runs on every push and checks: `plugin.json` validity and placement, at least two genuinely different subagents (one read-only, one write/edit) each with description/body/tools/model, a workflow command in `commands/`, a skill and hook with no hardcoded absolute paths, a valid `marketplace.json` whose `name` matches `plugin.json`, and the presence of `README.md` and `NOTES.md`.

## course-api (target codebase)

Small Express app used only as the thing the plugin's agents/commands operate against.

- Commands (run from `course-api/`): `npm run dev` (serve on :3000), `npm test` (Node's built-in test runner), `npm run lint` (ESLint over `server.js routes db tests`).
- `server.js` — entry point; builds the Express app, mounts routers under `/health` and `/users`, and only calls `.listen()` when run directly (so tests can `require()` the app without opening a port).
- `routes/` — one router file per resource (`users.js`, `health.js`).
- `db/store.js` — the only place data is held (in-memory array); every route reads/writes through its exported helpers (`listUsers`, `getUser`, `createUser`, `updateUser`, `reset`) rather than holding state itself. `reset()` restores the two seeded users and is used by tests to start clean each run.
- Conventions: validate input in the route, returning `400` on bad input and `404` when a record is missing; error responses are always JSON shaped `{ "error": "message" }`.
