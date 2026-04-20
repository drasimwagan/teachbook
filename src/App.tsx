import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import ConceptPane from "./components/ConceptPane";
import VisualizationPane from "./components/VisualizationPane";
import ChatPane from "./components/ChatPane";
import StepControls from "./components/StepControls";
import { parseTbk } from "./lib/tbk-parser";
import type { Notebook } from "./types";
import "./App.css";

const WELCOME = `---
title: Welcome to Teachbook
subject: intro
version: 0.1
---

# Welcome

Open a \`.tbk\` notebook (File → Open) or start typing here. Changes are
parsed live, and the Visualization pane renders the current step.
`;

function App() {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [source, setSource] = useState<string>(WELCOME);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

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
      setSource(contents);
      setCurrentPath(selected);
      setCurrentStep(0);
    } catch (e) {
      setParseErrors([`Failed to open: ${String(e)}`]);
    }
  }, []);

  const saveNotebook = useCallback(async () => {
    let path = currentPath;
    if (!path) {
      const chosen = await save({
        filters: [{ name: "Teachbook", extensions: ["tbk"] }],
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
  }, [currentPath, source]);

  const totalSteps = notebook?.totalSteps ?? 0;

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
          <StepControls
            currentStep={currentStep}
            totalSteps={totalSteps}
            onStep={setCurrentStep}
          />
        </div>
      </header>

      <main className="grid flex-1 grid-cols-[1fr_1fr_360px] overflow-hidden">
        <ConceptPane source={source} onSourceChange={setSource} errors={parseErrors} />
        <VisualizationPane notebook={notebook} currentStep={currentStep} />
        <ChatPane notebook={notebook} />
      </main>
    </div>
  );
}

export default App;
