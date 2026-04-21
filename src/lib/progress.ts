import type { Grade } from "./grade";
import type { Notebook } from "../types";

export type QuizAnswer = {
  cellIndex: number; // the quiz cell's index in notebook.cells
  question: string; // snapshot of the question (for rendering when the teacher reads back progress against a different notebook revision)
  answer: string;
  grade?: Grade;
  gradedAt?: string; // ISO timestamp
};

export type TestProgress = {
  version: 1;
  notebookTitle: string;
  notebookSubject: string;
  student?: string; // optional free-form identifier (filled by the student before saving)
  startedAt: string; // ISO
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
): QuizAnswer | undefined {
  return p.answers.find((a) => a.cellIndex === cellIndex);
}

export function upsertAnswer(
  p: TestProgress,
  cellIndex: number,
  update: Partial<Omit<QuizAnswer, "cellIndex">>,
): TestProgress {
  const existing = findAnswer(p, cellIndex);
  const merged: QuizAnswer = {
    cellIndex,
    question: update.question ?? existing?.question ?? "",
    answer: update.answer ?? existing?.answer ?? "",
    grade: update.grade ?? existing?.grade,
    gradedAt: update.gradedAt ?? existing?.gradedAt,
  };
  const answers = existing
    ? p.answers.map((a) => (a.cellIndex === cellIndex ? merged : a))
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
