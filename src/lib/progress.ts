import type { Grade } from "./grade";
import type { Notebook } from "../types";

export type QuizAnswer = {
  cellIndex: number; // the quiz cell's index in notebook.cells
  /** 0-based index of the quiz item within the cell. Legacy answers
   *  (written before Phase 6) may omit this — treat as 0. */
  itemIndex?: number;
  question: string; // snapshot of the question (for rendering when the teacher reads back progress against a different notebook revision)
  /** Free-form student response. For mcq: string index. For truefalse:
   *  "true" | "false". For numeric: the typed number. For short: prose. */
  answer: string;
  grade?: Grade;
  gradedAt?: string; // ISO timestamp
};

export type TestProgress = {
  version: 1;
  /** Stable identifier of the test/notebook — for teacher tracking when
   *  students have multiple attempts of the same assignment. Filled at
   *  load time from the notebook's filename (sans `.tbk`). */
  notebookId?: string;
  notebookTitle: string;
  notebookSubject: string;
  /** Free-form student name from settings (copied in at submit time). */
  student?: string;
  /** Optional student ID from settings. */
  studentId?: string;
  /** ISO. Set when the student starts answering. */
  startedAt: string;
  /** ISO. Set at submit time — when the student POSTed to the teacher. */
  submittedAt?: string;
  answers: QuizAnswer[];
};

export function emptyProgress(notebook: Notebook): TestProgress {
  return {
    version: 1,
    notebookTitle: notebook.metadata.title,
    notebookSubject: notebook.metadata.subject,
    startedAt: new Date().toISOString(),
    answers: [],
  };
}

export function findAnswer(
  p: TestProgress,
  cellIndex: number,
  itemIndex = 0,
): QuizAnswer | undefined {
  return p.answers.find(
    (a) => a.cellIndex === cellIndex && (a.itemIndex ?? 0) === itemIndex,
  );
}

export function upsertAnswer(
  p: TestProgress,
  cellIndex: number,
  itemIndex: number,
  update: Partial<Omit<QuizAnswer, "cellIndex" | "itemIndex">>,
): TestProgress {
  const existing = findAnswer(p, cellIndex, itemIndex);
  const merged: QuizAnswer = {
    cellIndex,
    itemIndex,
    question: update.question ?? existing?.question ?? "",
    answer: update.answer ?? existing?.answer ?? "",
    grade: update.grade ?? existing?.grade,
    gradedAt: update.gradedAt ?? existing?.gradedAt,
  };
  const answers = existing
    ? p.answers.map((a) =>
        a.cellIndex === cellIndex && (a.itemIndex ?? 0) === itemIndex
          ? merged
          : a,
      )
    : [...p.answers, merged];
  return { ...p, answers };
}

export function parseProgress(raw: string): TestProgress {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("progress file is not a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error(`unsupported progress version: ${String(o.version)}`);
  }
  if (!Array.isArray(o.answers)) {
    throw new Error("progress file missing answers array");
  }
  return parsed as TestProgress;
}

export function serializeProgress(p: TestProgress): string {
  return JSON.stringify(p, null, 2);
}

export function summary(p: TestProgress): {
  attempted: number;
  correct: number;
  total?: number;
} {
  const graded = p.answers.filter((a) => a.grade);
  return {
    attempted: p.answers.filter((a) => a.answer.trim()).length,
    correct: graded.filter((a) => a.grade?.correct).length,
  };
}
