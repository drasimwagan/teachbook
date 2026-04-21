# Teachbook — Plan & Design Decisions

This document captures the roadmap, shipped features, and the rationale
behind major decisions. When a decision changes, update this file in the
same commit as the code change.

## Vision

A self-hosted desktop app that turns Claude into a step-by-step tutor for
any subject where concepts are taught as **state → step → scene**:
algorithms, physics, chemistry, biology, electronics, ML, quantum, and
beyond. Teachers author notebooks; students play them like debuggers.

## Target users

- **Students**: load a notebook, step through the concept, ask Claude
  questions, take quizzes assigned by a teacher.
- **Teachers**: write a prompt or prose, let Claude generate the
  step-by-step notebook, polish, insert extra steps, distribute to
  students as a single `.tbk` file.
- **Self-learners**: same as students, with no teacher involved.
- **Plugin authors**: extend the engine into new domains. See
  [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md).

## Locked decisions

| Decision | Value | Why |
|----------|-------|-----|
| Distribution | Desktop app (Tauri) | No funding for hosting; students install locally |
| Shell | Tauri 2 over Electron | ~10 MB vs. ~150 MB, less RAM, native feel |
| Frontend | React 19 + TS + Vite + Tailwind | Standard, contributor-friendly |
| Editor | CodeMirror 6 | Lighter than Monaco, better theming |
| Animation | Framer Motion | Tweens primitives across steps |
| AI integration | Claude Code CLI subprocess | Audience already has the subscription |
| File format | Markdown-primary `.tbk` | Human-readable, git-diffable, shareable |
| Plugin loading | Compile-time static registry | Zero runtime code loading; no supply-chain risk |
| License | MIT | Maximum adoption |

## The core abstraction

Every subject reduces to **state → step → scene**. A notebook is a sequence
of pre-computed steps; each step carries a scene snapshot. The renderer is
subject-agnostic.

### 8 core primitives

1. `grid` — 1D array with optional position, cell size, label
2. `matrix` — 2D table with row/col labels and cell highlights (DP, Punnett)
3. `shape` — circle / rect / polygon with stable `id` for tweening
4. `arrow` — weighted, labeled, directable vector
5. `label` — plain text or LaTeX (via KaTeX)
6. `axes` — coordinate system for plots and physics
7. `plot` — line/scatter with animated path growth
8. `graph` — weighted directed/undirected with node + edge highlighting

### 5 plugin primitives (shipped)

| Type | Category | Purpose |
|------|----------|---------|
| `molecule` | chemistry | 2D atoms + bonds, CPK colors, single/double/triple bonds |
| `nn` | machine-learning | Layered neurons with activation colors, highlightable edges |
| `heatmap` | machine-learning | 2D colored grid, 3 colormaps, kernel-window overlays |
| `bloch` | quantum | Single-qubit state on a 3D-projected unit sphere |
| `circuit` | electronics | Schematic symbols: wire, resistor, capacitor, inductor, battery, voltage source, ground, node |

## `.tbk` file format

Valid Markdown. See [`NOTEBOOK_FORMAT.md`](NOTEBOOK_FORMAT.md) for the full
reference.

