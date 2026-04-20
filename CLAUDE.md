# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Teachbook is in **early scaffolding** (pre-v0.1). The engine is not yet functional — the
frontend renders an empty three-pane layout, the Rust backend has stub file-I/O commands,
and there is no Claude integration wired up yet. Treat every file as open for
redesign until v0.1 ships. Phased roadmap is in `docs/PLAN.md`.

## Commands

```bash
pnpm install          # install JS deps (run once after clone)
pnpm dev              # vite dev server only (browser, no Tauri shell)
pnpm tauri dev        # full desktop app in dev mode — USE THIS
pnpm build            # type-check + build frontend to dist/
pnpm tauri build      # native installer in src-tauri/target/release/bundle/
```

No test framework yet. No linter configured yet — prefer TypeScript's type checker
(`pnpm build` runs `tsc`) as the gate.

Rust code: `cd src-tauri && cargo check` / `cargo build`.

## Architecture

### The core abstraction
Every subject reduces to **state → step → scene**. A notebook is a sequence of
pre-computed steps; each step has a narration and a declarative scene description.
The frontend plays steps like a debugger: Next/Prev/Reset buttons advance the
`currentStep` state, which selects a scene to render. This is why the same engine
teaches bubble sort and projectile motion.

### `.tbk` file format
Markdown-primary. YAML frontmatter for metadata, prose as Markdown, Python/pseudocode
in normal code fences, scene JSON in ` ```scene step=N narration="..." ` fences,
quiz blocks using `??`/`>>` markers. See `notebooks/bubble-sort.tbk` for the
canonical example. Single file, git-diffable, renders in any Markdown viewer.

A parser (to be written — `src/lib/tbk-parser.ts`) converts a `.tbk` file to the
`Notebook` TypeScript type in `src/types.ts`. A serializer goes the other way. Keep
them symmetric: parse(serialize(nb)) === nb for round-trip safety.

### Scene primitives (the extension point)
Visual domain-generality lives in `src/components/SceneRenderer.tsx`. The
8 core primitives — `grid`, `shape`, `arrow`, `label`, `axes`, `plot`, `graph`, and
highlights via color state — cover ~80% of step-by-step teaching across fields.

To add a primitive: extend `ScenePrimitive` in `src/types.ts` and add a branch
in `SceneRenderer.tsx`. Plugins (chemistry molecules, circuits, ray optics) will
register primitives at runtime — that API isn't designed yet.

### Frontend ↔ Rust boundary
Rust (`src-tauri/src/lib.rs`) owns:
- File I/O (`load_notebook`, `save_notebook`)
- Spawning the Claude Code CLI as a subprocess (not implemented yet)
- OS keychain for API keys (planned, not implemented)

Everything else — parsing, rendering, state, stepping — lives in TypeScript. Keep
the Rust surface small; treat it as a privileged-operations layer, not a backend.

### Claude integration
v0.1 uses the Claude Code CLI (`claude`) as a subprocess. Users already logged in
via `claude login` get AI features with no extra setup. API-key mode (direct
Anthropic SDK) is planned for v0.2.

Rust commands (see `src-tauri/src/claude.rs`):
- `claude_check()` — verifies the CLI is reachable
- `claude_prompt(prompt, system_prompt?)` — one-shot text completion, returns stdout
- `claude_generate_notebook(request)` — prepends the .tbk format guide and strips
  any accidental outer code fences Claude adds; returns clean `.tbk` content

Binary resolution: `resolve_claude_binary()` tries `$TEACHBOOK_CLAUDE_BIN`, then
`claude` in PATH, then `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, and
`$HOME/.local/bin/claude`. macOS Finder-launched Tauri apps often miss the user's
PATH, which is why fallbacks exist.

Frontend helpers live in `src/lib/claude.ts`. `chatSystemPrompt()` builds the
student-tutor system message with current notebook + step context; the chat pane
assembles a conversational history and submits via `claude_prompt`.

The `.tbk` format reference given to Claude lives in `TBK_FORMAT_GUIDE` in
`claude.rs`. When the schema changes (new primitive, new scene meta field),
update that constant and `docs/PLAN.md` in the same commit.

## Conventions

- Components are function components with explicit `Props` types. Avoid `React.FC`.
- State lives in `App.tsx` for now; promote to Context / Zustand only when prop drilling hurts.
- Tailwind for styling. Dark mode via `prefers-color-scheme` + `dark:` variants.
- `tsconfig.json` has `strict: true` — no `any` without a `// eslint-disable-next-line` comment and a reason.
- Rust errors cross the IPC boundary as `Result<T, String>`. Keep the string actionable.

## What NOT to do

- Don't reach for Electron, server backends, or accounts/auth. Teachbook is local-only,
  self-hosted, BYO Claude subscription.
- Don't hardcode subject-specific logic in the renderer. If you're writing
  `if (subject === "physics")`, you're fighting the architecture — add a primitive instead.
- Don't pre-compute scenes on the Rust side. Parsing and rendering are frontend concerns;
  the Rust layer is for privileged operations only.
- Don't expand the `.tbk` format silently. Changes to the schema must update
  `docs/PLAN.md` and the example notebook together.
