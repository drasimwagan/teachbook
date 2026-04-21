import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { listPlugins } from "../plugins";

/** Ready-to-insert primitive templates. Triggered when the user is at an
 *  array slot inside a `primitives` list (after `[` or `,`). Each template
 *  is a minimal, visually-meaningful skeleton — authors can tweak numbers
 *  without having to remember the JSON shape. */
const PRIMITIVE_SNIPPETS: { label: string; snippet: string; detail: string }[] = [
  {
    label: "shape (circle)",
    snippet: `{"type":"shape","shape":"circle","x":400,"y":250,"radius":20,"fill":"#60a5fa"}`,
    detail: "core",
  },
  {
    label: "shape (rect)",
    snippet: `{"type":"shape","shape":"rect","x":400,"y":250,"width":60,"height":40,"fill":"#60a5fa"}`,
    detail: "core",
  },
  {
    label: "label",
    snippet: `{"type":"label","x":400,"y":250,"text":"edit me"}`,
    detail: "core",
  },
  {
    label: "label (LaTeX)",
    snippet: `{"type":"label","x":400,"y":250,"text":"E = mc^2","latex":true}`,
    detail: "core",
  },
  {
    label: "arrow",
    snippet: `{"type":"arrow","from":[100,250],"to":[400,250],"label":"v"}`,
    detail: "core",
  },
  {
    label: "grid",
    snippet: `{"type":"grid","values":[1,2,3,4,5],"highlight":[2]}`,
    detail: "core",
  },
  {
    label: "axes",
    snippet: `{"type":"axes","xMin":0,"xMax":10,"yMin":0,"yMax":10}`,
    detail: "core",
  },
  {
    label: "plot",
    snippet: `{"type":"plot","points":[[0,0],[1,1],[2,4],[3,9]],"label":"y = x^2"}`,
    detail: "core",
  },
  {
    label: "matrix",
    snippet: `{"type":"matrix","rows":[[0,0,0],[0,1,0],[0,0,0]],"highlight":[[1,1]]}`,
    detail: "core",
  },
  {
    label: "graph",
    snippet: `{"type":"graph","nodes":[{"id":"A","x":200,"y":250},{"id":"B","x":500,"y":250}],"edges":[{"from":"A","to":"B","weight":3}]}`,
    detail: "core",
  },
  {
    label: "molecule",
    snippet: `{"type":"molecule","atoms":[{"id":"c","element":"C","x":400,"y":250},{"id":"h1","element":"H","x":460,"y":210}],"bonds":[{"from":"c","to":"h1"}]}`,
    detail: "plugin",
  },
  {
    label: "nn",
    snippet: `{"type":"nn","layers":[{"size":2},{"size":3,"activations":[0.3,0.7,0.1]},{"size":1}]}`,
    detail: "plugin",
  },
  {
    label: "heatmap",
    snippet: `{"type":"heatmap","values":[[0,0.5,1],[0.5,1,0.5],[1,0.5,0]],"colormap":"viridis"}`,
    detail: "plugin",
  },
  {
    label: "bloch",
    snippet: `{"type":"bloch","state":{"theta":0.5,"phi":0.25},"label":"|+⟩"}`,
    detail: "plugin",
  },
  {
    label: "circuit",
    snippet: `{"type":"circuit","elements":[{"kind":"battery","from":[150,330],"to":[150,140],"label":"9 V"},{"kind":"wire","from":[150,140],"to":[450,140]},{"kind":"resistor","from":[450,140],"to":[450,330],"label":"R"},{"kind":"wire","from":[450,330],"to":[150,330]}]}`,
    detail: "plugin",
  },
];

// Core primitive types — these are built into SceneRenderer directly.
const CORE_TYPES: { name: string; description: string }[] = [
  { name: "grid", description: "1D array with optional position, cell size, label" },
  { name: "shape", description: "circle / rect / polygon with a stable id for tweening" },
  { name: "arrow", description: "weighted, labeled, directable vector" },
  { name: "label", description: "plain text or LaTeX (via KaTeX)" },
  { name: "axes", description: "coordinate system for plots and physics (un-projects primitive coords into data space)" },
  { name: "plot", description: "line / scatter with animated path growth" },
  { name: "graph", description: "weighted directed / undirected graph with node + edge highlighting" },
  { name: "matrix", description: "2D table with row / col labels and cell highlights (DP, Punnett)" },
];

// Fields where a closed set of values is legal.
const ENUM_FIELDS: Record<string, string[]> = {
  shape: ["circle", "rect", "polygon"],
  kind: [
    // circuit plugin element kinds — keeps completion useful even for
    // hand-authored electronics scenes
    "wire",
    "resistor",
    "capacitor",
    "inductor",
    "battery",
    "voltage_source",
    "ground",
    "node",
    "label",
  ],
};

// Fields that accept only booleans.
const BOOL_FIELDS = new Set([
  "latex",
  "highlight",
  "directed",
  "correct",
]);

// Keys commonly seen on primitives — offered when the user is starting a
// new property inside an object.
const COMMON_KEYS = [
  "type",
  "id",
  "x",
  "y",
  "width",
  "height",
  "radius",
  "from",
  "to",
  "label",
  "text",
  "latex",
  "highlight",
  "values",
  "rows",
  "cols",
  "cellSize",
  "primitives",
  "points",
  "nodes",
  "edges",
  "directed",
  "weight",
  "fill",
  "stroke",
  "xMin",
  "xMax",
  "yMin",
  "yMax",
];

/** Slice up to `n` characters ending at `pos`, across line boundaries.
 *  Used for contexts where a relevant token (like `[` or `,`) may live on
 *  a previous line — e.g. `[\n  {...},\n  <cursor>`. */
