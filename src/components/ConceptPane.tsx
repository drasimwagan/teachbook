import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { LanguageDescription } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import {
  lineHighlight,
  sceneHighlightTheme,
  setHighlightRangeEffect,
} from "../lib/cm-line-highlight";
import {
  insertAtCursor,
  nextStepNumber,
  openFind,
  quizTemplate,
  sceneTemplate,
  stepAtLine,
} from "../lib/editor-actions";
import {
  formatSceneAtCursor,
  lintGutterExt,
  lintStub,
  pushDiagnostics,
  sceneFold,
} from "../lib/scene-editor-ext";
import { sceneCompletions, typeHover } from "../lib/scene-completion";
import type { ParseDiagnostic } from "../lib/tbk-parser";
import type { Notebook } from "../types";
import type { TestProgress } from "../lib/progress";

// ConceptReadView pulls react-markdown + remark-math + rehype-katex + katex
// (~150KB gzip). Lazy-load so first paint doesn't pay for it.
const ConceptReadView = lazy(() => import("./ConceptReadView"));

type Mode = "read" | "edit";

type Props = {
  source: string;
  onSourceChange: (s: string) => void;
  errors: ParseDiagnostic[];
  activeSceneRange?: [number, number];
  notebook: Notebook | null;
  currentStep: number;
  onStepSelect: (step: number) => void;
  testMode?: boolean;
  progress?: TestProgress;
  onProgressChange?: (next: TestProgress) => void;
  /** When true, Edit mode (which would expose raw source + rubrics) is
   *  hidden. Set by App.tsx from the notebook's `locked` frontmatter. */
  locked?: boolean;
};

const highlightField = lineHighlight({
  rangeClass: "tb-scene-hl",
  firstLineClass: "tb-scene-hl-first",
});

