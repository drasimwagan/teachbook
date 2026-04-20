type Props = {
  currentStep: number;
  totalSteps: number;
  onStep: (s: number) => void;
};

export default function StepControls({ currentStep, totalSteps, onStep }: Props) {
  const canPrev = currentStep > 0;
  const canNext = currentStep < totalSteps - 1;
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        disabled={!canPrev}
        onClick={() => onStep(currentStep - 1)}
        className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 disabled:opacity-40"
      >
        ◀ Prev
      </button>
      <span className="text-xs text-zinc-500 tabular-nums">
        Step {totalSteps === 0 ? 0 : currentStep + 1} / {totalSteps}
      </span>
      <button
        disabled={!canNext}
        onClick={() => onStep(currentStep + 1)}
        className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 disabled:opacity-40"
      >
        Next ▶
      </button>
      <button
        onClick={() => onStep(0)}
        className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1"
      >
        Reset
      </button>
    </div>
  );
}
