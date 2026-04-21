import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  getPyodide,
  injectGlobals,
  runPython,
  type PyodideAPI,
} from "../lib/pyodide-runner";
import type { Notebook, Scene } from "../types";

type Props = {
  notebook: Notebook | null;
  currentStep: number;
  open: boolean;
  onClose: () => void;
};

type LogLine = { stream: "out" | "err" | "info"; text: string };

/** Slice the Step the user is currently on from the flattened step index. */
function findActiveCellAndScene(
  notebook: Notebook | null,
  currentStep: number,
): { code: string | undefined; scene: Scene | undefined } {
  if (!notebook) return { code: undefined, scene: undefined };
  let remaining = currentStep;
  for (const cell of notebook.cells) {
    if (remaining < cell.steps.length) {
      return { code: cell.code, scene: cell.steps[remaining]?.scene };
    }
    remaining -= cell.steps.length;
  }
  return { code: undefined, scene: undefined };
}

export default function RunPane({
  notebook,
  currentStep,
  open,
  onClose,
}: Props) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "running" | "error"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string>("Pyodide not loaded");
  const [code, setCode] = useState<string>("");
  const [log, setLog] = useState<LogLine[]>([]);
  const pyRef = useRef<PyodideAPI | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const { code: notebookCode, scene } = useMemo(
    () => findActiveCellAndScene(notebook, currentStep),
    [notebook, currentStep],
  );

  // Seed the editor from the notebook when the user switches to a new cell,
  // but don't clobber their in-progress edits on every step change within
  // the same cell. We simply re-seed whenever the active cell's code
  // identity changes. A "Reset from notebook" button restores it manually.
  useEffect(() => {
    if (!open) return;
    if (notebookCode === undefined) return;
    setCode((prev) => (prev === "" ? notebookCode : prev));
  }, [open, notebookCode]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  const ensurePyodide = useCallback(async (): Promise<PyodideAPI | null> => {
    if (pyRef.current) return pyRef.current;
    try {
      setStatus("loading");
      setStatusMsg("loading Pyodide from CDN…");
      const py = await getPyodide((m) => setStatusMsg(m));
      pyRef.current = py;
      setStatus("ready");
      setStatusMsg("ready");
      return py;
    } catch (e) {
      setStatus("error");
      setStatusMsg(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const appendLog = useCallback((stream: LogLine["stream"], text: string) => {
    setLog((prev) => [...prev, { stream, text }]);
  }, []);

  const onRun = useCallback(async () => {
    const py = await ensurePyodide();
    if (!py) return;
    setStatus("running");
    appendLog("info", ">>> run");
    const res = await runPython(
      py,
      code,
      (s) => appendLog("out", s),
      (s) => appendLog("err", s),
    );
    if (!res.ok && res.error) appendLog("err", res.error);
    setStatus("ready");
  }, [code, ensurePyodide, appendLog]);

  const onInjectSceneVars = useCallback(async () => {
    const py = await ensurePyodide();
    if (!py) return;
    if (!scene) {
      appendLog("err", "No scene available for the current step.");
      return;
    }
    // Expose the raw scene as `scene`, plus per-primitive shortcuts: grids,
    // matrices, etc. keyed by their `id` if they have one, otherwise `type_N`.
    const indexed: Record<string, unknown> = {};
    const counts: Record<string, number> = {};
    for (const p of scene.primitives) {
      const type = (p as { type: string }).type ?? "primitive";
      const n = counts[type] ?? 0;
      counts[type] = n + 1;
      const id = (p as { id?: string }).id;
      const key = id ?? `${type.replace(/\W+/g, "_")}_${n}`;
      indexed[key] = p;
    }
    injectGlobals(py, { scene, primitives: scene.primitives, ...indexed });
    appendLog(
      "info",
      `injected: scene, primitives, ${Object.keys(indexed).join(", ") || "(none)"}`,
    );
  }, [ensurePyodide, scene, appendLog]);

  const onReset = useCallback(() => {
    if (notebookCode !== undefined) setCode(notebookCode);
  }, [notebookCode]);

  const onClear = useCallback(() => setLog([]), []);

  const onSaveExperiment = useCallback(async () => {
    let defaultPath: string | undefined;
    try {
      const dir = await invoke<string>("user_experiments_path");
      const title = notebook?.metadata.title ?? "experiment";
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      defaultPath = `${dir}/${slug || "experiment"}.py`;
    } catch {
      // fall through — no default
    }
    const chosen = await saveDialog({
      filters: [{ name: "Python", extensions: ["py"] }],
      defaultPath,
    });
    if (!chosen) return;
    try {
      await invoke("save_notebook", { path: chosen, contents: code });
      appendLog("info", `saved: ${chosen}`);
    } catch (e) {
      appendLog("err", `save failed: ${String(e)}`);
    }
  }, [code, notebook, appendLog]);

  const onLoadExperiment = useCallback(async () => {
    let defaultDir: string | undefined;
    try {
      defaultDir = await invoke<string>("user_experiments_path");
    } catch {
      // fall through
    }
    const selected = await openDialog({
      multiple: false,
      defaultPath: defaultDir,
      filters: [{ name: "Python", extensions: ["py"] }],
    });
    if (!selected || typeof selected !== "string") return;
    try {
      const contents = await invoke<string>("load_notebook", { path: selected });
      setCode(contents);
      appendLog("info", `loaded: ${selected}`);
    } catch (e) {
      appendLog("err", `load failed: ${String(e)}`);
    }
  }, [appendLog]);

  if (!open) return null;

  return (
    <div className="flex h-[38vh] min-h-[260px] flex-col border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Run</span>
          <span
            className={
              "text-xs " +
              (status === "error"
                ? "text-red-600"
                : status === "ready"
                  ? "text-emerald-600"
                  : status === "running"
                    ? "text-blue-600"
                    : "text-zinc-500")
            }
          >
            {statusMsg}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={status === "running" || status === "loading"}
            className="rounded bg-emerald-600 text-white px-2 py-1 text-xs hover:bg-emerald-700 disabled:opacity-40"
          >
            ▶ Run
          </button>
          <button
            onClick={onInjectSceneVars}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs"
            title="Inject the current scene's primitives as Python globals"
          >
            Inject scene
          </button>
          <button
            onClick={onReset}
            disabled={notebookCode === undefined}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs disabled:opacity-40"
            title="Restore the editor to the notebook cell's code"
          >
            Reset
          </button>
          <button
            onClick={onClear}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs"
          >
            Clear output
          </button>
          <div className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-700" />
          <button
            onClick={onSaveExperiment}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs"
            title="Save the current code as a .py experiment"
          >
            Save…
          </button>
          <button
            onClick={onLoadExperiment}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs"
            title="Load a .py experiment into the editor"
          >
            Load…
          </button>
          <div className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-700" />
          <button
            onClick={onClose}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs"
            title="Close the Run pane"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 overflow-hidden">
        <div className="overflow-auto border-r border-zinc-200 dark:border-zinc-800">
          <CodeMirror
            value={code}
            onChange={setCode}
            extensions={[python()]}
            theme={oneDark}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
            className="text-sm"
          />
        </div>
        <div className="overflow-auto bg-zinc-950 font-mono text-xs text-zinc-100 p-2">
          {log.length === 0 && (
            <div className="text-zinc-500">
              Output will appear here. Hit ▶ Run to execute the Python code.
              First run fetches Pyodide (~6 MB) from jsdelivr.
            </div>
          )}
          {log.map((l, i) => (
            <div
              key={i}
              className={
                l.stream === "err"
                  ? "whitespace-pre-wrap text-red-400"
                  : l.stream === "info"
                    ? "whitespace-pre-wrap text-zinc-500"
                    : "whitespace-pre-wrap text-zinc-100"
              }
            >
              {l.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
