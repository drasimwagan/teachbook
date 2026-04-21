import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import ConceptPane from "./components/ConceptPane";
import VisualizationPane from "./components/VisualizationPane";
import ChatPane from "./components/ChatPane";
import StepControls from "./components/StepControls";
import GenerateDialog from "./components/GenerateDialog";
import ExamplesDialog from "./components/ExamplesDialog";
import InsertStepDialog from "./components/InsertStepDialog";
import RunPane from "./components/RunPane";
// SettingsDialog + TeacherDashboard + UserGuideDialog are lazy-loaded so
// react-markdown and the 30KB user guide stay out of the main bundle.
const SettingsDialog = lazy(() => import("./components/SettingsDialog"));
const TeacherDashboard = lazy(() => import("./components/TeacherDashboard"));
const UserGuideDialog = lazy(() => import("./components/UserGuideDialog"));
import { getSettings, teachingServerStatus, type Settings } from "./lib/settings";
import {
  fetchTeacherQuiz,
  listPushesFromTeacher,
  submitToTeacher,
  type QuizPush,
} from "./lib/teaching-api";
import { parseTbk, type ParseDiagnostic } from "./lib/tbk-parser";
import { updatePrimitiveInSource, type PrimitivePatch } from "./lib/scene-edit";
import {
  emptyProgress,
  parseProgress,
  serializeProgress,
  summary,
  type TestProgress,
} from "./lib/progress";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
import { useHistory } from "./lib/useHistory";
import type { Notebook } from "./types";
import "./App.css";

const WELCOME = `---
title: Welcome to Teachbook
subject: intro
version: 0.1
---

# Welcome to Teachbook

Step through concepts like a debugger — the same engine teaches algorithms,
physics, chemistry, and more. To get started:

- **Examples** — browse a few built-in notebooks to see the idea
- **Open** — load a \`.tbk\` file from disk
- **Generate** — describe what you want to teach and let Claude write it

Once a notebook is loaded, use **Next / Prev** (top right) to step through.
Switch the Concept pane to **Edit** to tweak the source.
`;

