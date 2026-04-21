import { lazy, Suspense } from "react";
import type { Cell, Notebook, Scene, Step } from "../types";
import type { PrimitivePatch } from "../lib/scene-edit";
import SceneRenderer from "./SceneRenderer";

// CodeStepView pulls @codemirror/lang-python + @codemirror/lang-javascript.
// Lazy-load so notebooks without a code block skip the cost entirely.
const CodeStepView = lazy(() => import("./CodeStepView"));

type Props = {
  notebook: Notebook | null;
  currentStep: number;
  onInsertStep?: (afterStepIndex: number) => void;
  /**
   * Called when the user drags a draggable primitive to a new position.
   * `sourceLine`/`sourceEndLine` identify the scene fence in the source
   * (1-indexed); `primitiveIndex` is the index in `scene.primitives`.
   */
  onPrimitivePatch?: (
    sourceLine: number,
    sourceEndLine: number,
    primitiveIndex: number,
    patch: PrimitivePatch,
  ) => void;
};

type Located = { cell: Cell; step: Step } | null;

function locate(nb: Notebook | null, step: number): Located {
  if (!nb) return null;
  let remaining = step;
  for (const cell of nb.cells) {
    if (remaining < cell.steps.length) {
      const s = cell.steps[remaining];
      return s ? { cell, step: s } : null;
    }
    remaining -= cell.steps.length;
  }
  return null;
}

export default function VisualizationPane({
  notebook,
  currentStep,
  onInsertStep,
  onPrimitivePatch,
}: Props) {
  const located = locate(notebook, currentStep);
  const scene: Scene | null = located?.step.scene ?? null;
  const narration = located?.step.narration ?? "";
  const code = located?.cell.code ?? "";
  const codeLang = located?.cell.codeLang;
  const codeLines = located?.step.codeLines;
  const hasCode = !!code.trim();
  const sourceLine = located?.step.sourceLine;
  const sourceEndLine = located?.step.sourceEndLine;
  const patch =
    onPrimitivePatch && sourceLine && sourceEndLine
      ? (i: number, p: PrimitivePatch) =>
          onPrimitivePatch(sourceLine, sourceEndLine, i, p)
      : undefined;

  return (
    <section className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden min-h-0">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500 shrink-0">
        Visualization
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Scene — takes top half when code is present, full height otherwise */}
        <div
          className={
            "bg-white dark:bg-zinc-950 flex items-center justify-center min-h-0 " +
            (hasCode ? "basis-1/2 flex-1" : "flex-1")
          }
        >
          <div className="h-full w-full flex items-center justify-center p-2">
            {scene ? (
              <SceneRenderer scene={scene} onPrimitivePatch={patch} />
            ) : (
              <div className="text-sm text-zinc-400">
                {notebook?.totalSteps === 0
                  ? "This notebook has no steps yet."
                  : "No scene at this step."}
              </div>
            )}
          </div>
        </div>

        {/* Code step — takes bottom half when present */}
        {hasCode && (
          <div className="basis-1/2 flex-1 min-h-0 flex flex-col">
            <Suspense fallback={<div className="p-3 text-xs text-zinc-400">Loading code view…</div>}>
              <CodeStepView
                code={code}
                codeLang={codeLang}
                highlight={codeLines}
                stepNumber={currentStep + 1}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Narration */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-2 shrink-0 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-amber-600 tabular-nums">
                STEP {currentStep + 1}
                {notebook ? ` / ${notebook.totalSteps}` : ""}
              </span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {narration || (
                  <span className="text-zinc-400 italic">no narration</span>
                )}
              </span>
            </div>
          </div>
          {located?.step.sourceEndLine && onInsertStep && (
            <button
              onClick={() => onInsertStep(currentStep)}
              title="Insert a new step after this one (Claude)"
              className="shrink-0 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-400 dark:hover:border-blue-700"
            >
              + Add step
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
