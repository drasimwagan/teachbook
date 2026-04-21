# Teachbook — Architecture

This document is for engineers who want to contribute code to Teachbook.
For using the app, see [`USER_GUIDE.md`](USER_GUIDE.md). For writing
notebooks by hand, [`NOTEBOOK_FORMAT.md`](NOTEBOOK_FORMAT.md). For adding
new primitives, [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md).

## High-level shape

```
┌─────────────────────────────────────────────────────────────┐
│                  Tauri 2 native window                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │  React 19 + TypeScript frontend                    │     │
│  │  - App.tsx      (state + glue)                     │     │
│  │  - Concept / Visualization / Chat panes            │     │
│  │  - Run pane (Pyodide, lazy CDN load)               │     │
│  │  - SceneRenderer + core primitives                 │     │
│  │  - Plugin registry                                 │     │
│  │  - tbk-parser / tbk-serializer                     │     │
│  └────────────────────────────────────────────────────┘     │
│                        │ Tauri IPC                           │
│  ┌────────────────────┴───────────────────────────────┐     │
│  │  Rust backend (src-tauri/)                         │     │
│  │  - file I/O (load / save notebook)                 │     │
│  │  - Claude subprocess (prompt + streaming)          │     │
│  │  - user notebooks library                          │     │
│  │  - bundled examples (include_str!)                 │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  claude CLI       │
                    │  (subprocess)     │
                    └───────────────────┘
```

The frontend is where almost all logic lives. Rust is a thin privileged
layer for file I/O and process spawning — resist the temptation to grow it.

## Directory layout

```
/
├── src/                        # Frontend (React + TS)
│   ├── App.tsx                 # top-level state, dialog wiring, shortcuts
│   ├── types.ts                # Notebook, Cell, Step, ScenePrimitive union
│   ├── components/
│   │   ├── ConceptPane.tsx     # edit/read toggle container
│   │   ├── ConceptReadView.tsx # rendered Markdown + step list (lazy)
│   │   ├── VisualizationPane.tsx
│   │   ├── SceneRenderer.tsx   # core primitives + plugin fallthrough
│   │   ├── CodeStepView.tsx    # read-only CodeMirror with line highlight (lazy)
│   │   ├── MathLabel.tsx       # KaTeX inside <foreignObject> (lazy)
│   │   ├── ChatPane.tsx        # streaming chat UI
│   │   ├── GenerateDialog.tsx  # streaming generate UI
│   │   ├── InsertStepDialog.tsx
│   │   ├── ExamplesDialog.tsx  # bundled + user library gallery
│   │   └── StepControls.tsx
│   ├── lib/
│   │   ├── tbk-parser.ts       # mdast → Notebook
│   │   ├── tbk-serializer.ts   # Notebook → .tbk source
│   │   ├── claude.ts           # Tauri IPC wrappers: prompt / stream / cancel
│   │   ├── notebook-edit.ts    # insertStepAfter — streaming + splice
│   │   ├── prompts.ts          # TBK_FORMAT_GUIDE assembly (core + plugins)
│   │   ├── cm-line-highlight.ts# shared CodeMirror extension
│   │   └── useHistory.ts       # undo/redo hook
│   ├── plugins/
│   │   ├── types.ts            # TeachbookPlugin interface
│   │   ├── registry.ts         # Map-based registry
│   │   ├── index.ts            # all plugins imported + registered
│   │   ├── chemistry/molecule.tsx
│   │   ├── ml/neural-network.tsx
│   │   ├── ml/heatmap.tsx
│   │   └── quantum/bloch.tsx
│   └── main.tsx                # React root + katex CSS import
│
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── lib.rs              # Tauri builder, command handlers
│   │   ├── claude.rs           # subprocess + streaming + cancel
│   │   ├── examples.rs         # bundled notebooks via include_str!
│   │   └── library.rs          # ~/Teachbook/notebooks scanner
│   ├── Cargo.toml
│   ├── capabilities/default.json
│   └── tauri.conf.json
│
├── notebooks/                  # .tbk source files (also baked into the binary)
├── docs/                       # this directory
├── package.json
└── vite.config.ts
```

## The domain model

`src/types.ts` defines the data structures shared by parser, renderer,
serializer, and UI:

