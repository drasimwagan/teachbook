import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { parseTbk } from "./lib/tbk-parser";
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
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [runOpen, setRunOpen] = useState(false);

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
        setCurrentStep(0);
      });
    } catch (e) {
      setParseErrors([`Failed to open: ${String(e)}`]);
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
      setParseErrors([`Failed to save: ${String(e)}`]);
    }
  }, [currentPath, source, notebook]);

  const totalSteps = notebook?.totalSteps ?? 0;

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

      <main className="grid flex-1 grid-cols-[1fr_1fr_360px] overflow-hidden">
        <ConceptPane
          source={source}
          onSourceChange={setSource}
          errors={parseErrors}
          activeSceneRange={activeSceneRange}
          notebook={notebook}
          currentStep={currentStep}
          onStepSelect={setCurrentStep}
        />
        <VisualizationPane
          notebook={notebook}
          currentStep={currentStep}
          onInsertStep={(afterIndex) => setInsertAfter(afterIndex)}
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
      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={(tbk) => {
          snapshotAnd("generate notebook", () => {
            setSource(tbk);
            setCurrentPath(null);
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
