import {
  Decoration,
  EditorView,
  type DecorationSet,
} from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";

export const setHighlightRangeEffect = StateEffect.define<
  [number, number] | null
>();

/**
 * CodeMirror extension: highlight a range of lines (1-indexed, inclusive).
 * Dispatch `setHighlightRangeEffect.of([start, end])` to update.
 *
 * Pass `activeClass` to customize the background class, and
 * `firstLineClass` for extra styling on the first line of the range.
 */
export function lineHighlight(opts: {
  rangeClass?: string;
  firstLineClass?: string;
} = {}) {
  const rangeClass = opts.rangeClass ?? "tb-hl-line";
  const firstLineClass = opts.firstLineClass ?? "tb-hl-line-active";

  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const e of tr.effects) {
        if (e.is(setHighlightRangeEffect)) {
          if (!e.value) return Decoration.none;
          const [start, end] = e.value;
          const builder = new RangeSetBuilder<Decoration>();
          const doc = tr.state.doc;
          const s = Math.max(1, Math.min(doc.lines, start));
          const en = Math.max(s, Math.min(doc.lines, end));
          for (let ln = s; ln <= en; ln++) {
            const line = doc.line(ln);
            const cls =
              ln === s ? `${rangeClass} ${firstLineClass}` : rangeClass;
            builder.add(
              line.from,
              line.from,
              Decoration.line({ attributes: { class: cls } }),
            );
          }
          return builder.finish();
        }
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

export const sceneHighlightTheme = EditorView.theme({
  ".tb-scene-hl": {
    backgroundColor: "rgba(96, 165, 250, 0.10)",
  },
  ".tb-scene-hl-first": {
    backgroundColor: "rgba(96, 165, 250, 0.18)",
    boxShadow: "inset 3px 0 0 0 #60a5fa",
  },
});
