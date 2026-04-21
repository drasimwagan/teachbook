# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Phases 1–3 implemented. v0.2.0 draft in CI with Phase 2 (Run pane);
Phase 3 (bi-directional editing) is post-v0.2 main-branch work.** The
engine is stable. The app ships 17 bundled notebooks (128 scenes) across
algorithms, physics, biology, electronics, chemistry, machine-learning,
and quantum. Streaming chat / generate / insert-step all work end-to-end.
Undo/redo, LaTeX, scene tweening, plugin system, and user library are in
place. Phase 2 added a Pyodide-backed Run pane: students execute the
notebook's Python in-browser, inject scene primitives as globals, and
save experiments as `.py` under `~/Teachbook/experiments/`.

Phase 3 adds drag-to-edit on `shape` and `label` primitives — pointer
updates the scene JSON in the source (with Undo). `src/lib/scene-edit.ts`
owns the surgical fence replacement; `SceneRenderer` owns drag state.

Not yet started: Phase 4 (test mode — teacher rubrics, student answers,
Claude grading). Current roadmap: [`docs/PLAN.md`](docs/PLAN.md).

## Documentation map

- [`README.md`](README.md) — front door, quickstart
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — how to use the app
- [`docs/NOTEBOOK_FORMAT.md`](docs/NOTEBOOK_FORMAT.md) — `.tbk` reference
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — for code contributors
- [`docs/PLUGIN_AUTHORING.md`](docs/PLUGIN_AUTHORING.md) — extending the engine
- [`docs/PLAN.md`](docs/PLAN.md) — roadmap and design decisions
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, PR flow

When a user asks about anything the docs cover, point them at the right
file. When the docs conflict with the code, trust the code and update the
docs in the same PR.

## Commands

```bash
pnpm install          # install JS deps (run once after clone)
pnpm dev              # vite dev server only (browser, no Tauri shell)
pnpm tauri dev        # full desktop app in dev mode — USE THIS
pnpm build            # type-check + build frontend to dist/
pnpm tauri build      # native installer in src-tauri/target/release/bundle/

# Rust type-check
cargo check --manifest-path src-tauri/Cargo.toml

# Scene JSON validation across all notebooks
node --input-type=module -e '
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
for (const f of readdirSync("notebooks").filter(n=>n.endsWith(".tbk"))) {
  const s = readFileSync(join("notebooks", f), "utf8");
  const re = /```scene[^\n]*\n([\s\S]*?)\n```/g;
  let m, n = 0;
  while ((m = re.exec(s))) { n++; try { JSON.parse(m[1]); } catch (e) { console.log(`${f} scene ${n}: ${e.message}`); } }
  console.log(`${f}: ${n} scenes`);
}'
```

No test framework. Gates are: TypeScript type-check, `cargo check`, and the
scene JSON validator.

## Architecture — quick reference

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.
TL;DR:

- Tauri shell with React/TS frontend + Rust backend
- Frontend owns parsing, rendering, state, Claude prompting
- Rust owns: file I/O, `claude` subprocess, bundled examples, user library
- 8 core primitives (`grid`, `matrix`, `shape`, `arrow`, `label`, `axes`,
  `plot`, `graph`) + 4 plugin primitives (`molecule`, `nn`, `heatmap`,
  `bloch`)
- `.tbk` files are Markdown with YAML frontmatter, `scene` fences
  containing JSON, and optional quiz sections. Parser at
  `src/lib/tbk-parser.ts`, serializer at `src/lib/tbk-serializer.ts`.

## Core abstraction

Every subject reduces to **state → step → scene**. A notebook is a sequence
of pre-computed steps; each step carries a scene snapshot. The renderer is
subject-agnostic. This is why the same engine teaches bubble sort, the
Bloch sphere, BFS, projectile motion, and methane combustion.

## Plugin system

