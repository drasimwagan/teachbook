import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { parseTbk } from "../lib/tbk-parser";

type BundledNotebook = { filename: string; content: string };

type Card = {
  filename: string;
  content: string;
  title: string;
  subject: string;
  steps: number;
  summary: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (tbk: string, filename: string) => void;
};

const SUBJECT_ACCENT: Record<string, string> = {
  algorithms: "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200",
  physics: "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200",
  chemistry: "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200",
  biology: "bg-lime-100 dark:bg-lime-950 text-lime-800 dark:text-lime-200",
  math: "bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200",
};

function summarize(prose: string): string {
  const first = prose
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("```"))
    .join(" ")
    .trim();
  if (first.length <= 160) return first;
  return first.slice(0, 157).trimEnd() + "…";
}

export default function ExamplesDialog({ open, onClose, onSelect }: Props) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCards(null);
    invoke<BundledNotebook[]>("list_bundled_notebooks")
      .then((nbs) => {
        const parsed = nbs.map<Card>((nb) => {
          const { notebook } = parseTbk(nb.content);
          const firstProse =
            notebook.cells.find((c) => c.kind === "concept")?.prose ?? "";
          return {
            filename: nb.filename,
            content: nb.content,
            title: notebook.metadata.title,
            subject: notebook.metadata.subject || "—",
            steps: notebook.totalSteps,
            summary: summarize(firstProse),
          };
        });
        setCards(parsed);
      })
      .catch((e) => setError(String(e)));
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-[760px] max-w-full max-h-[85vh] overflow-hidden rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold">Example notebooks</h2>
            <p className="text-xs text-zinc-500">
              Pick one to start stepping through it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-3 py-2 text-xs font-mono">
              {error}
            </div>
          )}
          {cards === null && !error && (
            <div className="text-sm text-zinc-500">Loading…</div>
          )}
          {cards && cards.length === 0 && (
            <div className="text-sm text-zinc-500">No examples bundled.</div>
          )}
          {cards && cards.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cards.map((c) => (
                <li key={c.filename}>
                  <button
                    onClick={() => {
                      onSelect(c.content, c.filename);
                      onClose();
                    }}
                    className="w-full text-left rounded border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-600 p-3 transition bg-white dark:bg-zinc-950"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-sm">{c.title}</h3>
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                          (SUBJECT_ACCENT[c.subject] ??
                            "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300")
                        }
                      >
                        {c.subject}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mb-2 tabular-nums">
                      {c.steps} step{c.steps === 1 ? "" : "s"} ·{" "}
                      <span className="font-mono">{c.filename}</span>
                    </div>
                    {c.summary && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3">
                        {c.summary}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