```ts
Notebook {
  metadata  : NotebookMetadata   // { title, subject, author, version }
  cells     : Cell[]
  totalSteps: number             // convenience: sum of cells[].steps.length
  source    : string             // original .tbk text
}

Cell {
  kind   : "concept" | "quiz"
  prose  : string                // Markdown, re-serialized by the parser
  code?  : string                // first non-scene code block in this cell
  codeLang?: string              // language tag on the code block
  steps  : Step[]
  // quiz-specific:
  question?: string
  rubric?  : string
}

Step {
  narration  : string
  scene      : Scene
  codeLines? : [number, number]  // 1-indexed within cell.code
  sourceLine?: number            // 1-indexed within the whole .tbk source
  sourceEndLine?: number
}

Scene {
  primitives: ScenePrimitive[]
}

ScenePrimitive = GridPrimitive
               | ShapePrimitive
               | ArrowPrimitive
               | LabelPrimitive
               | AxesPrimitive
               | PlotPrimitive
               | GraphPrimitive
               | MatrixPrimitive
               | PluginPrimitive   // any { type: string, ... } for plugins
```

`sourceLine` / `sourceEndLine` are populated by the parser from mdast
position info. The Edit-view scene highlight and Insert-step splice both
depend on them.

## Data flow

### 1. Loading a notebook

```
user clicks Open
  → @tauri-apps/plugin-dialog picks a path
  → invoke("load_notebook", { path })
  → Rust reads the file (src-tauri/src/lib.rs::load_notebook)
  → returns contents as a string
  → App.tsx: snapshotAnd(...) pushes history, setSource(contents)
  → debounced useEffect: parseTbk(source) → { notebook, errors }
  → setNotebook, setParseErrors
  → re-render: Concept/Visualization/Chat all receive new state
```

### 2. Stepping through

```
user clicks Next ▶
  → setCurrentStep(current + 1)
  → VisualizationPane re-renders:
      locate(notebook, currentStep) → { cell, step }
      SceneRenderer receives step.scene
      CodeStepView receives cell.code + step.codeLines
  → ConceptPane re-renders:
      Read view: highlights the step's list item
      Edit view: dispatches setHighlightRangeEffect with [sourceLine, sourceEndLine]
```

Tweening happens because primitives with the same `id` keep their React
key across step changes; Framer Motion's `motion.*` components see prop
changes and animate.

### 3. Generating a notebook

```
user types prompt in GenerateDialog, clicks Generate
  → new AbortController
  → claudePromptStream(userPrompt, TBK_FORMAT_GUIDE, handlers, {signal})
      → generates requestId via crypto.randomUUID()
      → listen for "claude-chunk-{id}", "claude-done-{id}", "claude-error-{id}"
      → invoke("claude_prompt_stream", { requestId, prompt, systemPrompt })
  → Rust (src-tauri/src/claude.rs::claude_prompt_stream):
      → resolve_claude_binary() → path
      → spawn claude -p <prompt> --append-system-prompt <system>
      → register pid in ClaudeState (Mutex<HashMap<String, u32>>)
      → tokio task drains stdout → emit "claude-chunk-{id}" per chunk
      → on exit: emit "claude-done-{id}" with full text
  → handlers.onChunk updates the preview pane
  → handlers.onDone: stripOuterFence + onGenerated
  → App.tsx: snapshot → setSource → re-parse → re-render
```

**Cancel** during streaming: `controller.abort()` fires `onabort` →
invoke("claude_cancel", { requestId }) → Rust removes pid and calls
`libc::kill(pid, SIGTERM)`. The Rust task sees the child exit and emits
`done` (not `error`) so the UI closes cleanly with whatever tokens
arrived.

### 4. Inserting a step

Same pattern as generate but with a specialized prompt. After the stream
finishes, `insertStepAfter` in `src/lib/notebook-edit.ts` does:

1. Extracts the scene fence from Claude's response (`extractSceneBlock`)
2. Validates the scene JSON has a `primitives` array
3. Splices the scene block into `source` right after the anchor step's
   `sourceEndLine`
4. Re-parses the new source
5. Advances `currentStep` to the newly inserted step

### 5. Dragging a primitive (bi-directional editing)

1. User grabs a `shape` or `label` in the Visualization pane
2. `SceneRenderer` captures the pointer, tracks viewBox coords in local
   state, and re-renders the primitive at the override position each move
