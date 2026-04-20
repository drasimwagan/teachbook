import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";

type Props = {
  code: string;
  codeLang?: string;
  highlight?: [number, number]; // 1-indexed inclusive
};

const setHighlightEffect = StateEffect.define<[number, number] | null>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHighlightEffect)) {
        if (!e.value) return Decoration.none;
        const [start, end] = e.value;
        const builder = new RangeSetBuilder<Decoration>();
        const doc = tr.state.doc;
        const clampedStart = Math.max(1, Math.min(doc.lines, start));
        const clampedEnd = Math.max(clampedStart, Math.min(doc.lines, end));
        for (let ln = clampedStart; ln <= clampedEnd; ln++) {
          const line = doc.line(ln);
          builder.add(
            line.from,
            line.from,
            Decoration.line({ attributes: { class: "tb-hl-line" } }),
          );
        }
        return builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const highlightTheme = EditorView.theme({
  ".tb-hl-line": {
    backgroundColor: "rgba(250, 204, 21, 0.22)",
    borderLeft: "3px solid #facc15",
  },
});

export default function CodeStepView({ code, codeLang, highlight }: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo(() => {
    const exts = [highlightField, highlightTheme];
    if (!codeLang || codeLang === "python" || codeLang === "py") {
      exts.push(python());
    }
    return exts;
  }, [codeLang]);

  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    view.dispatch({ effects: setHighlightEffect.of(highlight ?? null) });

    if (highlight) {
      const [start, end] = highlight;
      try {
        const lineStart = Math.max(1, Math.min(view.state.doc.lines, start));
        const lineEnd = Math.max(lineStart, Math.min(view.state.doc.lines, end));
        const pos = view.state.doc.line(lineStart).from;
        view.dispatch({
          effects: EditorView.scrollIntoView(
            view.state.doc.line(lineEnd).to,
            { y: "nearest" },
          ),
          selection: { anchor: pos },
        });
      } catch {
        // out of range, ignore
      }
    }
  }, [highlight, code]);

  if (!code.trim()) return null;

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-950">
      <div className="px-3 py-1 text-xs font-medium text-zinc-400 border-b border-zinc-800">
        Code step
      </div>
      <CodeMirror
        ref={ref}
        value={code}
        theme={oneDark}
        extensions={extensions}
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
      />
    </div>
  );
}