function App() {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [source, setSource] = useState<string>(WELCOME);
  const [currentNotebookId, setCurrentNotebookId] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<ParseDiagnostic[]>([]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [submitFlash, setSubmitFlash] = useState<
    | { kind: "ok"; text: string }
    | { kind: "err"; text: string }
    | null
  >(null);
  const submitFlashTimer = useRef<number | null>(null);
  const [teacherPushes, setTeacherPushes] = useState<QuizPush[]>([]);
  const [dismissedPushIds, setDismissedPushIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("teachbook.dismissedPushes");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      // ignore malformed localStorage
    }
    return new Set();
  });
  const persistDismissed = useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem(
        "teachbook.dismissedPushes",
        JSON.stringify([...ids]),
      );
    } catch {
      // localStorage quota — not fatal, the banner just won't remember.
    }
  }, []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [serverRunning, setServerRunning] = useState<boolean>(false);
  const [testMode, setTestMode] = useState(false);
  const [progress, setProgress] = useState<TestProgress | null>(null);
  const [progressPath, setProgressPath] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const autosaveTimer = useRef<number | null>(null);

  const history = useHistory();

  const snapshotAnd = useCallback(
    (label: string, apply: () => void) => {
      history.snapshot({ source, currentStep, currentPath, label });
      apply();
    },
    [history, source, currentStep, currentPath],
  );

  const handleUndo = useCallback(() => {
    const prev = history.undo({
      source,
      currentStep,
      currentPath,
      label: "current state",
    });
    if (!prev) return;
    setSource(prev.source);
    setCurrentStep(prev.currentStep);
    setCurrentPath(prev.currentPath);
  }, [history, source, currentStep, currentPath]);

  const handleRedo = useCallback(() => {
    const next = history.redo({
      source,
      currentStep,
      currentPath,
      label: "current state",
    });
    if (!next) return;
    setSource(next.source);
    setCurrentStep(next.currentStep);
    setCurrentPath(next.currentPath);
  }, [history, source, currentStep, currentPath]);

  // Global shortcuts. ⌘⇧Z = undo (avoids CodeMirror's ⌘Z); ⌘Y = redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        handleUndo();
      } else if (!e.shiftKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  // Initial parse of welcome text
  useEffect(() => {
    const { notebook: nb, errors } = parseTbk(WELCOME);
    setNotebook(nb);
    setParseErrors(errors);
  }, []);

  // Load persisted settings on boot + poll server status while the dialog
  // isn't open (so the header pill stays accurate).
  useEffect(() => {
    getSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const s = await teachingServerStatus();
        if (!cancelled) setServerRunning(s.running);
      } catch {
        if (!cancelled) setServerRunning(false);
      }
    }
    poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [settingsOpen]);

  // Student-side: poll the teacher's /api/pushes every 15s when a teacher
  // URL is configured. New (not-yet-dismissed) pushes surface as a banner.
  useEffect(() => {
    const url = settings?.teacher_url;
    if (!url) {
      setTeacherPushes([]);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const list = await listPushesFromTeacher(url!);
        if (!cancelled) setTeacherPushes(list);
      } catch {
        // Teacher may be offline; silent — banner just stays empty.
      }
    }
    poll();
    const id = window.setInterval(poll, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [settings?.teacher_url]);

  const visiblePush: QuizPush | null = useMemo(() => {
    return teacherPushes.find((p) => !dismissedPushIds.has(p.id)) ?? null;
  }, [teacherPushes, dismissedPushIds]);

  const onLoadPush = useCallback(
    async (push: QuizPush) => {
      const url = settings?.teacher_url;
      if (!url) return;
      try {
        const tbk = await fetchTeacherQuiz(url, push.notebook_id);
        snapshotAnd(`load push ${push.notebook_id}`, () => {
          setSource(tbk);
          setCurrentPath(null);
          setCurrentNotebookId(push.notebook_id);
          setCurrentStep(0);
        });
        // Auto-dismiss once loaded so the banner disappears.
        const next = new Set(dismissedPushIds);
        next.add(push.id);
        setDismissedPushIds(next);
        persistDismissed(next);
      } catch (e) {
        setParseErrors([
          { message: `Load push failed: ${String(e)}` },
        ]);
      }
    },
    [settings?.teacher_url, snapshotAnd, dismissedPushIds, persistDismissed],
  );

  const onDismissPush = useCallback(
    (push: QuizPush) => {
      const next = new Set(dismissedPushIds);
      next.add(push.id);
      setDismissedPushIds(next);
      persistDismissed(next);
    },
    [dismissedPushIds, persistDismissed],
  );

  // Debounced re-parse when source changes
  const parseTimer = useRef<number | null>(null);
  useEffect(() => {
    if (parseTimer.current) window.clearTimeout(parseTimer.current);
    parseTimer.current = window.setTimeout(() => {
      const { notebook: nb, errors } = parseTbk(source);
      setNotebook(nb);
      setParseErrors(errors);
      if (currentStep >= nb.totalSteps) {
        setCurrentStep(Math.max(0, nb.totalSteps - 1));
      }
    }, 250);
    return () => {
      if (parseTimer.current) window.clearTimeout(parseTimer.current);
    };
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNotebook = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Teachbook", extensions: ["tbk", "md"] }],
    });
    if (!selected || typeof selected !== "string") return;
    try {
      const contents = await invoke<string>("load_notebook", { path: selected });
      const name = selected.split("/").pop() ?? selected;
      snapshotAnd(`open ${name}`, () => {
        setSource(contents);
        setCurrentPath(selected);
        setCurrentNotebookId(name.replace(/\.tbk$/i, ""));
        setCurrentStep(0);
      });
    } catch (e) {
      setParseErrors([{ message: `Failed to open: ${String(e)}` }]);
    }
  }, [snapshotAnd]);

  const saveNotebook = useCallback(async () => {
    let path = currentPath;
    if (!path) {
      let defaultPath: string | undefined;
      try {
        const libDir = await invoke<string>("user_notebooks_path");
        const title = notebook?.metadata.title ?? "notebook";
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40);
        defaultPath = `${libDir}/${slug || "notebook"}.tbk`;
      } catch {
        // fall through — no default
      }
      const chosen = await save({
        filters: [{ name: "Teachbook", extensions: ["tbk"] }],
        defaultPath,
      });
      if (!chosen) return;
      path = chosen;
    }
    try {
      await invoke("save_notebook", { path, contents: source });
      setCurrentPath(path);
    } catch (e) {
      setParseErrors([{ message: `Failed to save: ${String(e)}` }]);
    }
  }, [currentPath, source, notebook]);

  const totalSteps = notebook?.totalSteps ?? 0;
  const isLocked = notebook?.metadata.locked === true;

  const startNewProgress = useCallback(async () => {
    if (!notebook) return;
    const next = emptyProgress(notebook);
    // Auto-assign a stable filename so auto-save has somewhere to land
    // without prompting. Pattern: <slug>-<student>-<YYYY-MM-DD>.json.
    // Same student doing multiple attempts on the same day shares the file
    // (latest state wins) — intentional, matches "the current attempt".
    try {
      const dir = await invoke<string>("user_progress_path");
      const titleSlug = slugify(notebook.metadata.title) || "progress";
      const who = slugify(settings?.student_name ?? "anon") || "anon";
      const date = new Date().toISOString().slice(0, 10);
      setProgressPath(`${dir}/${titleSlug}-${who}-${date}.json`);
    } catch {
      setProgressPath(null);
    }
    setProgress(next);
    setSaveState("idle");
  }, [notebook, settings?.student_name]);

  const saveProgress = useCallback(async () => {
    if (!progress) return;
    let path = progressPath;
    if (!path) {
      let defaultPath: string | undefined;
      try {
        const dir = await invoke<string>("user_progress_path");
        const slug = progress.notebookTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40);
        defaultPath = `${dir}/${slug || "progress"}.json`;
      } catch {
        // fall through
      }
      const chosen = await save({
        filters: [{ name: "Progress JSON", extensions: ["json"] }],
        defaultPath,
      });
      if (!chosen) return;
      path = chosen;
    }
    try {
      await invoke("save_notebook", { path, contents: serializeProgress(progress) });
      setProgressPath(path);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setParseErrors([{ message: `Save progress failed: ${String(e)}` }]);
    }
  }, [progress, progressPath]);

  const loadProgress = useCallback(async () => {
    let defaultDir: string | undefined;
    try {
      defaultDir = await invoke<string>("user_progress_path");
    } catch {
      // fall through
    }
    const selected = await open({
      multiple: false,
      defaultPath: defaultDir,
      filters: [{ name: "Progress JSON", extensions: ["json"] }],
    });
    if (!selected || typeof selected !== "string") return;
    try {
      const contents = await invoke<string>("load_notebook", { path: selected });
      setProgress(parseProgress(contents));
      setProgressPath(selected);
      setSaveState("saved");
    } catch (e) {
      setParseErrors([{ message: `Load progress failed: ${String(e)}` }]);
    }
  }, []);

  // Auto-save: any change to progress triggers a debounced write back to
  // the current path. Runs even when the app is hidden; cheap (small JSON).
  // If there's no path yet (progress loaded without one via startNewProgress
  // failure path), we skip — user hits manual Save to pick a location.
  useEffect(() => {
    if (!progress || !progressPath) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    setSaveState((prev) => (prev === "idle" || prev === "saved" ? "saving" : prev));
    autosaveTimer.current = window.setTimeout(async () => {
      try {
        await invoke("save_notebook", {
          path: progressPath,
          contents: serializeProgress(progress),
        });
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        console.warn("autosave failed:", e);
      }
    }, 1500);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [progress, progressPath]);

  const handlePrimitivePatch = useCallback(
    (
      sourceLine: number,
      sourceEndLine: number,
      primitiveIndex: number,
      patch: PrimitivePatch,
    ) => {
      const res = updatePrimitiveInSource(
        source,
        sourceLine,
        sourceEndLine,
        primitiveIndex,
        patch,
      );
      if (!res.ok) {
        setParseErrors([{ message: `drag: ${res.error}` }]);
        return;
      }
      snapshotAnd("drag primitive", () => setSource(res.source));
    },
    [source, snapshotAnd],
  );

  const activeSceneRange = useMemo<[number, number] | undefined>(() => {
    if (!notebook) return undefined;
    let remaining = currentStep;
    for (const cell of notebook.cells) {
      if (remaining < cell.steps.length) {
        const step = cell.steps[remaining];
        if (step?.sourceLine && step.sourceEndLine) {
          return [step.sourceLine, step.sourceEndLine];
        }
        return undefined;
      }
      remaining -= cell.steps.length;
    }
    return undefined;
  }, [notebook, currentStep]);

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Teachbook</span>
          <span className="text-xs text-zinc-500 truncate max-w-[40ch]">
            {notebook?.metadata.title ?? "No notebook"}
            {currentPath ? ` — ${currentPath.split("/").pop()}` : ""}
          </span>
          {isLocked && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-900 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200"
              title="Assigned notebook — Edit mode and rubric reveal are disabled."
            >
              🔒 Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden">
            <button
              onClick={handleUndo}
              disabled={history.undoDepth === 0}
              title={
                history.undoLabel
                  ? `Undo: ${history.undoLabel} (⌘⇧Z)`
                  : "Nothing to undo"
              }
              className="px-2 py-1 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:hover:bg-transparent"
            >
              ↶
              {history.undoDepth > 1 && (
                <span className="ml-1 text-xs text-zinc-500 tabular-nums">
                  {history.undoDepth}
                </span>
              )}
            </button>
            <button
              onClick={handleRedo}
              disabled={history.redoDepth === 0}
              title={
                history.redoLabel
                  ? `Redo: ${history.redoLabel} (⌘Y)`
                  : "Nothing to redo"
              }
              className="border-l border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:hover:bg-transparent"
            >
              ↷
              {history.redoDepth > 1 && (
                <span className="ml-1 text-xs text-zinc-500 tabular-nums">
                  {history.redoDepth}
                </span>
              )}
            </button>
          </div>
          <button
            onClick={() => setExamplesOpen(true)}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
          >
            Examples
          </button>
          <button
            onClick={openNotebook}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
          >
            Open
          </button>
          <button
            onClick={saveNotebook}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
          >
            Save
          </button>
          <button
            onClick={() => setGenerateOpen(true)}
            className="rounded bg-blue-600 text-white px-2 py-1 text-sm hover:bg-blue-700"
          >
            Generate
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="relative rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Settings — teaching server, teacher URL, student name"
          >
            ⚙
            {serverRunning && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500"
                title="Teaching server running"
              />
            )}
          </button>
          <button
            onClick={() => setDashboardOpen(true)}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Teacher dashboard — received submissions"
          >
            📊
          </button>
          <button
            onClick={() => setGuideOpen(true)}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="User guide"
          >
            ?
          </button>
          <button
            onClick={() => setTestMode((v) => !v)}
            className={
              "rounded px-2 py-1 text-sm " +
              (testMode
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "border border-zinc-300 dark:border-zinc-700")
            }
            title="Toggle test mode (quiz cells become answerable)"
          >
            {testMode ? "📝 Test on" : "📝 Test"}
          </button>
          {testMode && (
            <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden">
              <button
                onClick={startNewProgress}
                disabled={!notebook}
                className="px-2 py-1 text-xs disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:hover:bg-transparent"
                title="Start a fresh progress file for this notebook"
              >
                New
              </button>
              <button
                onClick={loadProgress}
                className="border-l border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Load a saved progress file"
              >
                Load
              </button>
              <button
                onClick={saveProgress}
                disabled={!progress}
                className="border-l border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:hover:bg-transparent"
                title={
                  progressPath
                    ? `Saving to ${progressPath} — click to save to a different location`
                    : "Save progress to a chosen location"
                }
              >
                Save…
              </button>
              {progress && progressPath && (
                <span
                  className={
                    "px-2 py-1 text-[10px] border-l border-zinc-300 dark:border-zinc-700 tabular-nums " +
                    (saveState === "saving"
                      ? "text-zinc-500"
                      : saveState === "error"
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400")
                  }
                  title={
                    saveState === "error"
                      ? "Auto-save failed — click Save to retry"
                      : `Auto-saving to ${progressPath}`
                  }
                >
                  {saveState === "saving"
                    ? "saving…"
                    : saveState === "error"
                      ? "save err"
                      : saveState === "saved"
                        ? "✓ saved"
                        : "idle"}
                </span>
              )}
              {progress && (() => {
                const s = summary(progress);
                return (
                  <span className="px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 border-l border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 tabular-nums">
                    {s.correct}/{s.attempted} ✓
                  </span>
                );
              })()}
              {progress && settings?.teacher_url && (
                <button
                  onClick={async () => {
                    if (!progress || !settings?.teacher_url) return;
                    if (submitFlashTimer.current)
                      window.clearTimeout(submitFlashTimer.current);
                    try {
                      const payload: TestProgress = {
                        ...progress,
                        notebookId:
                          progress.notebookId ?? currentNotebookId ?? undefined,
                        student: settings.student_name ?? "anon",
                        studentId: settings.student_id,
                        submittedAt: new Date().toISOString(),
                      };
                      const res = await submitToTeacher(
                        settings.teacher_url,
                        payload,
                      );
                      setProgress(payload);
                      setSubmitFlash({
                        kind: "ok",
                        text: `Sent · ${res.id}`,
                      });
                    } catch (e) {
                      setSubmitFlash({
                        kind: "err",
                        text: `Submit failed: ${String(e).slice(0, 80)}`,
                      });
                    }
                    submitFlashTimer.current = window.setTimeout(
                      () => setSubmitFlash(null),
                      5000,
                    );
                  }}
                  className="border-l border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title={`Submit this progress to ${settings.teacher_url}`}
                >
                  → Submit
                </button>
              )}
              {submitFlash && (
                <span
                  className={
                    "border-l border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] tabular-nums " +
                    (submitFlash.kind === "ok"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-300")
                  }
                >
                  {submitFlash.kind === "ok" ? "✓" : "✗"} {submitFlash.text}
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => setRunOpen((v) => !v)}
            className={
              "rounded px-2 py-1 text-sm " +
              (runOpen
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "border border-zinc-300 dark:border-zinc-700")
            }
            title="Run this notebook's Python code"
          >
            {runOpen ? "▾ Run" : "▸ Run"}
          </button>
          <StepControls
            currentStep={currentStep}
            totalSteps={totalSteps}
            onStep={setCurrentStep}
          />
        </div>
      </header>

      {visiblePush && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-blue-300 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 text-sm">
          <span className="text-blue-700 dark:text-blue-300 font-semibold">
            📣 Teacher pushed:
          </span>
          <span className="font-medium truncate">
            {visiblePush.notebook_title}
          </span>
          {visiblePush.message && (
            <span className="text-zinc-600 dark:text-zinc-400 italic truncate">
              — {visiblePush.message}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={() => onLoadPush(visiblePush)}
              className="rounded bg-blue-600 text-white px-2 py-0.5 text-xs hover:bg-blue-700"
            >
              Load now
            </button>
            <button
              onClick={() => onDismissPush(visiblePush)}
              className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Dismiss
            </button>
          </span>
        </div>
      )}

      <main className="grid flex-1 grid-cols-[1fr_1fr_360px] overflow-hidden">
        <ConceptPane
          source={source}
          onSourceChange={setSource}
          errors={parseErrors}
          activeSceneRange={activeSceneRange}
          notebook={notebook}
          currentStep={currentStep}
          onStepSelect={setCurrentStep}
          testMode={testMode}
          progress={progress ?? undefined}
          onProgressChange={setProgress}
          locked={isLocked}
        />
        <VisualizationPane
          notebook={notebook}
          currentStep={currentStep}
          onInsertStep={(afterIndex) => setInsertAfter(afterIndex)}
          onPrimitivePatch={handlePrimitivePatch}
        />
        <ChatPane
          notebook={notebook}
          source={source}
          currentStep={currentStep}
        />
      </main>
      <RunPane
        notebook={notebook}
        currentStep={currentStep}
        open={runOpen}
        onClose={() => setRunOpen(false)}
      />
      <Suspense fallback={null}>
        {settingsOpen && (
          <SettingsDialog
            open={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              getSettings().then(setSettings).catch(() => {});
            }}
          />
        )}
        {dashboardOpen && (
          <TeacherDashboard
            open={dashboardOpen}
            onClose={() => setDashboardOpen(false)}
          />
        )}
        {guideOpen && (
          <UserGuideDialog
            open={guideOpen}
            onClose={() => setGuideOpen(false)}
          />
        )}
      </Suspense>
      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={(tbk) => {
          snapshotAnd("generate notebook", () => {
            setSource(tbk);
            setCurrentPath(null);
            setCurrentNotebookId(null);
            setCurrentStep(0);
          });
        }}
      />
      <ExamplesDialog
        open={examplesOpen}
        onClose={() => setExamplesOpen(false)}
        onSelect={(tbk, filename, path) => {
          snapshotAnd(`load ${filename}`, () => {
            setSource(tbk);
            setCurrentPath(path ?? null);
            setCurrentNotebookId(filename.replace(/\.tbk$/i, ""));
            setCurrentStep(0);
          });
        }}
      />
      <InsertStepDialog
        open={insertAfter !== null}
        afterStepIndex={insertAfter ?? 0}
        source={source}
        onClose={() => setInsertAfter(null)}
        onInserted={(newSource, newStepIndex) => {
          snapshotAnd(`insert after step ${(insertAfter ?? 0) + 1}`, () => {
            setSource(newSource);
            setCurrentStep(newStepIndex);
          });
        }}
      />
    </div>
  );
}

export default App;
