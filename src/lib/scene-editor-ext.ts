import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { foldService } from "@codemirror/language";
import { linter, lintGutter, setDiagnostics } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { ParseDiagnostic } from "./tbk-parser";

/**
 * Push the latest parser diagnostics onto the editor as CodeMirror lint
 * decorations. Call whenever the errors prop changes.
 *
 * We convert 1-indexed line ranges into character offsets. Lines outside
 * the current document (stale from a previous parse) are clamped silently.
 */
export function pushDiagnostics(
  view: EditorView,
  errors: ParseDiagnostic[],
): void {
  const diags: Diagnostic[] = [];
  const doc = view.state.doc;
  for (const e of errors) {
    if (e.startLine == null) continue;
    const startLine = Math.max(1, Math.min(doc.lines, e.startLine));
    const endLine = Math.max(
      startLine,
      Math.min(doc.lines, e.endLine ?? e.startLine),
    );
    const from = doc.line(startLine).from;
    const to = doc.line(endLine).to;
    diags.push({
      from,
      to,
      severity: "error",
      message: e.message,
    });
  }
  view.dispatch(setDiagnostics(view.state, diags));
}

/**
 * Empty linter source — we feed diagnostics imperatively via pushDiagnostics,
 * but the linter extension needs to be installed for the lint state to work.
 */
export const lintStub = linter(() => []);
export const lintGutterExt = lintGutter();

/**
 * Fold service that collapses the body of a ```scene fence, keeping the
 * opening ```scene … meta line and the closing ``` visible.
 */
export const sceneFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  if (!/^```scene\b/.test(line.text)) return null;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n);
    if (/^```\s*$/.test(next.text)) {
      // Fold from end of opening fence line to end of the line before the
      // closing fence. Leaves the close visible so the fold indicator lines
      // up with the full block.
      const bodyEnd = state.doc.line(n - 1).to;
      if (bodyEnd <= line.to) return null; // empty body, nothing to fold
      return { from: line.to, to: bodyEnd };
    }
  }
  return null;
});

/**
 * Pretty-print (JSON.stringify with 2-space indent) the scene fence that
 * contains the cursor. Returns true if a fence was formatted.
 */
export function formatSceneAtCursor(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const cursorLine = view.state.doc.lineAt(pos).number;
  const range = findEnclosingSceneFence(view.state, cursorLine);
  if (!range) return false;
  const { bodyFrom, bodyTo } = range;
  const body = view.state.sliceDoc(bodyFrom, bodyTo);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  const pretty = JSON.stringify(parsed, null, 2);
  if (pretty === body) return true; // already formatted; treat as success
  view.dispatch({
    changes: { from: bodyFrom, to: bodyTo, insert: pretty },
    scrollIntoView: true,
  });
  return true;
}

function findEnclosingSceneFence(
  state: EditorState,
  cursorLine: number,
): { openLine: number; closeLine: number; bodyFrom: number; bodyTo: number } | null {
  // Scan backward for ```scene; bail if we hit a bare ``` first (that means
  // the cursor sits outside any fence, inside a non-scene fence, or below
  // a closed scene).
  let openLine = -1;
  for (let n = cursorLine; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (/^```scene\b/.test(text)) {
      openLine = n;
      break;
    }
    if (n !== cursorLine && /^```\s*$/.test(text)) return null;
  }
  if (openLine < 0) return null;
  // Scan forward for the matching closing fence.
  let closeLine = -1;
  for (let n = openLine + 1; n <= state.doc.lines; n++) {
    const text = state.doc.line(n).text;
    if (/^```\s*$/.test(text)) {
      closeLine = n;
      break;
    }
  }
  if (closeLine < 0 || closeLine <= openLine + 1) return null;
  const bodyFrom = state.doc.line(openLine + 1).from;
  const bodyTo = state.doc.line(closeLine - 1).to;
  return { openLine, closeLine, bodyFrom, bodyTo };
}
