import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Notebook } from "../types";

type Props = {
  notebook: Notebook | null;
  currentStep: number;
  onStepSelect: (step: number) => void;
};

// Map a cell-relative step index back to a global step index
function globalStepIndex(nb: Notebook, cellIndex: number, stepInCell: number): number {
  let offset = 0;
  for (let i = 0; i < cellIndex; i++) offset += nb.cells[i].steps.length;
  return offset + stepInCell;
}

export default function ConceptReadView({
  notebook,
  currentStep,
  onStepSelect,
}: Props) {
  if (!notebook) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        No notebook loaded. Use <kbd>Open</kbd> or <kbd>Generate</kbd> in the header.
      </div>
    );
  }

  return (
    <article className="px-6 py-4 max-w-none prose prose-sm dark:prose-invert prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
      <header className="not-prose mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <h1 className="text-xl font-semibold">{notebook.metadata.title}</h1>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
          {notebook.metadata.subject && (
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">
              {notebook.metadata.subject}
            </span>
          )}
          {notebook.metadata.author && <span>by {notebook.metadata.author}</span>}
        </div>
      </header>

      {notebook.cells.map((cell, ci) => (
        <section key={ci} className="mb-6">
          {cell.kind === "quiz" ? (
            <div className="not-prose rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
                Quiz
              </div>
              {cell.question && (
                <div className="text-sm text-amber-900 dark:text-amber-100">
                  {cell.question}
                </div>
              )}
              {cell.rubric && (
                <details className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                  <summary className="cursor-pointer">Show expected answer</summary>
                  <div className="mt-1">{cell.rubric}</div>
                </details>
              )}
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cell.prose}
            </ReactMarkdown>
          )}

          {cell.steps.length > 0 && (
            <div className="not-prose mt-3">
              <div className="text-xs font-medium text-zinc-500 mb-1">
                Steps ({cell.steps.length})
              </div>
              <ol className="space-y-1">
                {cell.steps.map((step, si) => {
                  const global = globalStepIndex(notebook, ci, si);
                  const active = global === currentStep;
                  return (
                    <li key={si}>
                      <button
                        onClick={() => onStepSelect(global)}
                        className={
                          "group w-full text-left text-sm rounded px-2 py-1 border transition " +
                          (active
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-700 text-blue-900 dark:text-blue-100"
                            : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300")
                        }
                      >
                        <span
                          className={
                            "inline-block w-6 mr-2 text-xs tabular-nums " +
                            (active ? "text-blue-600" : "text-zinc-400")
                          }
                        >
                          {global + 1}.
                        </span>
                        {step.narration || (
                          <span className="italic text-zinc-400">(no narration)</span>
                        )}
                        {step.codeLines && (
                          <span
                            className={
                              "ml-2 rounded px-1 text-[10px] font-mono " +
                              (active
                                ? "bg-blue-200 dark:bg-blue-800"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500")
                            }
                          >
                            L{step.codeLines[0]}
                            {step.codeLines[0] !== step.codeLines[1]
                              ? `–${step.codeLines[1]}`
                              : ""}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>
      ))}
    </article>
  );
}
