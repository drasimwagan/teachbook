import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

type Props = {
  source: string;
  onSourceChange: (s: string) => void;
  errors: string[];
};

export default function ConceptPane({ source, onSourceChange, errors }: Props) {
  return (
    <section className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500">
        <span>Concept</span>
        {errors.length > 0 && (
          <span className="text-amber-600">{errors.length} parse warning{errors.length === 1 ? "" : "s"}</span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <CodeMirror
          value={source}
          height="100%"
          theme={oneDark}
          extensions={[markdown()]}
          onChange={onSourceChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
          }}
        />
      </div>
      {errors.length > 0 && (
        <div className="border-t border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-900 p-2 text-xs space-y-1 max-h-32 overflow-auto">
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
