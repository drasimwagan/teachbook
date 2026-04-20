import { motion } from "framer-motion";
import type { TeachbookPlugin } from "../types";

type HeatmapPrimitive = {
  type: "heatmap";
  values: number[][];
  x?: number;
  y?: number;
  cellSize?: number;
  colormap?: "grayscale" | "diverging" | "sequential";
  vmin?: number;
  vmax?: number;
  /** Rectangles overlaid on the grid: [row, col, height, width]. */
  highlight?: [number, number, number, number][];
  showValues?: boolean;
  label?: string;
};

const TWEEN = { type: "tween", duration: 0.35, ease: "easeOut" } as const;

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function colorFor(
  v: number,
  colormap: HeatmapPrimitive["colormap"],
  vmin: number,
  vmax: number,
): string {
  if (colormap === "diverging") {
    // v in [vmin, vmax], center at 0. Negative → red, positive → blue.
    const span = Math.max(Math.abs(vmin), Math.abs(vmax)) || 1;
    const t = v / span;
    if (t >= 0) {
      const m = clamp01(t);
      const r = 255 - Math.round(m * (255 - 37));
      const g = 255 - Math.round(m * (255 - 99));
      const b = 255 - Math.round(m * (255 - 235));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const m = clamp01(-t);
      const r = 255;
      const g = 255 - Math.round(m * 255);
      const b = 255 - Math.round(m * 255);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  if (colormap === "sequential") {
    // White → indigo
    const t = clamp01((v - vmin) / (vmax - vmin || 1));
    const r = 255 - Math.round(t * (255 - 67));
    const g = 255 - Math.round(t * (255 - 56));
    const b = 255 - Math.round(t * (255 - 202));
    return `rgb(${r}, ${g}, ${b})`;
  }
  // grayscale (default)
  const t = clamp01((v - vmin) / (vmax - vmin || 1));
  const c = Math.round(t * 255);
  return `rgb(${c}, ${c}, ${c})`;
}

function pickTextColor(cellColor: string): string {
  // Parse rgb(r, g, b) and pick black/white for contrast.
  const m = cellColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return "#0a0a0a";
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.55 ? "#0a0a0a" : "#fafafa";
}

export const heatmapPlugin: TeachbookPlugin = {
  type: "heatmap",
  category: "machine-learning",
  description:
    "2D colored grid for images, kernels, attention maps, or any scalar field. Supports kernel-window overlays.",
  schemaDoc: `heatmap: {
    type: "heatmap",
    values: [[...], ...],          // 2D array of numbers
    x?, y?, cellSize?, label?,
    colormap?: "grayscale"|"diverging"|"sequential"  // default grayscale
    vmin?, vmax?,                  // color range. default: grayscale 0→1, diverging symmetric
    highlight?: [[row, col, h, w], ...],   // overlay rects (kernel window, ROI, etc.)
    showValues?: boolean           // render numeric value in each cell
  }
  // Use "grayscale" for intensity images, "diverging" for signed values
  // (weights, filter responses), "sequential" for 0..N magnitudes.
  // Kernel-window overlays use highlight rects to show what the current
  // operation is looking at.`,

  render: (primitive) => {
    const p = primitive as unknown as HeatmapPrimitive;
    const values = p.values;
    if (!Array.isArray(values) || values.length === 0) {
      return (
        <text x={10} y={20} fontSize={12} fill="#b91c1c">
          heatmap: missing values[][]
        </text>
      );
    }
    const nRows = values.length;
    const nCols = values[0]?.length ?? 0;
    const cell = p.cellSize ?? 36;
    const colormap = p.colormap ?? "grayscale";

    // Infer defaults if vmin/vmax not provided.
    let vmin = p.vmin;
    let vmax = p.vmax;
    if (vmin == null || vmax == null) {
      if (colormap === "diverging") {
        let max = 0;
        for (const row of values) for (const v of row) if (Math.abs(v) > max) max = Math.abs(v);
        max = max || 1;
        vmin = vmin ?? -max;
        vmax = vmax ?? max;
      } else {
        let mn = Infinity;
        let mx = -Infinity;
        for (const row of values) for (const v of row) {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (mn === Infinity) {
          mn = 0;
          mx = 1;
        }
        vmin = vmin ?? mn;
        vmax = vmax ?? (mx === mn ? mx + 1 : mx);
      }
    }

    const ox = p.x ?? 400 - (nCols * cell) / 2;
    const oy = p.y ?? 250 - (nRows * cell) / 2;
    const textSize = Math.max(9, Math.round(cell * 0.3));

    return (
      <g>
        {p.label && (
          <text x={ox} y={oy - 6} fontSize={12} fontWeight={600} fill="currentColor">
            {p.label}
          </text>
        )}
        {values.map((row, r) =>
          row.map((v, c) => {
            const fill = colorFor(v, colormap, vmin!, vmax!);
            const textFill = pickTextColor(fill);
            return (
              <g key={`${r}-${c}`} transform={`translate(${ox + c * cell}, ${oy + r * cell})`}>
                <motion.rect
                  width={cell}
                  height={cell}
                  animate={{ fill }}
                  transition={TWEEN}
                  stroke="#52525b"
                  strokeWidth={0.5}
                />
                {p.showValues && (
                  <text
                    x={cell / 2}
                    y={cell / 2 + textSize * 0.35}
                    textAnchor="middle"
                    fontSize={textSize}
                    fill={textFill}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                  >
                    {Number.isInteger(v) ? String(v) : v.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })
        )}
        {p.highlight?.map(([r, c, hh, ww], i) => (
          <motion.rect
            key={`hl-${i}`}
            animate={{
              x: ox + c * cell,
              y: oy + r * cell,
              width: ww * cell,
              height: hh * cell,
            }}
            transition={TWEEN}
            fill="none"
            stroke="#eab308"
            strokeWidth={3}
            rx={2}
          />
        ))}
      </g>
    );
  },
};
