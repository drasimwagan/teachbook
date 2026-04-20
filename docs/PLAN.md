# Teachbook — Plan & Design Decisions

This document captures decisions made during initial planning. When a decision
changes, update this file in the same commit.

## Vision

A self-hosted desktop app that turns Claude into a step-by-step tutor for any
subject where concepts are taught as **state → step → scene**: algorithms,
physics, chemistry, biology, math, and more. Teachers author notebooks;
students play them like debuggers.

## Target users

- **Students**: load a notebook, step through the concept, ask Claude questions,
  take quizzes assigned by a teacher.
- **Teachers**: write a prompt or prose, let Claude generate the step-by-step
  notebook, tweak, distribute to students as a single `.tbk` file.
- **Self-learners**: same as students, with no teacher involved.

## Locked decisions

| Decision | Value | Why |
|----------|-------|-----|
| Distribution | Desktop app (Tauri) | No funding for hosting; students install locally |
| Shell | Tauri 2 over Electron | ~10 MB vs. ~150 MB, less RAM, native feel |
| Frontend | React 19 + TS + Vite + Tailwind | Standard, contributor-friendly |
| Editor | CodeMirror 6 | Lighter than Monaco, better theming |
| Animation | Framer Motion | Tween scenes between steps |
| Student code exec | Pyodide (WASM, planned) | No subprocess, offline-capable |
| AI integration (v0.1) | Claude Code CLI subprocess | Audience already has the subscription |
| AI integration (v0.2) | Direct Anthropic API key | Fallback for users without Claude Code |
| File format | Markdown-primary `.tbk` | Human-readable, git-diffable, shareable |
| License | MIT | Maximum adoption |
| Authoring | Solo-first, public when v0.1 works | Reduce contributor overhead early |

## The core abstraction

Every subject reduces to **state → step → scene**. A notebook is a sequence of
pre-computed steps; each step carries a scene snapshot. The renderer is subject-
agnostic.

### 8 core primitives

Target ~80% coverage across subjects with these:

1. `shape` — circle, rect, polygon (nodes, masses, atoms, cells)
2. `arrow` — pointers, force vectors, bonds, signals
3. `label` — including LaTeX via KaTeX for equations
4. `axes` — coordinate system for physics / plots / math
5. `plot` — 2D line or scatter (position-time, titration, growth)
6. `graph` — nodes + edges (trees, networks, molecular graph, pedigrees)
7. `grid` — arrays, matrices, DP tables, lattices, Punnett squares
8. Color state — "highlighted", "active", "reactant", etc. applied to any primitive

### Plugin primitives (v0.2+)

Community-contributed renderers for specialized domains:
`@teachbook/molecule`, `@teachbook/circuit`, `@teachbook/ray-optics`, etc.
Each plugin is a TS module exporting a React component + a JSON schema Claude
can target.

## `.tbk` file format

Valid Markdown. Example:

````markdown
---
version: 0.1
title: Bubble Sort
subject: algorithms
author: Ms. Chen
---

# What is sorting?

Sorting arranges elements in order.

```python
def bubble_sort(arr): ...
```

```scene step=0 narration="Initial array"
{ "primitives": [ {"type": "grid", "values": [5,2,8,1,9]} ] }
```

```scene step=1 narration="Compare indices 0 and 1"
{ "primitives": [ {"type": "grid", "values": [5,2,8,1,9], "highlight": [0,1]} ] }
```

## Quiz

?? What is the time complexity?
>> Student should identify O(n²) and explain the nested loop.
````

Parser lives in `src/lib/tbk-parser.ts` (to be written). Uses `remark` +
`remark-frontmatter`. Scene blocks are `code` nodes with `lang === "scene"`.

## Roadmap

### Phase 0 — Spike (current)
- [x] Scaffold Tauri + React + TS
- [x] Empty three-pane layout
- [x] Rust stubs for notebook I/O
- [ ] Hardcoded bubble-sort notebook proof-of-concept
- [ ] Scene renderer for `grid` primitive
- [ ] Play/step controls wired end-to-end

### Phase 1 — `.tbk` parser + Claude authoring
- [x] Write `tbk-parser.ts` and `tbk-serializer.ts` (round-trip safe)
- [x] All 8 core primitives in `SceneRenderer.tsx`
- [x] Rust command to spawn `claude` CLI as subprocess (`claude_prompt`, `claude_generate_notebook`)
- [x] "Generate notebook" dialog — teacher types a prompt, Claude returns a full `.tbk`
- [x] Chat wired to Claude with notebook + step context
- [ ] Render Markdown prose in concept pane (still CodeMirror-only)
- [ ] Stream responses via Tauri events (currently blocking)

### Phase 2 — Chat pane + student interactivity
- [ ] Chat pane wired to Claude with notebook context
- [ ] Pyodide integration for running student Python in-browser
- [ ] Click a scene element → ask about it in chat

### Phase 3 — Bi-directional editing
- [ ] Drag an arrow / node in the visualization → scene JSON updates
- [ ] Code change → Claude regenerates affected steps

### Phase 4 — Test mode
- [ ] Teacher-authored quiz notebooks
- [ ] Claude evaluates student answers against rubric

### Phase 5 — Community
- [ ] Plugin primitive API + docs
- [ ] Notebook gallery (just a GitHub repo)
- [ ] API-key mode (v0.2)

## Open design questions (decide when we reach them)

1. **Scene coordinate system**: fixed `viewBox 0 0 800 500`, or domain-driven
   (physics uses metric units, algorithms uses grid indices)? Likely per-scene
   with a `coords` block.
2. **LaTeX rendering**: KaTeX (faster) vs MathJax (more complete)? Lean KaTeX.
3. **Scene diff vs. full snapshot per step**: diffs are smaller but fragile; full
   snapshots are larger but robust. Start with snapshots, add diffing if file
   sizes hurt.
4. **Multi-language code cells**: Python via Pyodide first. JS / others later
   via separate WASM runtimes.
5. **Plugin loading security**: runtime `import()` of untrusted plugins is risky.
   Likely ship curated plugins in v0.2, user-installed plugins later behind a
   trust prompt.

## Non-goals

- Web SaaS / hosted service.
- Multi-user collaboration / accounts.
- Running student code server-side.
- Replacing Jupyter for research. This is a teaching tool.
