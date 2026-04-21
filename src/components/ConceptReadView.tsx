import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type {
  Notebook,
  QuizItem,
  QuizItemMcq,
  QuizItemNumeric,
  QuizItemShort,
  QuizItemTrueFalse,
} from "../types";
import type { TestProgress } from "../lib/progress";
import { findAnswer, upsertAnswer } from "../lib/progress";
import { gradeAnswer, type Grade } from "../lib/grade";

type Props = {
  notebook: Notebook | null;
  currentStep: number;
  onStepSelect: (step: number) => void;
  /** When true, quiz cells render as student-answerable test questions. */
  testMode?: boolean;
  progress?: TestProgress;
  /** Called with the updated progress after a save or grade. */
  onProgressChange?: (next: TestProgress) => void;
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
  testMode,
  progress,
  onProgressChange,
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
            testMode ? (
              cell.quizItems && cell.quizItems.length > 0 ? (
                <div className="space-y-3">
                  {cell.quizItems.map((item, ii) => (
                    <QuizItemView
                      key={ii}
                      cellIndex={ci}
                      itemIndex={ii}
                      item={item}
                      progress={progress}
                      onProgressChange={onProgressChange}
                    />
                  ))}
                </div>
              ) : (
                <QuizTestItem
                  cellIndex={ci}
                  question={cell.question ?? ""}
                  rubric={cell.rubric ?? ""}
                  progress={progress}
                  onProgressChange={onProgressChange}
                />
              )
            ) : (
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
            )
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
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

type QuizTestItemProps = {
  cellIndex: number;
  question: string;
  rubric: string;
  progress?: TestProgress;
  onProgressChange?: (next: TestProgress) => void;
};

function QuizTestItem({
  cellIndex,
  question,
  rubric,
  progress,
  onProgressChange,
}: QuizTestItemProps) {
  const saved = progress ? findAnswer(progress, cellIndex, 0) : undefined;
  const [answer, setAnswer] = useState<string>(saved?.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grade = saved?.grade;
  const canGrade = !!progress && !!onProgressChange && answer.trim().length > 0;

  async function onGrade() {
    if (!progress || !onProgressChange) return;
    setBusy(true);
    setError(null);
    // Persist the answer text first, so it survives a grading failure.
    const afterSave = upsertAnswer(progress, cellIndex, 0, { question, answer });
    onProgressChange(afterSave);
    try {
      const g = await gradeAnswer(question, rubric, answer);
      const now = new Date().toISOString();
      onProgressChange(
        upsertAnswer(afterSave, cellIndex, 0, { grade: g, gradedAt: now }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const borderClass = grade
    ? grade.correct
      ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950"
      : "border-rose-400 dark:border-rose-800 bg-rose-50 dark:bg-rose-950"
    : "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950";

  return (
    <div className={`not-prose rounded border p-3 ${borderClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
        Quiz — test mode
      </div>
      {question && (
        <div className="text-sm text-amber-900 dark:text-amber-100 mb-2">
          {question}
        </div>
      )}
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={busy}
        rows={3}
        placeholder="Type your answer…"
        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-sm font-sans"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onGrade}
          disabled={!canGrade || busy}
          className="rounded bg-blue-600 text-white px-2 py-1 text-xs hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "Grading…" : grade ? "Regrade" : "Grade my answer"}
        </button>
        {!progress && (
          <span className="text-xs text-amber-800 dark:text-amber-300">
            Start a progress file to grade (header → Progress → New).
          </span>
        )}
        {grade && (
          <span className="text-xs tabular-nums">
            <span
              className={
                grade.correct
                  ? "text-emerald-700 dark:text-emerald-300 font-semibold"
                  : "text-rose-700 dark:text-rose-300 font-semibold"
              }
            >
              {grade.score} / 10
            </span>
            <span className="ml-2 text-zinc-500">
              {grade.correct ? "✓ correct" : "needs work"}
            </span>
          </span>
        )}
      </div>
      {error && (
        <div className="mt-2 text-xs text-rose-700 dark:text-rose-300">
          Grading failed: {error}
        </div>
      )}
      {grade && (
        <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold">Feedback:</span> {grade.feedback}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 6 — structured quiz items (mcq / truefalse / numeric / short).
// Dispatcher + per-kind components with deterministic local grading for
// mcq/truefalse/numeric; short still round-trips through Claude.
// ---------------------------------------------------------------------------

type QuizItemViewProps = {
  cellIndex: number;
  itemIndex: number;
  item: QuizItem;
  progress?: TestProgress;
  onProgressChange?: (next: TestProgress) => void;
};

function QuizItemView(props: QuizItemViewProps) {
  switch (props.item.kind) {
    case "short":
      return <QuizShortItemView {...props} item={props.item} />;
    case "mcq":
      return <QuizMcqItemView {...props} item={props.item} />;
    case "truefalse":
      return <QuizTfItemView {...props} item={props.item} />;
    case "numeric":
      return <QuizNumericItemView {...props} item={props.item} />;
  }
}

function cardClass(grade: Grade | undefined): string {
  return grade
    ? grade.correct
      ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950"
      : "border-rose-400 dark:border-rose-800 bg-rose-50 dark:bg-rose-950"
    : "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950";
}

function kindBadge(kind: string): string {
  return kind.toUpperCase();
}

/** Shell: header (kind badge + question + grade chip) + children + feedback. */
function QuizShell({
  kind,
  question,
  grade,
  children,
}: {
  kind: string;
  question: string;
  grade?: Grade;
  children: React.ReactNode;
}) {
  return (
    <div className={`not-prose rounded border p-3 ${cardClass(grade)}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Quiz · {kindBadge(kind)}
        </span>
        {grade && (
          <span className="text-xs tabular-nums">
            <span
              className={
                grade.correct
                  ? "text-emerald-700 dark:text-emerald-300 font-semibold"
                  : "text-rose-700 dark:text-rose-300 font-semibold"
              }
            >
              {grade.score} / 10
            </span>
            <span className="ml-2 text-zinc-500">
              {grade.correct ? "✓ correct" : "needs work"}
            </span>
          </span>
        )}
      </div>
      <div className="text-sm text-amber-900 dark:text-amber-100 mb-2">
        {question}
      </div>
      {children}
      {grade && (
        <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold">Feedback:</span> {grade.feedback}
        </div>
      )}
    </div>
  );
}

function localGrade(
  item: QuizItemMcq | QuizItemTrueFalse | QuizItemNumeric,
  answer: string,
): Grade {
  if (item.kind === "mcq") {
    const idx = parseInt(answer, 10);
    const correct = idx === item.correctIndex;
    const expected = item.options[item.correctIndex] ?? "(unknown)";
    return {
      score: correct ? 10 : 0,
      correct,
      feedback: correct
        ? `Correct.${item.explanation ? " " + item.explanation : ""}`
        : `Incorrect. The correct answer is "${expected}".${item.explanation ? " " + item.explanation : ""}`,
    };
  }
  if (item.kind === "truefalse") {
    const ans = answer === "true";
    const correct = ans === item.correct;
    return {
      score: correct ? 10 : 0,
      correct,
      feedback: correct
        ? `Correct.${item.explanation ? " " + item.explanation : ""}`
        : `Incorrect. The correct answer is ${item.correct ? "true" : "false"}.${item.explanation ? " " + item.explanation : ""}`,
    };
  }
  // numeric
  const val = Number(answer);
  const tol = item.tolerance ?? 0;
  const ok = Number.isFinite(val) && Math.abs(val - item.value) <= tol;
  return {
    score: ok ? 10 : 0,
    correct: ok,
    feedback: ok
      ? `Correct.${item.explanation ? " " + item.explanation : ""}`
      : `Incorrect. Expected ${item.value}${tol > 0 ? ` ± ${tol}` : ""}.${item.explanation ? " " + item.explanation : ""}`,
  };
}

function QuizMcqItemView({
  cellIndex,
  itemIndex,
  item,
  progress,
  onProgressChange,
}: QuizItemViewProps & { item: QuizItemMcq }) {
  const saved = progress ? findAnswer(progress, cellIndex, itemIndex) : undefined;
  const [selected, setSelected] = useState<string>(saved?.answer ?? "");
  const grade = saved?.grade;
  function onSubmit() {
    if (!progress || !onProgressChange || selected === "") return;
    const afterSave = upsertAnswer(progress, cellIndex, itemIndex, {
      question: item.question,
      answer: selected,
    });
    const g = localGrade(item, selected);
    const now = new Date().toISOString();
    onProgressChange(
      upsertAnswer(afterSave, cellIndex, itemIndex, {
        grade: g,
        gradedAt: now,
      }),
    );
  }
  return (
    <QuizShell kind="mcq" question={item.question} grade={grade}>
      <div className="space-y-1">
        {item.options.map((opt, i) => (
          <label
            key={i}
            className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <input
              type="radio"
              name={`mcq-${cellIndex}-${itemIndex}`}
              value={String(i)}
              checked={selected === String(i)}
              onChange={(e) => setSelected(e.target.value)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
      <div className="mt-2">
        <button
          onClick={onSubmit}
          disabled={!progress || selected === ""}
          className="rounded bg-blue-600 text-white px-2 py-1 text-xs hover:bg-blue-700 disabled:opacity-40"
        >
          {grade ? "Re-check" : "Check my answer"}
        </button>
      </div>
    </QuizShell>
  );
}

function QuizTfItemView({
  cellIndex,
  itemIndex,
  item,
  progress,
  onProgressChange,
}: QuizItemViewProps & { item: QuizItemTrueFalse }) {
  const saved = progress ? findAnswer(progress, cellIndex, itemIndex) : undefined;
  const [selected, setSelected] = useState<string>(saved?.answer ?? "");
  const grade = saved?.grade;
  function submit(val: "true" | "false") {
    setSelected(val);
    if (!progress || !onProgressChange) return;
    const afterSave = upsertAnswer(progress, cellIndex, itemIndex, {
      question: item.question,
      answer: val,
    });
    const g = localGrade(item, val);
    const now = new Date().toISOString();
    onProgressChange(
      upsertAnswer(afterSave, cellIndex, itemIndex, {
        grade: g,
        gradedAt: now,
      }),
    );
  }
  return (
    <QuizShell kind="true/false" question={item.question} grade={grade}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => submit("true")}
          className={
            "rounded px-3 py-1 text-sm border " +
            (selected === "true"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700")
          }
        >
          True
        </button>
        <button
          onClick={() => submit("false")}
          className={
            "rounded px-3 py-1 text-sm border " +
            (selected === "false"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700")
          }
        >
          False
        </button>
      </div>
    </QuizShell>
  );
}

function QuizNumericItemView({
  cellIndex,
  itemIndex,
  item,
  progress,
  onProgressChange,
}: QuizItemViewProps & { item: QuizItemNumeric }) {
  const saved = progress ? findAnswer(progress, cellIndex, itemIndex) : undefined;
  const [input, setInput] = useState<string>(saved?.answer ?? "");
  const grade = saved?.grade;
  function onSubmit() {
    if (!progress || !onProgressChange || input.trim() === "") return;
    const afterSave = upsertAnswer(progress, cellIndex, itemIndex, {
      question: item.question,
      answer: input.trim(),
    });
    const g = localGrade(item, input.trim());
    const now = new Date().toISOString();
    onProgressChange(
      upsertAnswer(afterSave, cellIndex, itemIndex, {
        grade: g,
        gradedAt: now,
      }),
    );
  }
  return (
    <QuizShell kind="numeric" question={item.question} grade={grade}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder={item.tolerance ? `(±${item.tolerance})` : ""}
          className="w-40 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm font-mono tabular-nums"
        />
        <button
          onClick={onSubmit}
          disabled={!progress || input.trim() === ""}
          className="rounded bg-blue-600 text-white px-2 py-1 text-xs hover:bg-blue-700 disabled:opacity-40"
        >
          {grade ? "Re-check" : "Check"}
        </button>
      </div>
    </QuizShell>
  );
}

function QuizShortItemView({
  cellIndex,
  itemIndex,
  item,
  progress,
  onProgressChange,
}: QuizItemViewProps & { item: QuizItemShort }) {
  const saved = progress ? findAnswer(progress, cellIndex, itemIndex) : undefined;
  const [answer, setAnswer] = useState<string>(saved?.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grade = saved?.grade;
  const canGrade =
    !!progress && !!onProgressChange && answer.trim().length > 0;

  async function onGrade() {
    if (!progress || !onProgressChange) return;
    setBusy(true);
    setError(null);
    const afterSave = upsertAnswer(progress, cellIndex, itemIndex, {
      question: item.question,
      answer,
    });
    onProgressChange(afterSave);
    try {
      const g = await gradeAnswer(item.question, item.rubric, answer);
      const now = new Date().toISOString();
      onProgressChange(
        upsertAnswer(afterSave, cellIndex, itemIndex, {
          grade: g,
          gradedAt: now,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuizShell kind="short" question={item.question} grade={grade}>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={busy}
        rows={3}
        placeholder="Type your answer…"
        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-sm font-sans"
      />
      <div className="mt-2">
        <button
          onClick={onGrade}
          disabled={!canGrade || busy}
          className="rounded bg-blue-600 text-white px-2 py-1 text-xs hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "Grading…" : grade ? "Regrade" : "Grade my answer"}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs text-rose-700 dark:text-rose-300">
          Grading failed: {error}
        </div>
      )}
    </QuizShell>
  );
}