// Register JSON highlighting for ```scene fences so per-key colorization
// kicks in inside every scene body.
const sceneLang = LanguageDescription.of({
  name: "scene",
  alias: ["scene"],
  async load() {
    return json();
  },
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
  locked,
}: Props) {
  const [mode, setMode] = useState<Mode>("read");
  // A locked notebook never allows Edit mode, regardless of prior state.
  const effectiveMode: Mode = locked ? "read" : mode;

  // If the user was in Edit mode and the notebook flips to locked,
  // reset the toggle so they don't see Edit highlighted but Read showing.
  useEffect(() => {
    if (locked && mode === "edit") setMode("read");
  }, [locked, mode]);
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(
    null,
  );
  const ref = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo(
    () => [
      markdown({ codeLanguages: [sceneLang] }),
      highlightField,
      sceneHighlightTheme,
      sceneFold,
      lintStub,
      lintGutterExt,
      typeHover,
      autocompletion({
        override: [sceneCompletions],
        activateOnTyping: true,
        closeOnBlur: true,
      }),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head;
          const line = u.state.doc.lineAt(pos);
          setCursor({ line: line.number, col: pos - line.from + 1 });
        }
      }),
    ],
    [],
  );

  // Push parse diagnostics onto the editor whenever the errors prop changes.
  useEffect(() => {
    if (effectiveMode !== "edit") return;
    const view = ref.current?.view;
    if (!view) return;
    pushDiagnostics(view, errors);
  }, [errors, effectiveMode]);

  // Highlight the active scene range on every change — cheap, idempotent.
  // We key on the tuple's values, not its identity, so a re-parse that leaves
  // the line range unchanged does NOT re-dispatch.
  const rangeStart = activeSceneRange?.[0] ?? null;
  const rangeEnd = activeSceneRange?.[1] ?? null;
  useEffect(() => {
    if (effectiveMode !== "edit") return;
    const view = ref.current?.view;
    if (!view) return;
    view.dispatch({
      effects: setHighlightRangeEffect.of(activeSceneRange ?? null),
    });
  }, [rangeStart, rangeEnd, effectiveMode]);

  // Scroll to the active scene ONLY when the user navigates to a different
  // step (Next / Prev / click-a-step). Typing inside a scene would otherwise
  // re-center the viewport on every re-parse and make the cursor feel like
  // it's jumping — that's the bug the user flagged.
  const lastScrolledStep = useRef<number | null>(null);
  useEffect(() => {
    if (effectiveMode !== "edit") return;
    if (lastScrolledStep.current === currentStep) return;
    lastScrolledStep.current = currentStep;
    const view = ref.current?.view;
    if (!view || !activeSceneRange) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, effectiveMode]);

  // Reset the step-scroll memo when leaving edit mode so returning to the
  // same step after switching to Read still scrolls.
  useEffect(() => {
    if (effectiveMode !== "edit") lastScrolledStep.current = null;
  }, [effectiveMode]);

  // Seed cursor state once the editor first mounts in edit mode.
  useEffect(() => {
    if (effectiveMode !== "edit") return;
    const view = ref.current?.view;
    if (!view) return;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    setCursor({ line: line.number, col: pos - line.from + 1 });
  }, [effectiveMode]);

  const stepUnderCursor = useMemo(
    () => (cursor ? stepAtLine(notebook, cursor.line) : null),
    [cursor, notebook],
  );

  const onInsertScene = () => {
    const view = ref.current?.view;
    if (!view) return;
    insertAtCursor(view, sceneTemplate(nextStepNumber(notebook)));
  };

  const onInsertQuiz = () => {
    const view = ref.current?.view;
    if (!view) return;
    insertAtCursor(view, quizTemplate());
  };

  const onFind = () => {
    const view = ref.current?.view;
    if (view) openFind(view);
  };

  const onFormatScene = () => {
    const view = ref.current?.view;
    if (!view) return;
    formatSceneAtCursor(view);
    view.focus();
  };

  return (
    <section className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-500 shrink-0">
        <div className="flex items-center gap-2">
          <span>Concept</span>
          {effectiveMode === "edit" && (
            <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden">
              <button
                onClick={onInsertScene}
                disabled={!notebook}
                title="Insert a new scene fence at the cursor"
                className="px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                + Scene
              </button>
              <button
                onClick={onInsertQuiz}
                title="Insert a quiz section (question + rubric) at the cursor"
                className="border-l border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                + Quiz
              </button>
              <button
                onClick={onFind}
                title="Open Find panel (⌘F / Ctrl+F)"
                className="border-l border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Find
              </button>
              <button
                onClick={onFormatScene}
                title="Pretty-print the scene JSON at cursor (indent 2)"
                className="border-l border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Format
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {errors.length > 0 && (
            <span className="text-amber-600">
              {errors.length} warning{errors.length === 1 ? "" : "s"}
            </span>
          )}
          {locked ? (
            <span
              className="inline-flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300"
              title="This notebook is locked — Edit mode is disabled to avoid revealing answers."
            >
              🔒 Locked
            </span>
          ) : (
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
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {effectiveMode === "edit" ? (
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
              // Our scene-aware completion is installed via extensions above;
              // disable the default to avoid two autocompletion instances.
              autocompletion: false,
              closeBrackets: true,
              searchKeymap: true,
              highlightSelectionMatches: true,
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
              locked={locked}
            />
          </Suspense>
        )}
      </div>

      {effectiveMode === "edit" && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-1 text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-3 shrink-0 font-mono tabular-nums">
          {cursor && (
            <span>
              Ln {cursor.line}, Col {cursor.col}
            </span>
          )}
          {stepUnderCursor !== null && (
            <button
              onClick={() => onStepSelect(stepUnderCursor)}
              className="text-blue-600 dark:text-blue-400 hover:underline"
              title="Jump to this step in the Read view and viz"
            >
              → Step {stepUnderCursor + 1}
            </button>
          )}
          <span className="flex-1" />
          <span
            className={
              errors.length === 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }
          >
            {errors.length === 0
              ? "parse: ok"
              : `parse: ${errors.length} warning${errors.length === 1 ? "" : "s"}`}
          </span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="border-t border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-900 p-2 text-xs space-y-1 max-h-32 overflow-auto shrink-0">
          {errors.map((e, i) => (
            <div key={i} className="text-amber-800 dark:text-amber-200 font-mono">
              {e.startLine != null && (
                <span className="text-amber-600 dark:text-amber-400">
                  L{e.startLine}
                  {e.endLine && e.endLine !== e.startLine ? `–${e.endLine}` : ""}:{" "}
                </span>
              )}
              {e.message}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