3. On pointerup, coords are inverse-projected through the scene's `axes`
   (if any) back into the primitive's own space
4. `onPrimitivePatch(sourceLine, sourceEndLine, index, { x, y })` bubbles
   up through `VisualizationPane` to `App.tsx`
5. `updatePrimitiveInSource` in `src/lib/scene-edit.ts` splices the new
   JSON back into the source between the fence markers, preserving
   compact-vs-pretty formatting
6. `snapshotAnd("drag primitive", …)` pushes the current source onto the
   Undo stack, then applies the new source
7. The 250 ms re-parse picks it up; since the primitive's `id` and array
   index are unchanged, the tween keeps the element in place

### 6. Running notebook code (Pyodide)

1. User clicks **▸ Run** in the header → `App.tsx` toggles `runOpen`
2. `RunPane` (`src/components/RunPane.tsx`) renders as a 38vh bottom
   drawer with a CodeMirror Python editor + a stdout/stderr log
3. On first **▶ Run**, `ensurePyodide()` calls
   `getPyodide()` in `src/lib/pyodide-runner.ts`:
   - Injects `<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js">`
   - Awaits `window.loadPyodide({ indexURL: ... })`
   - Caches the singleton promise so subsequent runs reuse the same interpreter
4. `runPython(py, code, onStdout, onStderr)`:
   - Wires `pyodide.setStdout({ batched })` and `setStderr({ batched })`
     into log callbacks that push into the `log` state array
   - `await py.runPythonAsync(code)` — exceptions are captured and printed red
5. **Inject scene** walks the current step's `scene.primitives` and calls
   `pyodide.globals.set(key, pyodide.toPy(value))` for each. Keys are
   `scene`, `primitives`, plus one entry per primitive (its `id` or
   `<type>_<index>`). JS objects → Python dicts via Pyodide's JSON-like
   converter.
6. **Save… / Load…** reuse `save_notebook` / `load_notebook` (generic
   text I/O) with the Tauri dialog defaulting to
   `user_experiments_path()`.

The interpreter state — variables, imports, package installs — persists
across runs within a session because the Pyodide instance is a module
singleton. Closing the drawer with **✕** does not reset it.

## Parser

`src/lib/tbk-parser.ts` uses `unified` + `remark-parse` + `remark-frontmatter`
to produce an mdast tree, then walks the top-level children:

- `yaml` node → frontmatter (parsed by `yaml` package)
- `heading` → if the text is "Quiz", switches to quiz mode; otherwise
  accumulates into prose
- `code` with `lang === "scene"` → parses meta (`step=N narration="..."
  code_lines=M-K`), parses the JSON body, records `sourceLine`/`sourceEndLine`
  from `node.position`, pushes a new `Step` onto the current cell
- `code` with other lang → first one becomes the cell's `code`; text is
  re-serialized into prose
- `paragraph` in quiz mode → checks for `??` / `>>` prefixes

The serializer (`src/lib/tbk-serializer.ts`) is the inverse, used when
`Generate` rewrites the source. Round-trip fidelity holds for
canonically-laid-out notebooks.

## SceneRenderer

One SVG at `viewBox="0 0 800 500"`, `preserveAspectRatio="xMidYMid meet"`.
Walks the scene's primitives; dispatches each to a sub-component:

```ts
switch (p.type) {
  case "grid":   return <Grid p={p} />;
  case "shape":  return <Shape p={p} axes={axes} />;
  // ... other core primitives
  default: {
    const plugin = getPlugin(p.type);
    if (plugin) return plugin.render(p, ctx);
    return <error placeholder />;
  }
}
```

**All position-changing primitives use `motion.*` components** so that
`animate={{ cx, cy }}` tweens. Outer scene wrapper deliberately does NOT
remount per step — that would defeat tweening.

Primitive identity is `${type}:${id}` if `id` is set, else `${type}:${index}`.
Stable identity across steps is what keeps the motion components alive
across re-renders.

## Plugin system

Full details in [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md). TL;DR:

- A plugin is `{ type, category, description, schemaDoc, render }`.
- `src/plugins/index.ts` statically imports each plugin and calls
  `registerPlugin` on it.
- `SceneRenderer`'s default case calls `getPlugin(type)`.
- `src/lib/prompts.ts` assembles `TBK_FORMAT_GUIDE` as `CORE_GUIDE + plugin
  schemaDocs grouped by category`.
