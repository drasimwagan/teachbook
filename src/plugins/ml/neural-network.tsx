import { motion } from "framer-motion";
import type { TeachbookPlugin } from "../types";

type Layer = {
  size: number;
  label?: string;
  /** Per-neuron activation values. If present, neurons color by value. */
  activations?: number[];
};

type NNPrimitive = {
  type: "nn";
  layers: Layer[];
  /** weights[L] is a size(L+1) × size(L) matrix. Shown only on highlighted
   *  edges to keep dense diagrams readable. */
  weights?: number[][][];
  /** [fromLayer, fromNeuron, toLayer, toNeuron] — must be consecutive layers. */
  highlightEdges?: [number, number, number, number][];
  /** [layer, neuron] — adds yellow ring. */
  highlightNeurons?: [number, number][];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string;
};

const TWEEN = { type: "tween", duration: 0.35, ease: "easeOut" } as const;
const NEURON_R = 18;

/** Map activation value to fill color. 0 is light, positive blue, negative red. */
function activationColor(v: number | undefined): string {
  if (v == null) return "#e5e7eb";
  const mag = Math.min(1, Math.abs(v));
  const t = Math.round(mag * 255);
  if (v >= 0) {
    // White → blue
    const r = 255 - Math.round(mag * (255 - 37));
    const g = 255 - Math.round(mag * (255 - 99));
    const b = 255 - Math.round(mag * (255 - 235));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // White → red
    const r = 255;
    const g = 255 - t;
    const b = 255 - t;
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function fmtNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) < 10 ? 2 : 1);
}

export const neuralNetworkPlugin: TeachbookPlugin = {
  type: "nn",
  category: "machine-learning",
  description:
    "Neural network diagram with layered neurons, per-neuron activations, and highlightable edges.",
  schemaDoc: `nn: {
    type: "nn",
    layers: [{size, label?, activations?: [...]} ...],
    weights?: [[[w]]]... ,    // weights[L][to][from]; shown only on highlighted edges
    highlightEdges?: [[fromLayer, fromNeuron, toLayer, toNeuron], ...],
    highlightNeurons?: [[layer, neuron], ...],
    x?, y?, width?, height?, label?
  }
  // Layers placed evenly across 'width' (default 600). Neurons colored by
  // activation: blue = positive, red = negative, light gray = unknown.
  // Highlight specific edges/neurons to focus a forward or backward pass step.`,

  render: (primitive) => {
    const p = primitive as unknown as NNPrimitive;
    const layers = p.layers ?? [];
    if (!Array.isArray(layers) || layers.length === 0) {
      return (
        <text x={10} y={20} fontSize={12} fill="#b91c1c">
          nn: missing layers[]
        </text>
      );
    }

    const ox = p.x ?? 80;
    const oy = p.y ?? 80;
    const w = p.width ?? 640;
    const h = p.height ?? 340;

    const layerX = (i: number) =>
      layers.length === 1 ? ox + w / 2 : ox + (i * w) / (layers.length - 1);
    const neuronY = (layerIdx: number, n: number) => {
      const size = layers[layerIdx].size;
      if (size === 1) return oy + h / 2;
      const spacing = h / (size - 1);
      return oy + n * spacing;
    };

    const edgeHL = new Set(
      (p.highlightEdges ?? []).map(([a, b, c, d]) => `${a}-${b}-${c}-${d}`),
    );
    const neuronHL = new Set(
      (p.highlightNeurons ?? []).map(([l, n]) => `${l}-${n}`),
    );

    const edges: React.ReactElement[] = [];
    for (let L = 0; L < layers.length - 1; L++) {
      const from = layers[L];
      const to = layers[L + 1];
      for (let j = 0; j < to.size; j++) {
        for (let i = 0; i < from.size; i++) {
          const key = `${L}-${i}-${L + 1}-${j}`;
          const highlighted = edgeHL.has(key);
          const x1 = layerX(L) + NEURON_R;
          const y1 = neuronY(L, i);
          const x2 = layerX(L + 1) - NEURON_R;
          const y2 = neuronY(L + 1, j);
          edges.push(
            <motion.line
              key={`e-${key}`}
              animate={{
                x1,
                y1,
                x2,
                y2,
                stroke: highlighted ? "#eab308" : "#d4d4d8",
                strokeWidth: highlighted ? 2.5 : 0.7,
              }}
              transition={TWEEN}
            />,
          );
          if (highlighted && p.weights?.[L]?.[j]?.[i] != null) {
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const wv = p.weights[L][j][i];
            edges.push(
              <g
                key={`w-${key}`}
                transform={`translate(${mx}, ${my})`}
              >
                <rect
                  x={-18}
                  y={-9}
                  width={36}
                  height={16}
                  rx={3}
                  fill="#fef3c7"
                  stroke="#ca8a04"
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#854d0e"
                >
                  {fmtNumber(wv)}
                </text>
              </g>,
            );
          }
        }
      }
    }

    return (
      <g>
        {p.label && (
          <text x={ox} y={oy - 22} fontSize={13} fontWeight={600} fill="currentColor">
            {p.label}
          </text>
        )}

        {/* Layer labels */}
        {layers.map((layer, L) =>
          layer.label ? (
            <text
              key={`lab-${L}`}
              x={layerX(L)}
              y={oy + h + 22}
              textAnchor="middle"
              fontSize={11}
              fontWeight={500}
              fill="#52525b"
            >
              {layer.label}
            </text>
          ) : null,
        )}

        {edges}

        {/* Neurons */}
        {layers.map((layer, L) =>
          Array.from({ length: layer.size }, (_, n) => {
            const act = layer.activations?.[n];
            const fill = activationColor(act);
            const highlighted = neuronHL.has(`${L}-${n}`);
            const cx = layerX(L);
            const cy = neuronY(L, n);
            return (
              <motion.g
                key={`n-${L}-${n}`}
                animate={{ x: cx, y: cy }}
                transition={TWEEN}
              >
                <motion.circle
                  r={NEURON_R}
                  animate={{
                    fill,
                    stroke: highlighted ? "#ca8a04" : "#52525b",
                    strokeWidth: highlighted ? 3 : 1,
                  }}
                  transition={TWEEN}
                />
                {act != null && (
                  <text
                    textAnchor="middle"
                    y={4}
                    fontSize={10}
                    fontWeight={600}
                    fill="#0a0a0a"
                  >
                    {fmtNumber(act)}
                  </text>
                )}
              </motion.g>
            );
          }),
        )}
      </g>
    );
  },
};
