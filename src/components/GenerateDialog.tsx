import { useEffect, useRef, useState } from "react";
import { claudePromptStream } from "../lib/claude";
import { TBK_FORMAT_GUIDE, stripOuterFence } from "../lib/prompts";

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerated: (tbk: string) => void;
};

export default function GenerateDialog({ open, onClose, onGenerated }: Props) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setPreview("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [preview]);

  const cleanup = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  useEffect(() => {
    if (!open) cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    cleanup();
    onClose();
  };

  async function submit() {
    const q = request.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setPreview("");

    const ac = new AbortController();
    abortRef.current = ac;

    const userPrompt =
      `Generate a Teachbook notebook for this request:\n\n${q}\n\n` +
      `Remember: respond with ONLY the raw .tbk file contents starting with ---. ` +
      `No prose before, no code fences around it.`;

    try {
      await claudePromptStream(
        userPrompt,
        TBK_FORMAT_GUIDE,
        {
          onChunk: (chunk) => setPreview((cur) => cur + chunk),
          onDone: (full) => {
            if (ac.signal.aborted) return;
            const cleaned = stripOuterFence(full);
            onGenerated(cleaned);
            setRequest("");
            setPreview("");
            onClose();
          },
          onError: (msg) => setError(msg),
        },
        { signal: ac.signal },
      );
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        // error already set via onError
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setBusy(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={busy ? undefined : handleClose}
    >
      <div
        className="w-[640px] max-w-[92vw] max-h-[85vh] flex flex-col rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-1">Generate a notebook</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Describe what you want to teach. Claude will stream a complete
          Teachbook notebook with stepped visualizations.
        </p>
        <textarea
          ref={textareaRef}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === "Escape" && !busy) handleClose();
          }}
          placeholder="e.g. Teach binary search on a sorted array of 8 numbers."
          rows={3}
          disabled={busy}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm disabled:opacity-50 resize-none shrink-0"
        />

        {(busy || preview) && (
          <div className="mt-3 flex-1 min-h-0 flex flex-col">
            <div className="text-xs text-zinc-500 mb-1">
              {busy ? "Streaming…" : "Preview"}
            </div>
            <pre
              ref={previewRef}
              className="flex-1 min-h-0 overflow-auto rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono p-2 whitespace-pre-wrap break-words"
            >
              {preview}
              {busy && <span className="animate-pulse text-zinc-400">▍</span>}
            </pre>
          </div>
        )}

        {error && (
          <div className="mt-2 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-1 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto shrink-0">
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between shrink-0">
          <div className="text-xs text-zinc-400">
            {busy ? "Claude is writing…" : "⌘/Ctrl + Enter to submit · Esc to cancel"}
          </div>
          <div className="flex gap-2">
            {busy ? (
              <button
                onClick={cancel}
                className="rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-sm hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-400"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-sm"
              >
                Cancel
              </button>
            )}
            <button
              onClick={submit}
              disabled={busy || !request.trim()}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