- No runtime code loading. All plugins ship as part of the binary and are
  code-reviewed.

## Rust commands

Registered in `src-tauri/src/lib.rs::run()`:

| Command | Signature | Purpose |
|---------|-----------|---------|
| `load_notebook` | `(path) → Result<String>` | Read file from disk |
| `save_notebook` | `(path, contents) → Result<()>` | Write file to disk |
| `claude_check` | `() → Result<String>` | `claude --version` |
| `claude_prompt` | `(prompt, system?) → Result<String>` | Blocking one-shot |
| `claude_prompt_stream` | `(requestId, prompt, system?) → Result<()>` | Streaming; emits events |
| `claude_cancel` | `(requestId) → Result<()>` | SIGTERM the pid |
| `list_bundled_notebooks` | `() → Vec<BundledNotebook>` | Baked-in examples |
| `list_user_notebooks` | `() → Vec<UserNotebook>` | `~/Teachbook/notebooks/*` |
| `user_notebooks_path` | `() → Result<String>` | Absolute path, creates dir |
| `user_experiments_path` | `() → Result<String>` | `~/Teachbook/experiments/` — for Run-pane `.py` scratch files |
| `app_version` | `() → String` | Cargo version |

All command handlers are intentionally small. Streaming uses
`tokio::spawn` + `AsyncReadExt::read` + `AppHandle::emit`.

`ClaudeState` is a `Mutex<HashMap<String, u32>>` of in-flight pids,
registered with `Builder::manage()` so `claude_cancel` can find the child
to kill. SIGTERM is Unix-only; Windows is a no-op for now.

## Build + bundling

- Vite builds frontend to `dist/`
- Tauri takes over: `tauri.conf.json` points `frontendDist` at `../dist`
- Cargo builds the Rust binary + embeds the frontend
- `pnpm tauri build` produces OS-specific installers in
  `src-tauri/target/release/bundle/`

Lazy-loading: `ConceptReadView`, `CodeStepView`, and `MathLabel` are
`React.lazy()` imports. KaTeX is only loaded on scenes that have LaTeX or
when the Read view is active. Vite factors the shared KaTeX chunk out
automatically.

Main bundle is ~380 KB gzip; KaTeX chunk ~77 KB gzip loaded on demand.

## Testing

No automated test suite yet. Gates we use instead:

- `pnpm build` — TypeScript type check
- `cargo check --manifest-path src-tauri/Cargo.toml` — Rust compile check
- Scene JSON validation: a short Node script iterates `notebooks/*.tbk`,
  extracts every scene block, and JSON-parses it. Run on every commit that
  touches a notebook or the parser.

Before committing significant changes, also run `pnpm tauri dev` and step
through the affected notebooks manually.

## Conventions

- **Components**: function components with explicit `Props` type. Avoid
  `React.FC`.
- **State**: lives in `App.tsx`. No Redux or Context yet — prop drilling
  is fine at this size.
- **Styling**: Tailwind utility classes. Dark mode via `prefers-color-scheme`
  + `dark:` variants. The CSS is not theme-switchable at runtime (yet).
- **TypeScript**: `strict: true`. `any` requires a `// eslint-disable-next-line`
  comment explaining why.
- **Rust errors**: cross the IPC boundary as `Result<T, String>`. Keep the
  string actionable.
- **Tauri IPC**: always wrap `invoke` calls in typed helpers in
  `src/lib/claude.ts` etc. so the frontend doesn't pass unchecked
  payloads.

## What not to do

- Don't reach for Electron, accounts, or a backend service. Teachbook is
  local-only by design.
- Don't pre-compute scenes on the Rust side. Parsing and rendering live in
  the frontend.
- Don't add subject-specific logic to `SceneRenderer.tsx`. If you're
  writing `if (subject === "physics")`, you're fighting the
  architecture — write a primitive or a plugin instead.
- Don't load plugins at runtime. All plugins are checked in and bundled.
- Don't expand the `.tbk` schema silently. Schema changes require
  coordinated updates to: types, parser, serializer, format guide
  ([`NOTEBOOK_FORMAT.md`](NOTEBOOK_FORMAT.md) and
  [`src/lib/prompts.ts`](../src/lib/prompts.ts)), an example notebook, and
  any affected bundled notebooks.
