/**
 * Single source of truth for prompts Claude needs to generate or edit .tbk
 * notebooks. If the format changes, update this file AND the example notebooks
 * AND docs/PLAN.md in the same commit.
 */

export const TBK_FORMAT_GUIDE = `You generate Teachbook notebooks (.tbk files). A .tbk file is Markdown with:

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
- grid: { type: "grid", values: [...], highlight?: [indices] }
- shape: { type: "shape", id?, shape: "circle"|"rect"|"polygon", x, y, radius?, width?, height?, fill?, stroke? }
- arrow: { type: "arrow", id?, from: [x, y], to: [x, y], label? }
- label: { type: "label", id?, x, y, text, latex? }
  // When latex is true, \`text\` is a LaTeX expression (e.g. "v_y = \\\\frac{1}{2} g t^2").
  // Prefer LaTeX for any equation. Escape backslashes in JSON: \\\\frac, \\\\theta, \\\\approx.
- axes: { type: "axes", xMin, xMax, yMin, yMax }  // include with physics/plots
- plot: { type: "plot", points: [[x,y],...], label? }
- graph: { type: "graph", nodes: [{id, x, y, label?}], edges: [[a,b],...] }

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

Quality bar:
- 4-8 scene steps per concept, each with a clear narration.
- Steps advance the story; don't repeat scenes.
- Respond with ONLY the .tbk file contents. Start with --- and end with the last char.
  Do NOT wrap your response in \`\`\`markdown fences.
`;

/** Strip outer markdown fences Claude sometimes wraps around its response. */
export function stripOuterFence(s: string): string {
  const trimmed = s.trim();
  const outer = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/;
  const m = trimmed.match(outer);
  return m ? m[1] : trimmed;
}
