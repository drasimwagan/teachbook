# `.tbk` Notebook Format Reference

This is the authoritative reference for the `.tbk` file format. A
Teachbook notebook is a Markdown document with a structured header,
standard prose, one code block per cell, and a sequence of scene fences
that drive the visualization.

For a gentler introduction, step through any of the bundled notebooks in
the Examples gallery — they're all written in this format and cover a
wide range of subjects.

## Top-level structure

```markdown
---
version: 0.1
title: My Notebook
subject: algorithms
author: Your Name
---

# Heading

Prose paragraph with Markdown and LaTeX: $x^2 + y^2 = r^2$.

```python
def solution():
    return 42
```

```scene step=0 narration="Introduce the problem." code_lines=1
{ "primitives": [ ... ] }
```

```scene step=1 narration="..." code_lines=2
{ "primitives": [ ... ] }
```

## Quiz

?? A discussion question.
>> An expected answer or rubric.
```

Every `.tbk` is valid Markdown — open it in any Markdown previewer and it
renders as readable document (scene blocks show as code blocks).

## YAML frontmatter

Between two `---` lines at the very top. All fields optional except by
convention:

| Field | Type | Use |
|-------|------|-----|
| `version` | string | Format version. Always `0.1` for now. |
| `title` | string | Shown in header, gallery cards, and generated filenames. |
| `subject` | string | Drives the color-coded tag in the Examples gallery. Conventions below. |
| `author` | string | Shown in the gallery card. |

### Subject conventions

The Examples gallery uses a hand-picked color palette for these subjects —
others fall back to neutral gray:

- `algorithms`
- `physics`
- `chemistry`
- `biology`
- `math`
- `machine-learning`
- `quantum`
- `electronics`
- `image-processing`

Use any string you want — it's just display metadata. Claude uses the
subject when generating notebooks to pick appropriate primitives and prose
style.

## Prose

Everything between frontmatter and the first scene block, and anything
between scene blocks, is Markdown. Supported:

- **GitHub Flavored Markdown** — headings, lists, tables, strikethrough,
  task lists, etc.
- **Inline LaTeX** via `$...$`
- **Display LaTeX** via `$$...$$`
- **Fenced code blocks** with language tags (`python`, `text`, `js`, ...)

Prose is shown in the Concept pane's Read view. Each cell's prose is
followed by the cell's step list (numbered, clickable).

## The "solution" code block

Each cell should have **one** fenced code block besides the scene fences.
This is the cell's "solution" — the pseudocode, Python, math derivation,
or natural-language steps that the scenes walk through.

```python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        ...
```

Or for subjects without code, use `text`:

````text
1. Decompose v₀ into components.
2. Apply kinematic equations.
3. Evaluate at each timestep.
````

The solution is rendered in the Visualization pane's code viewer, with
debugger-style line highlighting on the current step's `code_lines`.

## Scene blocks

The heart of a notebook. Syntax:

````
```scene step=N narration="Narration text." code_lines=M-K
{ "primitives": [ ... ] }
```
````

### Scene metadata (inside the fence info string)

| Key | Example | Meaning |
|-----|---------|---------|
| `step` | `step=3` | Human-readable step number. Steps are actually ordered by their position in the file; this is just for display. |
| `narration` | `narration="Pop A from the queue."` | Text shown in the narration strip. Quoting required. |
| `code_lines` | `code_lines=5` or `code_lines=8-13` | 1-indexed line range within the cell's first code block. Highlighted while this step is active. Omit if the step doesn't map to code. |

### Scene body

A single JSON object with one required field `primitives` — an array of
primitive objects. See below for each primitive's shape.

## Core primitive reference

All primitives have a `type` field. Unknown types fall through to the
plugin registry (see [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md)).

### `grid` — 1D array

```json
{
  "type": "grid",
  "values": [5, 2, 8, 1, 9],
  "highlight": [1, 2],
  "x": 240, "y": 130,
  "cellSize": 40,
  "label": "left"
}
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `values` | `(string \| number)[]` | required | Cells to display |
| `highlight` | `number[]` | `[]` | Indices to paint yellow |
| `x`, `y` | `number` | centered | Top-left of the grid |
| `cellSize` | `number` | 60 | Use 36–40 when multiple grids coexist |
| `label` | `string` | — | Rendered above the grid |

### `matrix` — 2D table

```json
{
  "type": "matrix",
  "rows": [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 1, 2, 2],
    [0, 1, 2, 3]
  ],
  "colLabels": ["ε", "A", "C", "T"],
  "rowLabels": ["ε", "A", "G", "C"],
  "highlight": [[3, 3], [2, 2]],
  "x": 240, "y": 60, "cellSize": 52,
  "label": "dp[i][j]"
}
```

Use for DP tables, Punnett squares, confusion matrices. Placeholder cells
can use strings like `"·"` or `"_"`.

### `shape` — circle / rect / polygon

```json
{
  "type": "shape",
  "id": "ball",
  "shape": "circle",
  "x": 3, "y": 0,
  "radius": 6,
  "fill": "#ef4444"
}
```

`shape` is one of `"circle"`, `"rect"`, `"polygon"`. If an `axes`
primitive is in the scene, `x`/`y` are domain units; otherwise they're
pixels in the 800×500 viewBox.

**The `id` field** makes this primitive tween its position across steps.
Give a moving object (ball, pointer, arrow tip) the same `id` in every
step and Framer Motion interpolates its motion.

Optional fields: `width`, `height` (for rect), `stroke`.

### `arrow`

```json
{ "type": "arrow", "id": "v", "from": [0, 0], "to": [5, 3], "label": "v₀" }
```

`from` and `to` are `[x, y]` in axes domain units (if present) or viewBox
pixels. Optional `label` rendered near the midpoint. `id` enables tweening.

### `label`

```json
{ "type": "label", "x": 80, "y": 110, "text": "lo = 0", "latex": false }
```

Plain text by default. Set `"latex": true` to render `text` as a LaTeX
expression via KaTeX. When LaTeX is true, escape backslashes in JSON:
`"text": "v_y = \\tanh(z)"`.

### `axes` — coordinate system

```json
{ "type": "axes", "xMin": 0, "xMax": 40, "yMin": 0, "yMax": 8 }
```

Include at most one `axes` primitive per scene. When present,
`plot`/`shape`/`arrow`/`label` primitives use its bounds to project their
`x`/`y` values into viewBox pixels. Without it, those primitives use
viewBox pixels directly.

### `plot` — line/scatter

```json
{
  "type": "plot",
  "points": [[0, 0], [0.4, 3.22], [0.8, 4.86]],
  "label": "trajectory"
}
```

Draws a connected path through the points (if more than one) with dots at
each point. The path `d` animates when points change across steps, so
adding a point at the end gives a growing-trajectory effect.

### `graph` — nodes + edges

```json
{
  "type": "graph",
  "directed": true,
  "nodes": [
    { "id": "A", "x": 150, "y": 230, "fill": "#86efac" },
    { "id": "B", "x": 400, "y": 110, "highlight": true }
  ],
  "edges": [
    { "from": "A", "to": "B", "weight": 4, "highlight": true }
  ]
}
```

- `directed` on the graph makes all edges arrows (or set per-edge)
- `nodes[].fill` — override fill color. Common conventions:
  `#93c5fd` blue = discovered, `#86efac` green = visited
