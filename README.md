# Teachbook

> A desktop app that turns Claude into a step-by-step tutor for any concept
> that can be taught as *state → step → scene*: algorithms, physics, chemistry,
> biology, electronics, machine learning, quantum mechanics, and anything
> else students and teachers want to reach for.

Teachbook is **local-first** and **self-hosted**. It runs as a ~10 MB Tauri
desktop app that shells out to your existing [Claude Code](https://claude.com/claude-code)
login — no API keys to manage, no accounts, no server to pay for, no
telemetry.

Open a `.tbk` notebook, step through it like a debugger, watch the
visualization update, ask Claude about the current step, or generate a brand
new notebook from a one-line prompt.

## Status

**Phases 1 and 2 complete — v0.1 release draft ready.**

The engine is stable and usable. We ship 17 bundled example notebooks (128
scenes total) across 7 subject areas, a plugin system that extends into new
domains without touching the core, streaming AI chat / notebook generation /
step insertion through the Claude Code CLI, and a Pyodide-backed Run pane
that lets students execute the notebook's Python and inject the current
scene's primitives as globals.

Not yet started: Pyodide (students running the notebook's Python),
bi-directional editing (drag scene elements to update source), test mode
(teacher-graded quizzes). Tracked in [`docs/PLAN.md`](docs/PLAN.md).

## Who this is for

- **Teachers** writing illustrated step-by-step lessons. Generate a draft
  from a prompt, polish the prose, insert extra steps, distribute a single
  `.tbk` file to students.
- **Students** working through a concept. The three-pane layout shows the
  concept text, a visual state animation, and a chat with Claude about
  what's on screen.
- **Self-learners** who want a debugger-style view of algorithms, physics
  derivations, or chemistry reactions.
- **Plugin authors** adding support for new domains — see
  [`docs/PLUGIN_AUTHORING.md`](docs/PLUGIN_AUTHORING.md).

## What's inside

### Three-pane layout

1. **Concept pane** — Markdown prose, code, and scene narration. Toggle
   between a **Read** view (rendered Markdown + numbered step list) and an
   **Edit** view (raw `.tbk` source with syntax highlighting).
2. **Visualization pane** — SVG scene driven by the current step, with a
   debugger-style code viewer showing the highlighted line(s) beneath, and a
   narration strip at the bottom.
3. **Chat pane** — streaming chat with Claude, aware of the current notebook
   and step.

### Core visual primitives (8)

`grid` · `matrix` · `shape` · `arrow` · `label` · `axes` · `plot` · `graph`

These cover ~80% of step-by-step teaching across domains. Every primitive
supports stable `id`s for cross-step tweening via Framer Motion.

### Plugin primitives (4 shipped)

- `molecule` (chemistry) — 2D atoms + bonds with CPK coloring
- `nn` (machine-learning) — layered neurons with activation colors
- `heatmap` (machine-learning) — 2D colored grid with kernel overlays
- `bloch` (quantum) — single-qubit state on the Bloch sphere

Plugins live in `src/plugins/<category>/<name>.tsx`, self-register at
compile time, and auto-document themselves into Claude's format guide.

### AI features

- **Generate** — describe a concept in one prompt, Claude streams a full
  `.tbk` notebook into the editor.
- **+ Add step** — on any step, ask Claude to insert a new step after it;
  the result is validated and spliced into the source.
- **Chat** — streaming Claude chat with notebook and current-step context.
- **Cancel** — mid-stream abort sends SIGTERM to the `claude` subprocess;
  whatever arrived stays, no error surfaces.

### Other niceties

- Undo / redo (`⌘⇧Z` / `⌘Y`) for programmatic source changes
- LaTeX rendering via KaTeX in both prose (`$...$`) and scene labels
- Examples gallery with built-in and user (`~/Teachbook/notebooks/`) notebooks
- Lazy-loaded Markdown reader and code view — initial JS bundle is 380 KB gzip

## Requirements

- Node 18+, pnpm 10+, Rust stable
- [Claude Code](https://claude.com/claude-code) installed and logged in
  (`claude login`). If `claude` isn't on your PATH, set
  `TEACHBOOK_CLAUDE_BIN=/full/path/to/claude`.

## Development

```bash
pnpm install
pnpm tauri dev      # launches the desktop app in dev mode — use this
pnpm build          # type-check + build frontend only
pnpm tauri build    # produces a native installer in src-tauri/target/release/bundle/
```

## Documentation

- [**User guide**](docs/USER_GUIDE.md) — how to use the app
- [**Notebook format**](docs/NOTEBOOK_FORMAT.md) — `.tbk` reference for authors
- [**Plugin authoring**](docs/PLUGIN_AUTHORING.md) — extending the engine into new domains
- [**Architecture**](docs/ARCHITECTURE.md) — for code contributors
- [**Plan**](docs/PLAN.md) — roadmap and design decisions
- [**Contributing**](CONTRIBUTING.md) — how to get involved

## License

MIT. See [LICENSE](LICENSE).
