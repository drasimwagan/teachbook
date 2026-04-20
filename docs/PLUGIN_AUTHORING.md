# Authoring Teachbook plugins

Teachbook's visualization engine ships with 8 core primitives that cover most
step-by-step teaching (grid, shape, arrow, label, axes, plot, graph, matrix).
Plugins extend the engine with **domain-specific primitives** — molecules for
chemistry, Bloch spheres for quantum mechanics, circuit diagrams, phylogenetic
trees, etc.

This document walks through adding a new plugin.

## How plugins work

- Each plugin is a TypeScript file under `src/plugins/<category>/<name>.tsx`.
- Plugins **statically register at compile time** — no dynamic code loading,
  no URL fetches. This is deliberate: it keeps the security model simple
  (all code is checked into the repo and reviewed) and means we never execute
  untrusted plugins.
- Once registered, a plugin's `type` string is usable in any `.tbk` scene
  block's `primitives` array. The scene renderer falls through to the plugin
  registry for any primitive type it doesn't recognize as core.
- Each plugin's `schemaDoc` is auto-added to the format guide that Claude
  sees when generating or editing notebooks — so `Generate` and
  `+ Add step` start producing correct JSON for the new primitive
  immediately after a plugin is merged.

## The `TeachbookPlugin` interface

See `src/plugins/types.ts`. Every plugin must export an object with these
fields:

```ts
{
  type: string;        // unique primitive type, e.g. "molecule"
  category: string;    // domain: "chemistry", "quantum", "electronics", ...
  description: string; // one-line summary shown in docs and the format guide
  schemaDoc: string;   // JSON shape + a few lines of usage notes for Claude
  render: (primitive, ctx) => ReactElement | null;
}
```

The `render` function receives:

```ts
primitive: { type: string; [key: string]: unknown }
```

Your plugin is responsible for narrowing this to its expected shape and
validating the fields. If the primitive is malformed, return an SVG `<text>`
element describing the problem so authors see the error inline.

The `ctx` argument carries the scene's axes (if any) and viewBox dimensions
(always 800 × 500). It also provides a `project(x, y)` helper that maps
domain coordinates through the axes if present, or passes them through.

## Walkthrough: the molecule plugin

Full source: `src/plugins/chemistry/molecule.tsx`.

### 1. Define the primitive shape

```ts
type MoleculePrimitive = {
  type: "molecule";
  atoms: { id: string; element: string; x: number; y: number }[];
  bonds: { from: string; to: string; order?: 1 | 2 | 3 }[];
  label?: string;
  scale?: number;   // multiplier on atom coords
  ox?: number;      // origin x (viewBox px)
  oy?: number;      // origin y (viewBox px)
};
```

Atoms are placed at `(ox + x*scale, oy + y*scale)`. This lets authors write
clean integer-ish coordinates like `x: 0, y: -1` and scale them globally.

### 2. Write the render function

```tsx
export const moleculePlugin: TeachbookPlugin = {
  type: "molecule",
  category: "chemistry",
  description: "2D molecular structure with CPK-colored atoms and bonds.",
  schemaDoc: `molecule: { type: "molecule", atoms: [{id, element, x, y}], bonds: [{from, to, order?}], label?, scale?, ox?, oy? }
  ...usage notes for Claude...`,

  render: (primitive) => {
    const p = primitive as unknown as MoleculePrimitive;
    // ... draw bonds first, then atoms on top
  },
};
```

### 3. Register it

Open `src/plugins/index.ts` and add your plugin to `allPlugins`:

```ts
import { moleculePlugin } from "./chemistry/molecule";

export const allPlugins: TeachbookPlugin[] = [
  moleculePlugin,
  // ... add more here
];
```

That's it — the scene renderer and the format guide pick it up automatically.

## Best practices

### Use `motion.*` components for cross-step tweening

Import `motion` from `framer-motion` and use `motion.circle`, `motion.line`,
etc. for elements whose position or color changes across steps. React keys
primitives by array position in the scene, so if an atom keeps the same `id`
across steps, `motion.g` with `animate={{ x, y }}` will tween its motion.

See the `Bonds` subcomponent in `molecule.tsx` for a worked example.

### Respect the viewBox

The rendering surface is always 800 × 500. Don't use absolute pixel values
above these bounds. When you need domain-specific coordinates (angstroms,
volts, …), use `ctx.project(x, y)` if an axes primitive is present, or
define your own origin + scale fields.

### Keep `schemaDoc` short

Claude reads the full format guide every time a user Generates a notebook.
Aim for 5–8 lines per plugin, including:

- The JSON shape on one line
- 3–4 lines of usage notes: coordinate conventions, typical field values,
  which fields are required

### Name your type without prefixes

Core primitives use bare names (`grid`, `shape`). Plugins should too
(`molecule`, `circuit`). The legacy `plugin:xxx` convention from the very
early PLAN is deprecated.

### Don't collide with core types

The reserved primitive types are: `grid`, `shape`, `arrow`, `label`, `axes`,
`plot`, `graph`, `matrix`. Pick something distinct for your plugin. A warning
prints to the console if two plugins register the same type.

### Fail visibly, not silently

If required fields are missing, return:

```tsx
<text x={10} y={20} fontSize={12} fill="#b91c1c">
  yourtype: explanation of what's missing
</text>
```

This shows up right in the visualization pane so authors fix their notebook
instead of wondering why nothing rendered.

## Adding an example notebook

Plugins without a demo notebook aren't useful. After adding your plugin, drop
a `.tbk` into `notebooks/` that exercises it, then wire it into
`src-tauri/src/examples.rs` with `include_str!` so it appears in the
Examples gallery. Keep it short (6–10 steps is plenty for a new primitive
showcase) and include a quiz.

## Ideas for plugin contributions

- `quantum`: Bloch sphere, energy-level diagram, superposition amplitudes
- `electronics`: circuit schematic (resistor, cap, inductor, source symbols)
- `biology`: phylogenetic tree, Punnett square, DNA strand with base pairs
- `math`: Venn diagram, number line, polar plot
- `image`: pixel heatmap with kernel window (for image processing / CNN kernels)
- `nn`: neural network layer diagram with weighted connections
- `physics`: vector field, free-body diagram, ray-optics lens/mirror

## Discussing a plugin

Open an issue on the repo describing the domain, the primitive shape, and a
sample notebook idea. The maintainers will help nail down the schema before
you write the code — we'd rather iterate on the JSON contract in an issue
than after a big PR lands.
