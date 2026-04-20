import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { parseTbk } from "../lib/tbk-parser";

type BundledNotebook = { filename: string; content: string };
type UserNotebook = { filename: string; path: string; content: string };

type Card = {
  filename: string;
  content: string;
  path?: string;
  title: string;
  subject: string;
  steps: number;
  summary: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (tbk: string, filename: string, path?: string) => void;
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

function toCard(
  filename: string,
  content: string,
  path?: string,
): Card {
  const { notebook } = parseTbk(content);
  const firstProse =
    notebook.cells.find((c) => c.kind === "concept")?.prose ?? "";
  return {
    filename,
    content,
    path,
    title: notebook.metadata.title,
    subject: notebook.metadata.subject || "—",
    steps: notebook.totalSteps,
    summary: summarize(firstProse),
  };
}

export default function ExamplesDialog({ open, onClose, onSelect }: Props) {
  const [bundled, setBundled] = useState<Card[] | null>(null);
  const [userLib, setUserLib] = useState<Card[] | null>(null);
  const [userPath, setUserPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBundled(null);
    setUserLib(null);

    Promise.all([
      invoke<BundledNotebook[]>("list_bundled_notebooks"),
      invoke<UserNotebook[]>("list_user_notebooks").catch((e) => {
        // user dir errors are non-fatal; show [] + a warning
        console.warn("list_user_notebooks failed:", e);
        return [] as UserNotebook[];
      }),
      invoke<string>("user_notebooks_path").catch(() => null),
    ])
      .then(([b, u, path]) => {
        setBundled(b.map((nb) => toCard(nb.filename, nb.content)));
        setUserLib(u.map((nb) => toCard(nb.filename, nb.content, nb.path)));
        setUserPath(path);
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
        className="w-[840px] max-w-full max-h-[85vh] overflow-hidden rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold">Notebook library</h2>
            <p className="text-xs text-zinc-500">
              Pick a notebook to start stepping through it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {error && (
            <div className="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-3 py-2 text-xs font-mono">
              {error}
            </div>
          )}

          <Section title="Built-in examples" cards={bundled} onSelect={onSelect} />

          <Section
            title="Your library"
            cards={userLib}
            onSelect={onSelect}
            subtitle={
              userPath ? (
                <>
                  Drop any <code className="font-mono">.tbk</code> file into{" "}
                  <code className="font-mono">{userPath}</code> to see it here.{" "}
                  <button
                    onClick={() => userPath && openPath(userPath).catch(() => {})}
                    className="text-blue-600 underline"
                  >
                    Reveal folder
                  </button>
                </>
              ) : null
            }
            emptyText="Your folder is empty. Save a notebook or drop a .tbk file in."
          />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  cards,
  onSelect,
  emptyText,
}: {
  title: string;
  subtitle?: React.ReactNode;
  cards: Card[] | null;
  onSelect: (tbk: string, filename: string, path?: string) => void;
  emptyText?: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      {subtitle && (
        <div className="text-xs text-zinc-500 mb-2">{subtitle}</div>
      )}
      {cards === null ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="text-sm text-zinc-500 italic">
          {emptyText ?? "No notebooks."}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((c) => (
            <li key={c.path ?? c.filename}>
              <button
                onClick={() => onSelect(c.content, c.filename, c.path)}
                className="w-full text-left rounded border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-600 p-3 transition bg-white dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-sm">{c.title}</h4>
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
    </section>
  );
}
