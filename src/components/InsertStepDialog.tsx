import { useEffect, useRef, useState } from "react";
import { insertStepAfter } from "../lib/notebook-edit";

type Props = {
  open: boolean;
  afterStepIndex: number;
  source: string;
  onClose: () => void;
  onInserted: (newSource: string, newStepIndex: number) => void;
};

export default function InsertStepDialog({
  open,
  afterStepIndex,
  source,
  onClose,
  onInserted,
}: Props) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setRequest("");
      setError(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  async function submit() {
    const q = request.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { newSource, newStepIndex } = await insertStepAfter({
        source,
        afterStepIndex,
        request: q,
      });
      onInserted(newSource, newStepIndex);
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-[520px] max-w-[90vw] rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-1">
          Insert a step after step {afterStepIndex + 1}
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          Describe what the new step should show. Claude will write a scene
          block consistent with the rest of the notebook.
        </p>
        <textarea
          ref={textareaRef}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === "Escape" && !busy) onClose();
          }}
          placeholder="e.g. Show the array after the second pass — 1 has bubbled to index 0."
          rows={3}
          disabled={busy}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm disabled:opacity-50 resize-none"
        />
        {error && (
          <div className="mt-2 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-1 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto">
            {error}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-zinc-400">
            {busy ? "Asking Claude…" : "⌘/Ctrl + Enter to submit · Esc to cancel"}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || !request.trim()}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
