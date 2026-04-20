import { motion } from "framer-motion";
import type { Notebook, Scene } from "../types";
import SceneRenderer from "./SceneRenderer";

type Props = {
  notebook: Notebook | null;
  currentStep: number;
};

function sceneForStep(nb: Notebook | null, step: number): Scene | null {
  if (!nb) return null;
  let remaining = step;
  for (const cell of nb.cells) {
    if (remaining < cell.steps.length) {
      return cell.steps[remaining]?.scene ?? null;
    }
    remaining -= cell.steps.length;
  }
  return null;
}

export default function VisualizationPane({ notebook, currentStep }: Props) {
  const scene = sceneForStep(notebook, currentStep);

  return (
    <section className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500">
        Visualization
      </div>
      <div className="flex-1 overflow-auto bg-white dark:bg-zinc-950">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="h-full w-full"
        >
          {scene ? (
            <SceneRenderer scene={scene} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              No scene at this step.
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