Plugins live under `src/plugins/<category>/<name>.tsx` and statically
register in `src/plugins/index.ts`. The scene renderer falls through to the
plugin registry for any primitive type it doesn't recognize. Every
registered plugin's `schemaDoc` is auto-appended to `TBK_FORMAT_GUIDE` in
`src/lib/prompts.ts` — so Claude learns plugin shapes at prompt-build time
without any manual prompt updates.

All plugins are checked into this repo. We deliberately don't support
runtime loading of external plugins — zero untrusted code execution.

## Claude integration

v0.1 uses the Claude Code CLI (`claude`) as a subprocess. Users already
logged in via `claude login` get AI features with no extra setup.

Rust commands (see `src-tauri/src/claude.rs`):

- `claude_check()` — verifies the CLI is reachable
- `claude_prompt(prompt, system_prompt?)` — blocking one-shot
- `claude_prompt_stream(requestId, prompt, system_prompt?)` — streaming;
  emits `claude-chunk-{id}`, `claude-done-{id}`, `claude-error-{id}` events
- `claude_cancel(requestId)` — SIGTERMs the registered pid

Binary resolution: `resolve_claude_binary()` tries `$TEACHBOOK_CLAUDE_BIN`,
then `claude` in PATH, then `/opt/homebrew/bin/claude`,
`/usr/local/bin/claude`, and `$HOME/.local/bin/claude` — macOS
Finder-launched Tauri apps often miss the user's PATH.

Frontend helpers live in `src/lib/claude.ts`. `claudePromptStream` accepts
an `AbortSignal` that translates to `claude_cancel` when aborted.

Prompts live in `src/lib/prompts.ts` — that's the single source of truth.
When the `.tbk` schema changes, update this file AND
[`docs/NOTEBOOK_FORMAT.md`](docs/NOTEBOOK_FORMAT.md) AND at least one
example notebook in the same commit.

## Conventions

- Components are function components with explicit `Props` types. Avoid
  `React.FC`.
- State lives in `App.tsx`. No Redux or Context yet — prop drilling is
  fine at this size.
- Tailwind for styling. Dark mode via `prefers-color-scheme` + `dark:`
  variants.
- `tsconfig.json` has `strict: true`. Avoid `any`; when unavoidable, add a
  `// eslint-disable-next-line` with a reason.
- Rust errors cross the IPC boundary as `Result<T, String>`. Keep the
  string actionable.
- Commit style: see recent `git log`. Format: `<area>: <what>` subject +
  body explaining *why*.

## What NOT to do

- Don't reach for Electron, server backends, or accounts/auth. Teachbook
  is local-only, self-hosted, BYO Claude subscription.
- Don't hardcode subject-specific logic in the renderer. If you're
  writing `if (subject === "physics")`, you're fighting the
  architecture — add a primitive or plugin instead.
- Don't pre-compute scenes on the Rust side. Parsing and rendering live
  in the frontend.
- Don't expand the `.tbk` schema silently. Schema changes require
  coordinated updates to types, parser, serializer, `src/lib/prompts.ts`,
  `docs/NOTEBOOK_FORMAT.md`, and at least one example notebook.
- Don't load plugins at runtime. All plugins are checked in and bundled.

## Quick facts for answering questions

- 17 bundled notebooks, 128 total scenes, covering 7 subject areas
- 5 plugins currently shipped: `molecule`, `nn`, `heatmap`, `bloch`, `circuit`
- Main JS bundle: ~380 KB gzip (KaTeX + Markdown + CodeMirror langs lazy-loaded)
- File format: Markdown + YAML frontmatter + `scene` fences + optional `## Quiz`
- User notebooks: `~/Teachbook/notebooks/` (auto-created on first launch)
- Claude integration: CLI subprocess, streaming via Tauri events, cancel via SIGTERM
- Run pane (`src/components/RunPane.tsx`): Pyodide loaded lazily from
  jsdelivr CDN (`src/lib/pyodide-runner.ts`); stdout/stderr captured via
  Pyodide's batched streams; scene primitives injected as Python globals
  keyed by `id` or `type_N`; `.py` experiments saved to
  `~/Teachbook/experiments/` (Rust `user_experiments_path` command)
