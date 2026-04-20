import { motion } from "framer-motion";
import type { Cell, Notebook, Scene, Step } from "../types";
import SceneRenderer from "./SceneRenderer";
import CodeStepView from "./CodeStepView";

type Props = {
  notebook: Notebook | null;
  currentStep: number;
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

export default function VisualizationPane({ notebook, currentStep }: Props) {
  const located = locate(notebook, currentStep);
  const scene: Scene | null = located?.step.scene ?? null;
  const narration = located?.step.narration ?? "";
  const code = located?.cell.code ?? "";
  const codeLang = located?.cell.codeLang;
  const codeLines = located?.step.codeLines;

  return (
    <section className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500">
        Visualization
      </div>

      <div className="flex-1 overflow-auto bg-white dark:bg-zinc-950 flex items-center justify-center min-h-0">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="h-full w-full flex items-center justify-center"
        >
          {scene ? (
            <SceneRenderer scene={scene} />
          ) : (
            <div className="text-sm text-zinc-400">
              {notebook?.totalSteps === 0
                ? "This notebook has no steps yet."
                : "No scene at this step."}
            </div>
          )}
        </motion.div>
      </div>

      {code && (
        <div className="max-h-[45%] overflow-auto shrink-0">
          <CodeStepView code={code} codeLang={codeLang} highlight={codeLines} />
        </div>
      )}

      {narration && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 shrink-0">
          <span className="font-medium text-zinc-500">Step {currentStep + 1}:</span>{" "}
          {narration}
        </div>
      )}
    </section>
  );
}
