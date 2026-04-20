import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import type { Notebook } from "../types";

type Props = {
  notebook: Notebook | null;
  onChange: (nb: Notebook | null) => void;
};

export default function ConceptPane({ notebook, onChange }: Props) {
  return (
    <section className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500">
        Concept
      </div>
      <div className="flex-1 overflow-auto">
        <CodeMirror
          value={notebook?.source ?? "# Welcome to Teachbook\n\nLoad a `.tbk` notebook to begin, or ask Claude in the chat to generate one.\n"}
          height="100%"
          theme={oneDark}
          extensions={[markdown()]}
          onChange={(val) => {
            if (notebook) onChange({ ...notebook, source: val });
          }}
        />
      </div>
    </section>
  );
}