- `nodes[].highlight: true` — yellow ring + bold label. Use for "currently
  active" node.
- `edges[].weight` — rendered as a pill label at the midpoint
- `edges[].highlight: true` — yellow stroke + thicker line

Edges can also be simple tuples (`["A", "B"]`) for unweighted undirected
graphs — backward compatible with old notebooks.

## Quiz section

After the last scene block, a `## Quiz` heading opens a quiz cell:

```markdown
## Quiz

?? The first question text.
>> The expected answer or rubric.

?? Another question.
>> Another rubric.
```

Questions start with `??` and run until the next `>>` or `??`. Rubrics are
shown as "expected answer" behind a `<details>` toggle in Read mode.

Multiple questions per quiz are supported — each `??` / `>>` pair is a
distinct question.

### Typed questions (Phase 6)

Add a `[type]` tag right after `??` to get a specialized input + local,
deterministic grading (no Claude round-trip) for the closed kinds.
Omitting the tag keeps the legacy short-answer behaviour.

**Multiple choice** (`mcq`) — follow the question with a markdown list.
Mark the correct option with `[x]`, `(x)`, or a `✓`:

```markdown
?? [mcq] What is the time complexity of binary search?
- O(n)
- [x] O(log n)
- O(n log n)
>> Each step halves the search space.
```

**True / false** — the rubric starts with `[true]` or `[false]`:

```markdown
?? [truefalse] Merge sort is stable.
>> [true] Merging preserves the original order of equal keys.
```

**Numeric** — the rubric is a number. Optional `tol=` in the tag for
absolute tolerance:

```markdown
?? [numeric tol=0.01] What is g on Earth, in m/s²?
>> 9.81
```

**Short answer** — `?? [short]` or no tag. Rubric is sent to Claude
for grading:

```markdown
?? Why does v_y = 0 at the peak?
>> Vertical velocity has been consumed by gravity.
```

In test mode (header → 📝 Test), mcq renders as a radio group,
truefalse as two buttons, numeric as an input box, short as a
textarea. Mcq/truefalse/numeric grade instantly and locally; short
still hits Claude.

## Authoring tips

### Code-line discipline

The `code_lines` on step N+1 should logically follow step N. Jumping from
a base-case line into the middle of a helper function confuses students.
If you need to skip a phase (e.g. recursion unrolling), explain it in
prose *before* the scene steps — don't just jump line numbers.

### Stable ids for moving things

Any primitive that represents "the same logical object" across steps
(a ball, a pointer, a rotating vector) should have an `id` that's
consistent between steps. The renderer uses `${type}:${id}` as the React
key, so the DOM element persists and Framer Motion tweens the position.

### Prefer LaTeX for equations

In prose, use `$v_y = v_0 \sin\theta$` rather than unicode hacks like
`vᵧ = v₀·sin(θ)`. Same in `label` primitives with `latex: true`.

### Keep scene JSON compact but readable

JSON is allowed to span multiple lines. Format for readability, especially
for `nodes`/`edges`/`primitives` arrays. The parser is whitespace-forgiving.

### Use `·` or `_` for unfilled cells

DP tables and growing result arrays look better with explicit placeholders
than with pre-filled zeros. The `matrix` and `grid` primitives both
accept strings so you can mix `"·"` (dot) with numbers.

### One code block per cell

The cell's "code" is the first code block that isn't a scene fence. If you
have multiple Python code blocks, only the first gets the `code_lines`
debugger highlight. Keep supplementary code examples in prose.

## Full example

See any of:

- `notebooks/binary-search.tbk` — short, one grid primitive, clean
- `notebooks/merge-sort.tbk` — long execution trace, multiple grids
- `notebooks/projectile-motion.tbk` — physics with tweening + LaTeX
- `notebooks/lcs-dp.tbk` — 2D DP with matrix primitive
- `notebooks/dijkstra.tbk` — weighted directed graph
- `notebooks/methane-combustion.tbk` — chemistry with `molecule` plugin
- `notebooks/qubit-gates.tbk` — quantum with `bloch` plugin
