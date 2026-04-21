import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TestProgress, QuizAnswer } from "../lib/progress";
import { useEscape } from "../lib/useEscape";

type LocalSubmission = {
  id: string;
  path: string;
  received_at: string;
  notebook_id?: string | null;
  notebook_title?: string | null;
  student?: string | null;
  student_id?: string | null;
  started_at?: string | null;
  submitted_at?: string | null;
  correct: number;
  attempted: number;
};

type PublishedQuiz = {
  id: string;
  title: string;
  subject: string;
  tags: string[];
};

type PushRecord = {
  id: string;
  notebook_id: string;
  notebook_title: string;
  message?: string | null;
  pushed_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function TeacherDashboard({ open, onClose }: Props) {
  useEscape(open, onClose);
  const [rows, setRows] = useState<LocalSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TestProgress | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Filters
  const [studentFilter, setStudentFilter] = useState<string>("");
  const [testFilter, setTestFilter] = useState<string | null>(null);

  // Publish panel state
  const [publishedQuizzes, setPublishedQuizzes] = useState<PublishedQuiz[]>([]);
  const [pushTarget, setPushTarget] = useState<string>("");
  const [pushMessage, setPushMessage] = useState<string>("");
  const [pushes, setPushes] = useState<PushRecord[]>([]);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFlash, setPushFlash] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const refreshPublishPanel = useCallback(async () => {
    try {
      const [quizzes, existing] = await Promise.all([
        invoke<PublishedQuiz[]>("list_local_published"),
        invoke<PushRecord[]>("list_local_pushes"),
      ]);
      setPublishedQuizzes(quizzes);
      setPushes(existing);
      if (!pushTarget && quizzes.length > 0) {
        setPushTarget(quizzes[0].id);
      }
    } catch (e) {
      setPushFlash({ kind: "err", text: String(e) });
    }
  }, [pushTarget]);

  const onPush = useCallback(async () => {
    if (!pushTarget) return;
    setPushBusy(true);
    setPushFlash(null);
    try {
      const record = await invoke<PushRecord>("push_quiz", {
        notebookId: pushTarget,
        message: pushMessage.trim() || null,
      });
      setPushes((prev) => [record, ...prev]);
      setPushFlash({
        kind: "ok",
        text: `Pushed "${record.notebook_title}" to connected students.`,
      });
      setPushMessage("");
    } catch (e) {
      setPushFlash({ kind: "err", text: String(e) });
    } finally {
      setPushBusy(false);
    }
  }, [pushTarget, pushMessage]);

  const onDeletePush = useCallback(async (id: string) => {
    try {
      await invoke("delete_local_push", { id });
      setPushes((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setPushFlash({ kind: "err", text: String(e) });
    }
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await invoke<LocalSubmission[]>("list_local_submissions");
      setRows(r);
    } catch (e) {
      setError(String(e));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setDetail(null);
    refresh();
    refreshPublishPanel();
  }, [open, refresh, refreshPublishPanel]);

  // Auto-refresh every 3s while the dashboard is open. Cheap: we're only
  // enumerating a directory on the local disk.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailError(null);
    invoke<string>("read_local_submission", { id: selectedId })
      .then((raw) => {
        try {
          setDetail(JSON.parse(raw) as TestProgress);
        } catch (e) {
          setDetailError(`Invalid JSON: ${String(e)}`);
        }
      })
      .catch((e) => setDetailError(String(e)));
  }, [selectedId]);

  const testIds = useMemo<string[]>(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => {
      if (r.notebook_id) set.add(r.notebook_id);
    });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo<LocalSubmission[]>(() => {
    if (!rows) return [];
    const q = studentFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (testFilter && r.notebook_id !== testFilter) return false;
      if (!q) return true;
      return (
        (r.student ?? "").toLowerCase().includes(q) ||
        (r.student_id ?? "").toLowerCase().includes(q) ||
        (r.notebook_title ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [rows, studentFilter, testFilter]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-[1000px] max-w-full h-[85vh] rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold">Teacher dashboard</h2>
            <p className="text-xs text-zinc-500">
              Submissions received at <code className="font-mono">~/Teachbook/submissions/</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs"
            >
              ↻ Refresh
            </button>
            <button
              onClick={onClose}
              className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
            >
              Close
            </button>
          </div>
        </header>

        {/* Publish panel — push a locked notebook to connected students. */}
        <details className="border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-blue-50/40 dark:bg-blue-950/20">
          <summary className="cursor-pointer px-4 py-2 text-xs font-semibold flex items-center gap-2">
            <span className="text-blue-700 dark:text-blue-300">
              📣 Push to students
            </span>
            <span className="text-zinc-500 font-normal">
              ({publishedQuizzes.length} published ·{" "}
              {pushes.length} previous push{pushes.length === 1 ? "" : "es"})
            </span>
            {pushFlash && (
              <span
                className={
                  "ml-auto text-[11px] tabular-nums font-normal " +
                  (pushFlash.kind === "ok"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-rose-700 dark:text-rose-300")
                }
              >
                {pushFlash.kind === "ok" ? "✓" : "✗"} {pushFlash.text}
              </span>
            )}
          </summary>
          <div className="px-4 pb-3 space-y-2 text-xs">
            {publishedQuizzes.length === 0 ? (
              <div className="text-zinc-500 italic">
                No locked notebooks in your library. Add{" "}
                <code className="font-mono">locked: true</code> to a notebook&apos;s
                frontmatter and save it to{" "}
                <code className="font-mono">~/Teachbook/notebooks/</code>.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <select
                    value={pushTarget}
                    onChange={(e) => setPushTarget(e.target.value)}
                    className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                  >
                    {publishedQuizzes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title} — {q.id}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Optional message (e.g. 'Due 5 min.')"
                    value={pushMessage}
                    onChange={(e) => setPushMessage(e.target.value)}
                    className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={onPush}
                    disabled={pushBusy || !pushTarget}
                    className="rounded bg-blue-600 text-white px-3 py-1 text-xs hover:bg-blue-700 disabled:opacity-40"
                  >
                    {pushBusy ? "Pushing…" : "→ Push"}
                  </button>
                </div>
                {pushes.length > 0 && (
                  <div className="max-h-32 overflow-auto rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                    <table className="w-full">
                      <tbody>
                        {pushes.map((p) => (
                          <tr
                            key={p.id}
                            className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                          >
                            <td className="px-2 py-1 font-mono text-[10px] text-zinc-500 whitespace-nowrap">
                              {fmtDate(p.pushed_at)}
                            </td>
                            <td className="px-2 py-1">{p.notebook_title}</td>
                            <td className="px-2 py-1 text-zinc-500 italic">
                              {p.message ?? ""}
                            </td>
                            <td className="px-2 py-1 w-8">
                              <button
                                onClick={() => onDeletePush(p.id)}
                                className="text-zinc-400 hover:text-rose-600"
                                title="Withdraw this push — existing clients keep what they already downloaded"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="text-[10px] text-zinc-500">
                  Students poll <code className="font-mono">/api/pushes</code>{" "}
                  every 15 s when their teacher URL is set. They see a banner
                  with Load / Dismiss buttons.
                </div>
              </>
            )}
          </div>
        </details>

        <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 shrink-0 flex items-center gap-2 text-xs">
          <input
            type="search"
            placeholder="Search student name, ID, test title…"
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
          />
          <select
            value={testFilter ?? ""}
            onChange={(e) => setTestFilter(e.target.value || null)}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
          >
            <option value="">All tests</option>
            {testIds.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {rows && (
            <span className="text-zinc-500 tabular-nums">
              {filtered.length} / {rows.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-[1fr_1.1fr]">
          {/* List */}
          <div className="overflow-auto border-r border-zinc-200 dark:border-zinc-800">
            {error && (
              <div className="m-3 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-3 py-2 text-xs font-mono">
                {error}
              </div>
            )}
            {rows === null ? (
              <div className="p-4 text-sm text-zinc-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-zinc-500 italic">
                {rows.length === 0
                  ? "No submissions yet. When students click → Submit, they'll appear here."
                  : "No submissions match the current filter."}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <Th>Student</Th>
                    <Th>Test</Th>
                    <Th>Score</Th>
                    <Th>Submitted</Th>
                    <Th>Received</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const active = r.id === selectedId;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={
                          "border-b border-zinc-100 dark:border-zinc-800 cursor-pointer " +
                          (active
                            ? "bg-blue-50 dark:bg-blue-950"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50")
                        }
                      >
                        <Td>
                          <div className="font-medium">
                            {r.student ?? (
                              <span className="italic text-zinc-400">anon</span>
                            )}
                          </div>
                          {r.student_id && (
                            <div className="font-mono text-[10px] text-zinc-500">
                              {r.student_id}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <div>{r.notebook_title ?? "—"}</div>
                          {r.notebook_id && (
                            <div className="font-mono text-[10px] text-zinc-500">
                              {r.notebook_id}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <span className="tabular-nums">
                            <span
                              className={
                                r.attempted > 0 && r.correct === r.attempted
                                  ? "text-emerald-700 dark:text-emerald-300 font-semibold"
                                  : "text-zinc-700 dark:text-zinc-300"
                              }
                            >
                              {r.correct}
                            </span>
                            <span className="text-zinc-500"> / {r.attempted}</span>
                          </span>
                        </Td>
                        <Td>
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {r.submitted_at ? fmtDate(r.submitted_at) : "—"}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {fmtDate(r.received_at)}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail */}
          <div className="overflow-auto">
            {selectedId === null ? (
              <div className="p-6 text-sm text-zinc-500 italic text-center">
                Select a submission to see the student&apos;s answers.
              </div>
            ) : detailError ? (
              <div className="m-3 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-3 py-2 text-xs font-mono">
                {detailError}
              </div>
            ) : detail === null ? (
              <div className="p-4 text-sm text-zinc-500">Loading…</div>
            ) : (
              <SubmissionDetail id={selectedId} p={detail} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-2">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function SubmissionDetail({ id, p }: { id: string; p: TestProgress }) {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{p.notebookTitle}</h3>
        <div className="text-xs text-zinc-500 font-mono">{id}</div>
      </div>

      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-zinc-500">Student</dt>
        <dd>{p.student ?? <span className="italic text-zinc-400">(none)</span>}</dd>
        <dt className="text-zinc-500">Student ID</dt>
        <dd className="font-mono">
          {p.studentId ?? <span className="italic text-zinc-400">(none)</span>}
        </dd>
        <dt className="text-zinc-500">Test ID</dt>
        <dd className="font-mono">
          {p.notebookId ?? <span className="italic text-zinc-400">(none)</span>}
        </dd>
        <dt className="text-zinc-500">Started</dt>
        <dd>{fmtDate(p.startedAt)}</dd>
        <dt className="text-zinc-500">Submitted</dt>
        <dd>{fmtDate(p.submittedAt)}</dd>
      </dl>

      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-2">
        {p.answers.length === 0 ? (
          <div className="text-xs text-zinc-500 italic">
            No answers in this submission.
          </div>
        ) : (
          p.answers.map((a, i) => <AnswerRow key={i} a={a} />)
        )}
      </div>
    </div>
  );
}

function AnswerRow({ a }: { a: QuizAnswer }) {
  const correct = a.grade?.correct;
  const border = correct
    ? "border-emerald-300 dark:border-emerald-800"
    : a.grade
      ? "border-rose-300 dark:border-rose-800"
      : "border-zinc-200 dark:border-zinc-800";
  return (
    <div className={`rounded border ${border} p-2 text-xs`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold">
          Q{(a.cellIndex ?? 0) + 1}
          {a.itemIndex != null && `.${a.itemIndex + 1}`}
        </span>
        {a.grade && (
          <span
            className={
              "tabular-nums font-semibold " +
              (correct
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-700 dark:text-rose-300")
            }
          >
            {a.grade.score}/10 · {correct ? "✓" : "✗"}
          </span>
        )}
      </div>
      {a.question && (
        <div className="text-zinc-600 dark:text-zinc-400 mb-1">{a.question}</div>
      )}
      <div className="rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1.5 font-mono text-[11px] whitespace-pre-wrap break-words">
        {a.answer || (
          <span className="italic text-zinc-400 font-sans">(empty)</span>
        )}
      </div>
      {a.grade?.feedback && (
        <div className="mt-1 text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold">Feedback:</span> {a.grade.feedback}
        </div>
      )}
    </div>
  );
}
