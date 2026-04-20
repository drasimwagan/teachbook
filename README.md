# Teachbook

An open-source desktop app for teaching step-by-step concepts — algorithms, physics,
chemistry, biology, math — with AI-generated visualizations. Students and teachers
load a `.tbk` notebook, step through the concept like a debugger, and ask Claude
questions about what they see.

> Status: early scaffolding. Not yet usable. See [`docs/PLAN.md`](docs/PLAN.md).

## Why

Existing tools teach one domain at a time (VisuAlgo, PhET, Manim). Teachbook is
a domain-general engine: the same renderer that animates bubble sort can animate
projectile motion or a chemical reaction. Teachers pick the subject; Claude
generates the steps; students watch and interact.

## How it works

Three panes, always visible:

1. **Concept** — Markdown prose + pseudocode/real code for the problem
2. **Visualization** — SVG scene driven step-by-step, advances when you press "Next"
3. **Chat** — Claude, aware of the current notebook and step

A `.tbk` notebook is a Markdown file with scene JSON in fenced blocks. Human-readable,
git-diffable, shareable as a single file.

## Tech

- **Shell**: [Tauri 2](https://tauri.app) (native desktop, ~10 MB installer)
- **UI**: React 19 + TypeScript + Vite + Tailwind
- **Editor**: CodeMirror 6
- **Animation**: Framer Motion
- **Student code execution**: Pyodide (WASM, planned)
- **AI**: Claude Code CLI subprocess (uses your existing subscription) — API key mode coming later

## Development

Requires Node 18+, pnpm, Rust stable.

```bash
pnpm install
pnpm tauri dev    # launches the desktop app in dev mode
pnpm tauri build  # produces a native installer in src-tauri/target/release/bundle/
```

## License

MIT. See [LICENSE](LICENSE).
