import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  EditorView,
  Decoration,
  type DecorationSet,
  gutter,
  GutterMarker,
} from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";

type Props = {
  code: string;
  codeLang?: string;
  highlight?: [number, number]; // 1-indexed inclusive
  stepNumber?: number; // 1-indexed display step (for the gutter marker)
};

const setHighlightEffect = StateEffect.define<[number, number] | null>();
const setStepNumberEffect = StateEffect.define<number | null>();

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
        const s = Math.max(1, Math.min(doc.lines, start));
        const en = Math.max(s, Math.min(doc.lines, end));
        for (let ln = s; ln <= en; ln++) {
          const line = doc.line(ln);
          const isFirst = ln === s;
          builder.add(
            line.from,
            line.from,
            Decoration.line({
              attributes: {
                class: isFirst ? "tb-hl-line tb-hl-line-active" : "tb-hl-line",
              },
            }),
          );
        }
        return builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const activeRangeField = StateField.define<[number, number] | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlightEffect)) return e.value;
    }
    return value;
  },
});

const stepNumberField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setStepNumberEffect)) return e.value;
    }
    return value;
  },
});

class ActiveMarker extends GutterMarker {
  constructor(private label: string) {
    super();
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "tb-gutter-marker";
    el.textContent = this.label;
    return el;
  }
}

const activeGutter = gutter({
  class: "tb-active-gutter",
  lineMarker(view, line) {
    const range = view.state.field(activeRangeField);
    const step = view.state.field(stepNumberField);
    if (!range) return null;
    const lineNum = view.state.doc.lineAt(line.from).number;
    if (lineNum === range[0]) {
      return new ActiveMarker(step != null ? `▸${step}` : "▸");
    }
    return null;
  },
  initialSpacer: () => new ActiveMarker("   "),
});

const highlightTheme = EditorView.theme({
  ".tb-hl-line": {
    backgroundColor: "rgba(250, 204, 21, 0.14)",
  },
  ".tb-hl-line-active": {
    backgroundColor: "rgba(250, 204, 21, 0.28)",
    boxShadow: "inset 3px 0 0 0 #facc15",
  },
  ".tb-active-gutter": {
    minWidth: "28px",
    textAlign: "right",
    paddingRight: "6px",
    color: "#facc15",
  },
  ".tb-gutter-marker": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "11px",
    fontWeight: "600",
  },
});

function langExtension(lang?: string) {
  const l = (lang ?? "").toLowerCase();
  if (l === "python" || l === "py") return python();
  if (l === "javascript" || l === "js" || l === "ts" || l === "typescript")
    return javascript();
  return null;
}

export default function CodeStepView({
  code,
  codeLang,
  highlight,
  stepNumber,
}: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo(() => {
    const exts = [
      highlightField,
      activeRangeField,
      stepNumberField,
      activeGutter,
      highlightTheme,
    ];
    const langExt = langExtension(codeLang);
    if (langExt) exts.push(langExt);
    return exts;
  }, [codeLang]);

  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    view.dispatch({
      effects: [
        setHighlightEffect.of(highlight ?? null),
        setStepNumberEffect.of(stepNumber ?? null),
      ],
    });
    if (highlight) {
      try {
        const [start] = highlight;
        const lineStart = Math.max(1, Math.min(view.state.doc.lines, start));
        const pos = view.state.doc.line(lineStart).from;
        view.dispatch({
          effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
      } catch {
        // out of range, ignore
      }
    }
  }, [highlight, stepNumber, code]);

  if (!code.trim()) return null;

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-950 flex flex-col min-h-0">
      <div className="px-3 py-1 text-xs font-medium text-zinc-400 border-b border-zinc-800 shrink-0 flex items-center gap-2">
        <span>Solution</span>
        {codeLang && (
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] uppercase tracking-wide">
            {codeLang}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
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
    </div>
  );
}