function sliceBack(state: EditorState, pos: number, n: number): string {
  return state.sliceDoc(Math.max(0, pos - n), pos);
}

/** True iff `pos` lies inside the body of a ```scene fence. */
function isInsideSceneFence(state: EditorState, pos: number): boolean {
  const lineNumber = state.doc.lineAt(pos).number;
  for (let n = lineNumber - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (/^```scene\b/.test(text)) return true;
    if (/^```/.test(text)) return false;
  }
  return false;
}

/** All type names known to the app — core primitives + registered plugins. */
function knownTypes(): { name: string; description: string }[] {
  const extras = listPlugins().map((p) => ({
    name: p.type,
    description: p.description,
  }));
  return [...CORE_TYPES, ...extras];
}

export function sceneCompletions(
  ctx: CompletionContext,
): CompletionResult | null {
  if (!isInsideSceneFence(ctx.state, ctx.pos)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = ctx.state.sliceDoc(line.from, ctx.pos);

  // Primitive skeleton at an array slot: trigger when the cursor is right
  // after `[` or `,` (optionally followed by whitespace/newlines) and the
  // user has typed zero or more word characters. Inserts a full JSON object.
  // Explicit trigger (Ctrl+Space) always wins even with no word typed.
  const arrayPrefix = sliceBack(ctx.state, ctx.pos, 200);
  const arraySlotMatch = arrayPrefix.match(/[[,]\s*(\w*)$/);
  if (arraySlotMatch && (ctx.explicit || arraySlotMatch[1].length > 0)) {
    const typed = arraySlotMatch[1];
    const options: Completion[] = PRIMITIVE_SNIPPETS.map((s) => ({
      label: s.label,
      detail: s.detail,
      type: "class",
      info: s.snippet,
      apply: s.snippet,
      boost: s.label.toLowerCase().startsWith(typed.toLowerCase()) ? 10 : 0,
    }));
    return {
      from: ctx.pos - typed.length,
      options,
      validFor: /^\w*$/,
    };
  }

  // "type": "|   →  complete to a known primitive type.
  const typeMatch = before.match(/"type"\s*:\s*"([A-Za-z0-9_:-]*)$/);
  if (typeMatch) {
    const existing = typeMatch[1];
    return {
      from: ctx.pos - existing.length,
      options: knownTypes().map((t) => ({
        label: t.name,
        type: "enum",
        detail: "primitive",
        info: t.description,
      })),
      validFor: /^[A-Za-z0-9_:-]*$/,
    };
  }

  // "<enum-field>": "|   →  closed-set values.
  const enumMatch = before.match(/"(\w+)"\s*:\s*"([A-Za-z0-9_-]*)$/);
  if (enumMatch) {
    const field = enumMatch[1];
    const existing = enumMatch[2];
    const values = ENUM_FIELDS[field];
    if (values) {
      return {
        from: ctx.pos - existing.length,
        options: values.map((v) => ({ label: v, type: "enum" })),
        validFor: /^[A-Za-z0-9_-]*$/,
      };
    }
  }

  // "<bool-field>": <partial>   →  true / false.
  const boolMatch = before.match(/"(\w+)"\s*:\s*(\w*)$/);
  if (boolMatch && BOOL_FIELDS.has(boolMatch[1])) {
    const existing = boolMatch[2];
    return {
      from: ctx.pos - existing.length,
      options: [
        { label: "true", type: "constant" },
        { label: "false", type: "constant" },
      ],
      validFor: /^(t(r(u(e)?)?)?|f(a(l(s(e)?)?)?)?)?$/,
    };
  }

  // New property key — match `,\s*"<partial>` or `{\s*"<partial>` or
  // `\n\s*"<partial>` (the comma or opening brace could be on a previous
  // line, so also check the line start).
  const keyMatch = before.match(/[,{\n]\s*"(\w*)$/) ?? before.match(/^\s*"(\w*)$/);
  if (keyMatch) {
    const existing = keyMatch[1];
    return {
      from: ctx.pos - existing.length,
      options: COMMON_KEYS.map((k) => ({
        label: k,
        type: "property",
      })),
      validFor: /^\w*$/,
    };
  }

  return null;
}

/**
 * Hover tooltip: over a `"type": "<name>"` value, show a one-line description
 * of what that primitive does. Sources from CORE_TYPES + the plugin registry.
 */
export const typeHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const col = pos - line.from;
  const re = /"type"\s*:\s*"([A-Za-z0-9_:-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text)) !== null) {
    const nameIdx = m[0].indexOf(m[1], m[0].indexOf(":"));
    const start = m.index + nameIdx;
    const end = start + m[1].length;
    if (col >= start && col <= end) {
      const name = m[1];
      const core = CORE_TYPES.find((t) => t.name === name);
      const plugin = !core ? listPlugins().find((p) => p.type === name) : null;
      const description = core?.description ?? plugin?.description;
      if (!description) return null;
      return {
        pos: line.from + start,
        end: line.from + end,
        create() {
          const dom = document.createElement("div");
          dom.className = "tb-type-hover";
          dom.style.cssText = [
            "padding: 6px 10px",
            "max-width: 360px",
            "background: #18181b",
            "color: #e4e4e7",
            "font-size: 12px",
            "line-height: 1.4",
            "border-radius: 4px",
            "box-shadow: 0 2px 8px rgba(0,0,0,0.3)",
          ].join(";");
          const b = document.createElement("strong");
          b.textContent = name;
          b.style.color = "#60a5fa";
          dom.appendChild(b);
          dom.appendChild(document.createTextNode(" — " + description));
          return { dom };
        },
      };
    }
  }
  return null;
});
