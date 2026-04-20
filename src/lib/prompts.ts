/**
 * Single source of truth for prompts Claude needs to generate or edit .tbk
 * notebooks. If the format changes, update this file AND the example notebooks
 * AND docs/PLAN.md in the same commit.
 *
 * TBK_FORMAT_GUIDE is dynamically assembled from CORE_GUIDE + every registered
 * plugin's schemaDoc (see src/plugins). Accessing it as a getter ensures any
 * plugin that registers after module load is still reflected — but in
 * practice all plugins register eagerly in src/plugins/index.ts, so this is
 * also safe to read once at startup.
 */

import { listPlugins } from "../plugins";

const CORE_GUIDE = `You generate Teachbook notebooks (.tbk files). A .tbk file is Markdown with:

1. YAML frontmatter: title, subject, author, version (0.1)
2. Prose (Markdown) explaining the concept. Supports LaTeX: inline $...$ and block $$...$$.
3. Exactly ONE fenced code block per cell — the "solution steps". Python or plain text.
4. Scene blocks: \`\`\`scene step=N narration="..." code_lines=M-K
   with JSON body: {"primitives": [...]}
5. Optional quiz section:
   ## Quiz
   ?? question text
   >> rubric / expected answer

Scene primitive types (pick those that fit; all have type=<name>):
- grid: { type: "grid", values: [...], highlight?: [indices], x?, y?, cellSize?, label? }
  // Default: one grid per scene, auto-centered. For algorithm traces that
  // need multiple arrays (e.g. left/right/result in merge sort), set x/y for
  // each grid explicitly and use cellSize around 36-40 so they fit. Use the
  // "label" field to name the array (e.g. "left", "result"). Use "_" or
  // similar placeholder strings for empty slots in a growing result array.
- shape: { type: "shape", id?, shape: "circle"|"rect"|"polygon", x, y, radius?, width?, height?, fill?, stroke? }
- arrow: { type: "arrow", id?, from: [x, y], to: [x, y], label? }
- label: { type: "label", id?, x, y, text, latex? }
  // When latex is true, \`text\` is a LaTeX expression (e.g. "v_y = \\\\frac{1}{2} g t^2").
  // Prefer LaTeX for any equation. Escape backslashes in JSON: \\\\frac, \\\\theta, \\\\approx.
- axes: { type: "axes", xMin, xMax, yMin, yMax }  // include with physics/plots
- plot: { type: "plot", points: [[x,y],...], label? }
- graph: {
    type: "graph",
    directed?,
    nodes: [{id, x, y, label?, fill?, highlight?}],
    edges: [[a,b], ...]  // simple
           OR {from, to, weight?, highlight?, directed?}  // rich
  }
  // Use node.highlight for "currently active" (yellow ring).
  // Use node.fill to indicate state: "#93c5fd" = discovered, "#86efac" = visited.
  // Use edge.highlight on the edge being traversed/relaxed right now.
  // Use edge.weight for weighted graphs (Dijkstra, MST, etc.).
  // Set directed: true at graph level for all-directed, or per-edge for mixed.
- matrix: {
    type: "matrix",
    rows: [[...]],         // 2D array of values (numbers or strings)
    x?, y?, cellSize?, label?,
    rowLabels?: [...],
    colLabels?: [...],
    highlight?: [[r, c], ...]  // (row, col) pairs
  }
  // Use for DP tables, confusion matrices, Punnett squares, etc.
  // Use "·" or "_" for not-yet-filled cells so students see the fill progress.

Prose supports LaTeX too: inline $...$ and block $$...$$. Prefer this over
unicode subscripts or fractions.

Coordinate rules:
- With axes, use the domain units (meters, seconds, etc.). Other primitives auto-project.
- Without axes, positions are in a fixed 800x500 viewBox.

IMPORTANT — animation via stable ids:
  When the same logical object appears across multiple steps at different
  positions (a moving ball, a pointer advancing along an array, a rotating
  arrow), give it the SAME id in every step. Framer Motion then tweens its
  position smoothly between steps. Example: the ball in projectile motion has
  id: "ball" in all six scenes, so it arcs through the trajectory.
  Omit id when the primitive appears only once or isn't the "same thing".

code_lines is 1-indexed and relative to the cell's code block (not the source file).
Use it on EVERY scene block so students see the debugger-style line highlight.

Execution-trace discipline (important for algorithm notebooks):
- code_lines on step N+1 must logically follow code_lines on step N.
  Jumping from a base-case line straight to deep inside a helper function
  without intermediate steps leaves students guessing how we got there.
- Show every non-trivial intermediate variable (pointers, accumulators,
  result arrays) explicitly, usually as their own primitive or label. Don't
  describe "after the swap" in narration when the swap itself wasn't shown.
- If you skip a phase for brevity (e.g. recursion), say so in the prose
  BEFORE the scene steps, not by silently jumping code_lines.

Quality bar:
- 4-8 scene steps per concept, each with a clear narration.
- Steps advance the story; don't repeat scenes.
- Respond with ONLY the .tbk file contents. Start with --- and end with the last char.
  Do NOT wrap your response in \`\`\`markdown fences.
`;

function pluginsGuideSection(): string {
  const plugins = listPlugins();
  if (plugins.length === 0) return "";
  const byCategory = new Map<string, typeof plugins>();
  for (const p of plugins) {
    const arr = byCategory.get(p.category) ?? [];
    arr.push(p);
    byCategory.set(p.category, arr);
  }
  const sections: string[] = [
    "",
    "DOMAIN PLUGIN PRIMITIVES (use these when the subject fits):",
    "",
  ];
  for (const [cat, list] of byCategory) {
    sections.push(`[${cat}]`);
    for (const p of list) {
      sections.push(`- ${p.schemaDoc}`);
      sections.push(`  ${p.description}`);
    }
    sections.push("");
  }
  return sections.join("\n");
}

/**
 * Assembled format guide — core rules plus every registered plugin's schemaDoc.
 * Read at prompt-build time so new plugins automatically teach Claude their
 * primitive shape without touching this file.
 */
export const TBK_FORMAT_GUIDE: string = CORE_GUIDE + pluginsGuideSection();

/** Strip outer markdown fences Claude sometimes wraps around its response. */
export function stripOuterFence(s: string): string {
  const trimmed = s.trim();
  const outer = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/;
  const m = trimmed.match(outer);
  return m ? m[1] : trimmed;
}
