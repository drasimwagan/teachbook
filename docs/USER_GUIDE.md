# Teachbook — User Guide

How to use Teachbook day to day. If you're looking to *author* `.tbk`
notebooks by hand, jump to
[`NOTEBOOK_FORMAT.md`](NOTEBOOK_FORMAT.md). If you're writing code, see
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## First run

1. Make sure [Claude Code](https://claude.com/claude-code) is installed and
   logged in (`claude login`). Teachbook spawns `claude` as a subprocess
   for every AI feature. If `claude` isn't in your shell's default `PATH`
   (common on macOS when launching GUI apps), set the environment variable
   `TEACHBOOK_CLAUDE_BIN` to the full path.
2. Start Teachbook (`pnpm tauri dev` during development, or the bundled
   installer in a release).
3. Click **Examples** in the header. You'll see the built-in notebooks
   grouped by subject, plus any `.tbk` files you've dropped into
   `~/Teachbook/notebooks/`.

## The three-pane layout

```
┌─────────────────┬──────────────────────┬──────────────┐
│                 │                      │              │
│  Concept        │   Visualization      │   Chat       │
│  (left)         │   (middle top)       │   (right)    │
│                 │                      │              │
│  - Read mode    │                      │              │
│    (default)    ├──────────────────────┤              │
│  - Edit mode    │   Solution code      │              │
│                 │   (middle bottom,    │              │
│                 │    if cell has code) │              │
│                 │                      │              │
│                 ├──────────────────────┤              │
│                 │   STEP N / M —       │              │
│                 │   narration          │              │
│                 │   [+ Add step]       │              │
└─────────────────┴──────────────────────┴──────────────┘
       Concept                Visualization        Chat
```

Every pane scrolls independently. Panes stay synced: advancing a step
updates the visualization, highlights the active code line, scrolls the
source (in Edit mode) to the scene block being rendered, and tells the
chat which step you're on.

## The header

Left to right:

- **Teachbook / notebook title** — current file name
- **↶ ↷** — undo/redo for programmatic changes (Open / Generate /
  Insert-step). Manual typing in Edit mode has its own undo via the editor.
- **Examples** — browse built-in and user notebooks
- **Open** — file dialog for any `.tbk`
- **Save** — save to the current path, or prompt for a new one (defaults
  to `~/Teachbook/notebooks/<slugified-title>.tbk`)
- **Generate** (blue) — open the Generate dialog
- **▸ Run** — toggle the Run pane (bottom drawer) to execute the
  notebook's Python. Turns green with **▾ Run** when open.
- **◀ Prev / Next ▶** — step controls
- **Reset** — jump to step 1
- **Step N / M** counter

## Opening a notebook

Two paths:

1. **Examples** button → pick a card → notebook loads. Subject tag
   (algorithms / physics / chemistry / biology / electronics /
   machine-learning / quantum) and step count are shown on each card.
2. **Open** button → native file dialog → pick a `.tbk` or `.md` file.

Loading a notebook resets the step counter to 1 and fills the history
stack so Undo can return you to whatever was loaded before.

## Stepping through

Once a notebook is loaded:

- **Next ▶** / **◀ Prev** — advance or rewind one step
- **Reset** — back to step 1
- **Click any step** in the Read view's numbered step list — jump directly

The visualization tweens between steps for primitives that keep a stable
`id` — watch the ball arc in the projectile notebook, or the state
vector rotate on the Bloch sphere.

The narration strip at the bottom shows the current step number, total
step count, and the per-step narration text (the `narration="..."`
attribute on the scene block).

## Read vs Edit mode (Concept pane)

Top-right of the Concept pane has a **Read / Edit** toggle.

### Read mode (default)

- Prose rendered as Markdown with GFM (tables, strikethrough) and LaTeX
  (`$...$` inline, `$$...$$` block)
- Scene blocks hidden (they're shown in the Visualization pane)
- Numbered step list per cell — click any step to jump
- Quiz cells collapsed with "Show expected answer" link

### Edit mode

- Raw `.tbk` source in a CodeMirror editor
- Syntax highlighting via Markdown mode
- Current scene block highlighted with a blue left-rail (moves as you step)
- Parse errors surface in a yellow warning strip at the bottom

Edits in Edit mode re-parse with a 250 ms debounce. The visualization and
step count update live.

## Chat with Claude

Right pane. Ask Claude about the current step ("why does vertical velocity
hit zero at the peak?"), request alternate examples ("redo this with an
80° launch angle"), or just talk through the concept.

- **Send** / **Enter** — submit
- **Stop** — replaces **Send** while a response streams; kills the
  subprocess. Partial tokens stay in the reply.
- Tokens arrive incrementally with a blinking `▍` cursor
- The message history is included as context in subsequent replies
- The current notebook source (truncated to 6000 chars) and current step
  narration are injected into Claude's system prompt automatically

## Run the notebook's code (Pyodide)

Click **▸ Run** in the header. A drawer slides up from the bottom with a
Python editor on the left and an output log on the right.

```
┌──────────────────────────────┬──────────────────────────────┐
│ CodeMirror (Python)          │ stdout/stderr log            │
│ seeded from the current      │ >>> run                      │
│ cell's code block            │ hello from pyodide           │
│                              │ ...                          │
└──────────────────────────────┴──────────────────────────────┘
  ▶ Run  Inject scene  Reset  Clear output  |  Save…  Load…  |  ✕
```

**First run** fetches Pyodide (~6 MB WASM) from jsdelivr; you'll see
`loading Pyodide from CDN… → initializing Python runtime… → ready`
next to the "Run" title. Subsequent runs reuse the same interpreter,
so variables persist across runs within a session.

- **▶ Run** — execute the editor contents. stdout shows white, stderr
  shows red, info lines (`>>> run`, injections) show gray. Exceptions
  print the Python traceback in red.
- **Inject scene** — exposes the current step's scene data as Python
  globals: `scene` (the whole `{ primitives: [...] }` dict),
  `primitives` (the list), and one variable per primitive keyed by its
  `id` (if present) or `<type>_<index>` (e.g. `grid_0`, `arrow_2`).
  Inspect state directly from Python: `print(primitives[0]["values"])`.
- **Reset** — restore the editor to the notebook cell's code,
  discarding edits.
- **Clear output** — wipe the log without restarting the interpreter.
- **Save…** / **Load…** — persist the editor contents as a `.py`
  experiment in `~/Teachbook/experiments/`. Useful for keeping your
  own scratch work separate from the notebook.
- **✕** — close the drawer. The interpreter state survives; reopening
  and hitting ▶ Run picks up where you left off.

Pyodide ships a useful Python stdlib subset: `math`, `random`,
`itertools`, `collections`, `statistics`, `json`, `re`, `datetime`.
NumPy is available on demand via `import numpy as np` (it installs on
first import, ~8 MB more). For a full list of pre-built packages,
see the [Pyodide docs](https://pyodide.org/en/stable/usage/packages-in-pyodide.html).

Internet is only required on first load; after that Pyodide and its
packages are cached by the browser/webview.

## Generate a notebook

**Generate** button → dialog → describe what you want to teach.

- `⌘/Ctrl + Enter` submits; `Esc` cancels
- Claude streams the full `.tbk` into a preview pane as it writes
- On completion, the generated notebook replaces the current source
  (snapshot saved to Undo first — hit `⌘⇧Z` if you don't like the result)
- **Stop** during streaming kills the subprocess and closes cleanly

Good prompts are specific. "Teach binary search on a sorted array of 8
numbers" works better than "algorithms". Including the target audience
("middle-school math") and the scenario ("with a Python code block")
helps.

## Insert a step

On any step, click **+ Add step** in the narration strip to open the
Insert-step dialog. Describe what the new step should show.

Claude is given:
- The notebook source as context
- The narration of the step you're inserting after
- The scene JSON of that anchor step
- Your request

Claude returns a single scene block that gets validated (JSON parseable,
has a `primitives` array) and spliced into the source right after the
anchor scene's fence. The app advances to the newly inserted step.

**Stop** during streaming aborts. If the response is malformed, the error
surfaces in the dialog and the source is unchanged.

## Save

The **Save** button commits the current source to disk.

- If the notebook was opened from a file, saves back to that file
- If the notebook is new (or came from Examples), opens a file dialog
  pre-filled with `~/Teachbook/notebooks/<slug>.tbk` where `<slug>` is
  derived from the notebook title

Save is a one-shot — there's no autosave. If you forget to save, closing
the app or loading another notebook drops unsaved edits.

## Keyboard shortcuts

| Shortcut | What it does |
|---|---|
| `⌘ / Ctrl + ⇧ + Z` | Undo (last programmatic change) |
| `⌘ / Ctrl + Y` | Redo |
| `⌘ / Ctrl + Enter` | Submit the Generate or Insert-step dialog |
| `Esc` | Cancel a dialog (when not streaming) |
| `Enter` | Send the chat message |
| `⌘ / Ctrl + Z` | CodeMirror undo (manual typing only, in Edit mode) |

## File locations

- **User notebooks** — `~/Teachbook/notebooks/` (created on first launch
  of the Examples dialog). Drop any `.tbk` file here to see it in the
  gallery.
- **Bundled examples** — baked into the app binary via `include_str!`;
  updating the app updates the examples.
- **Experiments** — `~/Teachbook/experiments/` (created on first Save
  from the Run pane). Your scratch `.py` files; not linked to any
  notebook.
- **Claude CLI** — resolved in this order: `TEACHBOOK_CLAUDE_BIN` env
  var, then your shell's `PATH`, then `/opt/homebrew/bin/claude`,
  `/usr/local/bin/claude`, `~/.local/bin/claude`.

## Troubleshooting

**"Failed to launch 'claude'. Is Claude Code installed and in PATH?"**
The CLI wasn't found. Install from claude.com/claude-code, run
`claude login`, and either ensure it's on your shell PATH or set
`TEACHBOOK_CLAUDE_BIN=/full/path/to/claude` before launching Teachbook.

**Chat response feels slow.**
Chat streams in ~4 KB chunks (one buffer from the `claude` stdout pipe),
so responses feel like sentence-level updates rather than per-token. This
is usually faster than the blocking mode anyway. If it's still taking
>30 s for a short reply, check Claude Code itself is responsive with
`claude -p "hi"` in a terminal.

**Scene renders but says "unknown primitive: xyz".**
The notebook uses a primitive type that isn't built in and isn't provided
by any registered plugin. Common culprits: typos in `type`, or a plugin
from a fork that isn't in your copy. See
[`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md) for how plugins register.

**LaTeX in a label doesn't render.**
The label primitive needs `latex: true` to be flagged. Without it, the
text is rendered as literal SVG text. In prose, LaTeX uses standard
`$...$` (inline) or `$$...$$` (block) — the Markdown → LaTeX bridge is
`remark-math` + `rehype-katex`.

**My edits in Edit mode vanished after Generate.**
Generate replaces the entire source and pushes the old state onto Undo.
Hit `⌘⇧Z` to get your edits back.

**Run pane stuck on "loading Pyodide from CDN…".**
First load needs internet to reach jsdelivr. Check your connection,
then open DevTools (`⌘⌥I`) → Console for a blocked-script error. If
you're behind a strict firewall or need offline use, see the open
issue about bundling Pyodide locally.

**Run pane says "No scene available for the current step".**
The step has no scene fence, or the notebook has no cells with steps
(e.g. the Welcome placeholder). Load a real notebook and try again.

**Running NumPy code hangs on the first import.**
First import downloads and installs the NumPy wheel (~8 MB). Give it
10–20 s; the status stays on "ready" but the Python interpreter is
busy. Subsequent imports are instant.

## Still stuck?

Open an issue with the notebook file (if you can share it), the exact
step number where the problem happens, and a screenshot if possible.