- YAML frontmatter (`title`, `subject`, `author`, `version`)
- Markdown prose with LaTeX (`$...$`, `$$...$$`)
- One fenced code block per cell (the "solution steps")
- `scene` fences: ` ```scene step=N narration="..." code_lines=M-K ` with
  JSON body `{ "primitives": [...] }`
- Quiz section with `??` questions and `>>` rubrics

Parser lives in `src/lib/tbk-parser.ts`, serializer in
`src/lib/tbk-serializer.ts`.

## Roadmap

### Phase 0 — Spike ✅
- [x] Scaffold Tauri + React + TS
- [x] Empty three-pane layout
- [x] Rust stubs for notebook I/O

### Phase 1a — End-to-end `.tbk` loop ✅
- [x] Parser + serializer
- [x] File open/save via Tauri dialog
- [x] All 8 core primitives in `SceneRenderer.tsx`
- [x] Multi-domain starter notebooks (bubble sort, projectile, BFS)
- [x] Debounced re-parse on source change

### Phase 1b — Claude authoring + chat ✅
- [x] Rust `claude` CLI subprocess command
- [x] Generate notebook dialog
- [x] Insert-step round-trip editing
- [x] Chat with notebook + step context

### Phase 1 polish ✅
- [x] Code/scene alignment via `code_lines`
- [x] LaTeX rendering (KaTeX) in prose + scene labels
- [x] Scene transitions (Framer Motion tweens on stable `id`s)
- [x] Read/Edit toggle in Concept pane
- [x] Streaming chat / generate / insert
- [x] Undo/redo (⌘⇧Z / ⌘Y)
- [x] Examples gallery (bundled + user library)
- [x] Cancel in-flight Claude requests (SIGTERM)
- [x] Bundle splitting (lazy-load Markdown + KaTeX + CodeMirror langs)

### Phase 1 extensions ✅
- [x] Graph primitive gains node/edge highlighting, weights, directed
- [x] Matrix primitive (DP tables, confusion matrices)
- [x] BFS / Dijkstra / LCS DP notebooks
- [x] Merge sort rewritten as real execution trace

### Plugin system ✅
- [x] Plugin interface + compile-time registry
- [x] Scene renderer fall-through for unknown types
- [x] Format guide auto-assembles plugin schemas
- [x] `molecule`, `nn`, `heatmap`, `bloch` plugins
- [x] Contributor docs (`PLUGIN_AUTHORING.md`)

### Milestone: v0.1 — usable release ✅
- [x] `electronics` plugin (circuit schematics)
- [x] `CONTRIBUTING.md` + issue templates
- [x] `pnpm tauri build` installers for mac/win/linux (CI-built via
  `.github/workflows/release.yml` — macOS .dmg + universal.app, Windows
  .msi/.exe, Linux .deb/.rpm/.AppImage)
- [x] Landing page + GitHub Pages deploy (`pages.yml`)
- [x] First public GitHub release (draft `v0.1.0` ready to publish)

### Phase 2 — Student code execution (Pyodide) ✅
- [x] Add a 4th pane: "Run" — Pyodide REPL with the notebook's code
  (bottom drawer toggled from the header, `src/components/RunPane.tsx`)
- [x] stdout/stderr routed to the run pane (`pyodide.setStdout` / `setStderr`
  batched mode, captured line-by-line into a scrollable log)
- [x] Button to inject current variables from a scene into the REPL — the
  **Inject scene** button exposes `scene`, `primitives`, and per-id globals
- [x] Save/load student experiments separately from the notebook — `.py`
  files under `~/Teachbook/experiments/` via Tauri save/open dialogs

Pyodide (~6 MB WASM) is fetched lazily from jsdelivr on first Run; the
main JS bundle stays lean. `src/lib/pyodide-runner.ts` owns the singleton
load promise and the run/inject helpers. Future enhancement: optional
bundled wheel for offline use.

### Phase 3 — Bi-directional editing ✅ (MVP)
- [x] Drag a scene element → source updates. Supported primitives:
  `shape` (circle + rect) and `label`. Pointer-captured SVG drag with
  viewBox-space tracking; commit on pointerup.
- [x] Generated changes respect `id`s so tweens remain smooth — the
  patch only touches `x`/`y`, never `id`, and primitives without an id
  stay in the same array index so positional React keys still line up.
- [x] Undo-aware — each drop wraps `snapshotAnd("drag primitive", …)`,
  so ⌘⇧Z reverses the most recent drag.

The scene-edit helper (`src/lib/scene-edit.ts`) does surgical fence
replacement: it re-parses the scene JSON, patches the target primitive,
and preserves compact-vs-pretty formatting of the original fence. When
an `axes` primitive is present, pointer coords are inverse-projected
back into data space before the patch, so dragging the ball in
`projectile-motion.tbk` still yields sensible data-space values.

Follow-ups (not MVP):

- Arrow endpoint drag (two handles per arrow)
- Graph node drag
- Polygon drag (currently disabled; the existing polygon code paths
  don't tween vertices anyway)
- Drag snapping / axis constraints for structured notebooks

### Phase 4 — Test mode — not started
- [ ] Teacher-authored quiz notebooks with rubrics (schema already supports this)
- [ ] Student answer recording
- [ ] Claude grades answers against rubric
- [ ] Progress file portable between student and teacher

### Phase 5 — Community — not started
- [ ] Notebook gallery website (GitHub Pages over a curated repo)
- [ ] API-key auth mode (fallback for users without Claude Code)
- [ ] Signed third-party plugins (would require a security model)

## Backlog (unsorted polish)

- Bubble sort shows `i`, `j` as labels
- `Cmd+S` shortcut for Save
- Click a scene block in Concept (Edit mode) → jump to that step
- Plugin-aware subject filter in the Examples gallery
- Windows cancel support (currently no-op because no SIGTERM)
- More plugins: `tree` (tries, recursion trees), `math` (Venn, polar),
  `physics` (vector fields, free-body diagrams), `biology` (Punnett square)

## Non-goals

- Web SaaS / hosted service — local-first, self-hosted only
- Multi-user collaboration / accounts — notebooks share via single `.tbk`
- Running student code server-side — Pyodide WASM only
- Replacing Jupyter for research — this is a teaching tool
- Runtime-loadable third-party plugins — all plugins are code-reviewed and
  compile-time static to avoid supply-chain risk

## Open design questions

1. **Scene coordinate system** — currently `axes` primitive drives
   projection for plot-related primitives. Plugins can opt in via
   `ctx.project()`. Should this become the default for everything?
2. **LaTeX in Edit view** — Edit view shows raw `$...$`. Would a
   side-by-side preview help? Authors don't seem to need it yet.
3. **Plugin versioning** — if a plugin's schema changes, old notebooks
   break. Semver-tagged plugins? Probably overkill until external plugins
   exist.
4. **Scene diff vs. full snapshot per step** — diffs would be smaller but
   fragile; snapshots are larger but robust. We ship full snapshots. No
   regrets so far.
