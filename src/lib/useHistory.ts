import { useCallback, useRef, useState } from "react";

export type HistoryEntry = {
  source: string;
  currentStep: number;
  currentPath: string | null;
  label: string;
};

const MAX_ENTRIES = 20;

/**
 * Undo/redo stack for programmatic source changes (generate, insert, open).
 * Manual CodeMirror typing is covered by CM's own undo stack.
 *
 * Callers pass the current state to undo()/redo() so the hook can push it onto
 * the opposite stack — that's what makes the two operations symmetric.
 * A fresh snapshot() always clears the redo stack, matching standard editor
 * behavior (once you take a new action, "forward" history is abandoned).
 */
export function useHistory() {
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const undoRef = useRef(undoStack);
  const redoRef = useRef(redoStack);
  undoRef.current = undoStack;
  redoRef.current = redoStack;

  const snapshot = useCallback((entry: HistoryEntry) => {
    setUndoStack((cur) => {
      const next = [...cur, entry];
      if (next.length > MAX_ENTRIES) next.shift();
      return next;
    });
    setRedoStack([]); // new action abandons the redo future
  }, []);

  const undo = useCallback(
    (current: HistoryEntry): HistoryEntry | null => {
      const stack = undoRef.current;
      if (stack.length === 0) return null;
      const last = stack[stack.length - 1];
      setUndoStack(stack.slice(0, -1));
      setRedoStack((cur) => {
        const next = [...cur, current];
        if (next.length > MAX_ENTRIES) next.shift();
        return next;
      });
      return last;
    },
    [],
  );

  const redo = useCallback(
    (current: HistoryEntry): HistoryEntry | null => {
      const stack = redoRef.current;
      if (stack.length === 0) return null;
      const last = stack[stack.length - 1];
      setRedoStack(stack.slice(0, -1));
      setUndoStack((cur) => {
        const next = [...cur, current];
        if (next.length > MAX_ENTRIES) next.shift();
        return next;
      });
      return last;
    },
    [],
  );

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    snapshot,
    undo,
    redo,
    clear,
    undoDepth: undoStack.length,
    redoDepth: redoStack.length,
    undoLabel: undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null,
    redoLabel: redoStack.length > 0 ? redoStack[redoStack.length - 1].label : null,
  };
}
