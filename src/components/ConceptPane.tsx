import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import {
  lineHighlight,
  sceneHighlightTheme,
  setHighlightRangeEffect,
} from "../lib/cm-line-highlight";
import type { Notebook } from "../types";
import type { TestProgress } from "../lib/progress";

// ConceptReadView pulls react-markdown + remark-math + rehype-katex + katex
// (~150KB gzip). Lazy-load so first paint doesn't pay for it.
const ConceptReadView = lazy(() => import("./ConceptReadView"));

type Mode = "read" | "edit";

type Props = {
  source: string;
  onSourceChange: (s: string) => void;
  errors: string[];
  activeSceneRange?: [number, number];
  notebook: Notebook | null;
  currentStep: number;
  onStepSelect: (step: number) => void;
  testMode?: boolean;
  progress?: TestProgress;
  onProgressChange?: (next: TestProgress) => void;
};

const highlightField = lineHighlight({
  rangeClass: "tb-scene-hl",
  firstLineClass: "tb-scene-hl-first",
});

export default function ConceptPane({
  source,
  onSourceChange,
  errors,
  activeSceneRange,
  notebook,
  currentStep,
  onStepSelect,
  testMode,
  progress,
  onProgressChange,
}: Props) {
  const [mode, setMode] = useState<Mode>("read");
  const ref = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo(
    () => [
      markdown(),
      highlightField,
      sceneHighlightTheme,
      EditorView.lineWrapping,
    ],
    [],
  );

  useEffect(() => {
    if (mode !== "edit") return;
    const view = ref.current?.view;
    if (!view) return;
    view.dispatch({
      effects: setHighlightRangeEffect.of(activeSceneRange ?? null),
    });
    if (activeSceneRange) {
      try {
        const [start] = activeSceneRange;
        const line = view.state.doc.line(
          Math.max(1, Math.min(view.state.doc.lines, start)),
        );
        view.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
      } catch {
        // range out of doc (stale parse), ignore
      }
    }
  }, [activeSceneRange, mode]);

  return (
    <section className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-500 shrink-0">
        <span>Concept</span>
        <div className="flex items-center gap-2">
          {errors.length > 0 && (
            <span className="text-amber-600">
              {errors.length} warning{errors.length === 1 ? "" : "s"}
            </span>
          )}
          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden">
            <button
              onClick={() => setMode("read")}
              className={
                "px-2 py-0.5 text-xs " +
                (mode === "read"
                  ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800")
              }
            >
              Read
            </button>
            <button
              onClick={() => setMode("edit")}
              className={
                "px-2 py-0.5 text-xs border-l border-zinc-300 dark:border-zinc-700 " +
                (mode === "edit"
                  ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800")
              }
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {mode === "edit" ? (
          <CodeMirror
            ref={ref}
            value={source}
            height="100%"
            theme={oneDark}
            extensions={extensions}
            onChange={onSourceChange}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
          />
        ) : (
          <Suspense
            fallback={
              <div className="p-4 text-sm text-zinc-400">Loading reader…</div>
            }
          >
            <ConceptReadView
              notebook={notebook}
              currentStep={currentStep}
              onStepSelect={onStepSelect}
              testMode={testMode}
              progress={progress}
              onProgressChange={onProgressChange}
            />
          </Suspense>
        )}
      </div>

      {errors.length > 0 && (
        <div className="border-t border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-900 p-2 text-xs space-y-1 max-h-32 overflow-auto shrink-0">
          {errors.map((e, i) => (
            <div key={i} className="text-amber-800 dark:text-amber-200 font-mono">
              {e}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
