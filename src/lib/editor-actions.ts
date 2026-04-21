import type { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import type { Notebook } from "../types";

/** Compute the next-available step number for a new scene in this notebook. */
export function nextStepNumber(notebook: Notebook | null): number {
  if (!notebook) return 0;
  // Step numbers in meta are author-controlled strings; we don't enforce
  // monotonicity. Use the total step count as the "next" suggestion — it's
  // a sensible default that doesn't collide.
  return notebook.totalSteps;
}

export function sceneTemplate(step: number): string {
  return [
    "",
    `\`\`\`scene step=${step} narration="describe what this step shows" code_lines=1`,
    `{ "primitives": [`,
    `  {"type":"label","x":400,"y":250,"text":"edit me","latex":false}`,
    `] }`,
    "```",
    "",
  ].join("\n");
}

export function quizTemplate(): string {
  return [
    "",
    "## Quiz",
    "",
    "?? question text",
    ">> model answer (used as grading rubric)",
    "",
  ].join("\n");
}

/** Insert a block of text at the editor's cursor. */
export function insertAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
  });
  view.focus();
}

export function openFind(view: EditorView): void {
  openSearchPanel(view);
  view.focus();
}

/**
 * Given a 1-indexed cursor line, find which step's scene fence contains it.
 * Returns the global step index, or null if the cursor isn't inside any
 * scene fence.
 */
export function stepAtLine(
  notebook: Notebook | null,
  cursorLine: number,
): number | null {
  if (!notebook) return null;
  let globalIdx = 0;
  for (const cell of notebook.cells) {
    for (const step of cell.steps) {
      if (
        step.sourceLine != null &&
        step.sourceEndLine != null &&
        cursorLine >= step.sourceLine &&
        cursorLine <= step.sourceEndLine
      ) {
        return globalIdx;
      }
      globalIdx++;
    }
  }
  return null;
}
