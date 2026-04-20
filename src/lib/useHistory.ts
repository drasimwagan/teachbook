import { useCallback, useRef, useState } from "react";

export type HistoryEntry = {
  source: string;
  currentStep: number;
  currentPath: string | null;
  label: string;
};

const MAX_ENTRIES = 20;

/**
 * Snapshot history for programmatic source changes only (generate, insert,
 * open). Manual CodeMirror typing is covered by CM's own undo stack.
 * `snapshot()` captures the state that existed BEFORE the mutation you're
 * about to apply — call it right before `setSource`.
 */
export function useHistory() {
  const [stack, setStack] = useState<HistoryEntry[]>([]);
  const latestRef = useRef(stack);
  latestRef.current = stack;

  const snapshot = useCallback((entry: HistoryEntry) => {
    setStack((cur) => {
      const next = [...cur, entry];
      if (next.length > MAX_ENTRIES) next.shift();
      return next;
    });
  }, []);

  const undo = useCallback((): HistoryEntry | null => {
    const cur = latestRef.current;
    if (cur.length === 0) return null;
    const last = cur[cur.length - 1];
    setStack(cur.slice(0, -1));
    return last;
  }, []);

  const clear = useCallback(() => setStack([]), []);

  const lastLabel = stack.length > 0 ? stack[stack.length - 1].label : null;

  return {
    snapshot,
    undo,
    clear,
    depth: stack.length,
    lastLabel,
  };
}
