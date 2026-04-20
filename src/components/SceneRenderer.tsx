import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { getPlugin } from "../plugins";
// Side-effect import so plugins self-register on first load.
import "../plugins";
import type {
  ArrowPrimitive,
  AxesPrimitive,
  GraphEdgeObject,
  GraphPrimitive,
  GridPrimitive,
  LabelPrimitive,
  MatrixPrimitive,
  PlotPrimitive,
  Scene,
  ScenePrimitive,
  ShapePrimitive,
} from "../types";

// katex + its CSS weigh ~150KB gzip. Only pay for it when a scene actually
// has `latex: true` labels.
const MathLabel = lazy(() => import("./MathLabel"));

type Props = { scene: Scene };

const VIEW_W = 800;
const VIEW_H = 500;

const TWEEN = { type: "tween", duration: 0.35, ease: "easeOut" } as const;

export default function SceneRenderer({ scene }: Props) {
  const axes = scene.primitives.find((p): p is AxesPrimitive => p.type === "axes");
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-full w-full max-h-full max-w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
        </marker>
      </defs>
      {scene.primitives.map((p, i) => (
        <Primitive key={primitiveKey(p, i)} p={p} axes={axes} />
      ))}
    </svg>
  );
}

function primitiveKey(p: ScenePrimitive, fallbackIndex: number): string {
  if ("id" in p && p.id) return `${p.type}:${p.id}`;
  return `${p.type}:${fallbackIndex}`;
}

type AxisCtx = AxesPrimitive | undefined;

function project(axes: AxisCtx, x: number, y: number): [number, number] {
  if (!axes) return [x, y];
  const padding = 60;
  const w = VIEW_W - padding * 2;
  const h = VIEW_H - padding * 2;
  const px = padding + ((x - axes.xMin) / (axes.xMax - axes.xMin)) * w;
  const py = VIEW_H - padding - ((y - axes.yMin) / (axes.yMax - axes.yMin)) * h;
  return [px, py];
}

function Primitive({ p, axes }: { p: ScenePrimitive; axes: AxisCtx }) {
  switch (p.type) {
    case "grid":
      return <Grid p={p} />;
    case "shape":
      return <Shape p={p} axes={axes} />;
    case "arrow":
      return <Arrow p={p} axes={axes} />;
    case "label":
      return <Label p={p} axes={axes} />;
    case "axes":
      return <Axes p={p} />;
    case "plot":
      return <Plot p={p} axes={axes} />;
    case "graph":
      return <Graph p={p} />;
    case "matrix":
      return <Matrix p={p} />;
    default: {
      // Fall through to plugin registry for extensible domains.
      const plugin = getPlugin(p.type);
      if (plugin) {
        return plugin.render(p as { type: string; [k: string]: unknown }, {
          axes,
          viewW: VIEW_W,
          viewH: VIEW_H,
          project: (x: number, y: number) => project(axes, x, y),
        });
      }
      return (
        <text x={10} y={20} fontSize={12} fill="#b91c1c">
          unknown primitive: {String(p.type)}
        </text>
      );
    }
  }
}

function Grid({ p }: { p: GridPrimitive }) {
  const highlight = new Set(p.highlight ?? []);
  const cell = p.cellSize ?? 60;
  const defaultX = VIEW_W / 2 - (p.values.length * cell) / 2;
  const defaultY = VIEW_H / 2 - cell / 2;
  const startX = p.x ?? defaultX;
  const gridY = p.y ?? defaultY;
  const textSize = Math.max(10, Math.round(cell * 0.35));
  const gap = Math.max(2, Math.round(cell * 0.08));
  const inner = cell - gap;
  return (
    <g>
      {p.label && (
        <text
          x={startX}
          y={gridY - cell * 0.36}
          fontSize={12}
          fontWeight={600}
          fill="currentColor"
          className="text-zinc-700 dark:text-zinc-300"
        >
          {p.label}
        </text>
      )}
      {p.values.map((v, i) => (
        <g key={i} transform={`translate(${startX + i * cell}, ${gridY})`}>
          <motion.rect
            width={inner}
            height={inner}
            rx={4}
            stroke="#52525b"
            strokeWidth={1}
            animate={{ fill: highlight.has(i) ? "#fde68a" : "#e5e7eb" }}
            transition={TWEEN}
          />
          <text
            x={inner / 2}
            y={inner / 2 + textSize * 0.35}
            textAnchor="middle"
            fontSize={textSize}
            fill="#18181b"
          >
            {String(v)}
          </text>
          <text
            x={inner / 2}
            y={-4}
            textAnchor="middle"
            fontSize={Math.max(9, Math.round(cell * 0.16))}
            fill="#71717a"
          >
            {i}
          </text>
        </g>
      ))}
    </g>
  );
}

function Shape({ p, axes }: { p: ShapePrimitive; axes: AxisCtx }) {
  const [x, y] = project(axes, p.x, p.y);
  const fill = p.fill ?? "#60a5fa";
  const stroke = p.stroke ?? "#1e3a8a";
  if (p.shape === "circle") {
    return (
      <motion.circle
        animate={{ cx: x, cy: y }}
        transition={TWEEN}
        r={p.radius ?? 20}
        fill={fill}
        stroke={stroke}
      />
    );
  }
  if (p.shape === "rect") {
    const w = p.width ?? 40;
    const h = p.height ?? 40;
    return (
      <motion.rect
        animate={{ x: x - w / 2, y: y - h / 2 }}
        transition={TWEEN}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
      />
    );
  }
  // polygon fallback: regular pentagon (no tween on the vertex positions)
  const r = p.radius ?? 25;
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} stroke={stroke} />;
}

function Arrow({ p, axes }: { p: ArrowPrimitive; axes: AxisCtx }) {
  const [x1, y1] = project(axes, p.from[0], p.from[1]);
  const [x2, y2] = project(axes, p.to[0], p.to[1]);
  return (
    <g className="text-zinc-700 dark:text-zinc-200">
      <motion.line
        animate={{ x1, y1, x2, y2 }}
        transition={TWEEN}
        stroke="currentColor"
        strokeWidth={2}
        markerEnd="url(#arrowhead)"
      />
      {p.label && (
        <motion.text
          animate={{ x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2 - 6 }}
          transition={TWEEN}
          fontSize={12}
          fill="currentColor"
        >
          {p.label}
        </motion.text>
      )}
    </g>
  );
}

function Label({ p, axes }: { p: LabelPrimitive; axes: AxisCtx }) {
  const [x, y] = project(axes, p.x, p.y);

  if (p.latex) {
    return (
      <Suspense
        fallback={
          <motion.text
            animate={{ x, y }}
            transition={TWEEN}
            fontSize={14}
            fill="currentColor"
          >
            {p.text}
          </motion.text>
        }
      >
        <MathLabel text={p.text} x={x} y={y} />
      </Suspense>
    );
  }

  return (
    <motion.text
      animate={{ x, y }}
      transition={TWEEN}
      fontSize={14}
      fill="currentColor"
      className="text-zinc-800 dark:text-zinc-100"
    >
      {p.text}
    </motion.text>
  );
}

function Axes({ p }: { p: AxesPrimitive }) {
  const pad = 60;
  const [ox, oy] = project(p, 0, 0);
  const [, yTopPx] = project(p, 0, p.yMax);
  const [xRightPx] = project(p, p.xMax, 0);
  return (
    <g className="text-zinc-400">
      <line x1={pad} y1={oy} x2={VIEW_W - pad} y2={oy} stroke="currentColor" strokeWidth={1} />
      <line x1={ox} y1={VIEW_H - pad} x2={ox} y2={pad} stroke="currentColor" strokeWidth={1} />
      <text x={xRightPx + 4} y={oy + 4} fontSize={11} fill="currentColor">
        x
      </text>
      <text x={ox + 4} y={yTopPx - 4} fontSize={11} fill="currentColor">
        y
      </text>
    </g>
  );
}

function Plot({ p, axes }: { p: PlotPrimitive; axes: AxisCtx }) {
  if (p.points.length === 0) return null;
  const d = p.points
    .map(([x, y], i) => {
      const [px, py] = project(axes, x, y);
      return `${i === 0 ? "M" : "L"} ${px} ${py}`;
    })
    .join(" ");
  return (
    <g>
      <motion.path
        animate={{ d }}
        transition={TWEEN}
        fill="none"
        stroke="#2563eb"
        strokeWidth={2}
      />
      {p.points.map(([x, y], i) => {
        const [px, py] = project(axes, x, y);
        return <circle key={i} cx={px} cy={py} r={3} fill="#2563eb" />;
      })}
      {p.label && (
        <text
          x={project(axes, p.points[0][0], p.points[0][1])[0] + 8}
          y={project(axes, p.points[0][0], p.points[0][1])[1] - 8}
          fontSize={12}
          fill="#2563eb"
        >
          {p.label}
        </text>
      )}
    </g>
  );
}

function normalizeEdge(e: GraphPrimitive["edges"][number]): GraphEdgeObject {
  return Array.isArray(e) ? { from: e[0], to: e[1] } : e;
}

const NODE_R = 20;

function Graph({ p }: { p: GraphPrimitive }) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const graphDirected = !!p.directed;
  const edges = p.edges.map(normalizeEdge);

  return (
    <g>
      <defs>
        <marker
          id="graph-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#71717a" />
        </marker>
        <marker
          id="graph-arrow-hl"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#eab308" />
        </marker>
      </defs>

      {edges.map((e, i) => {
        const na = byId.get(e.from);
        const nb = byId.get(e.to);
        if (!na || !nb) return null;
        const directed = e.directed ?? graphDirected;
        const stroke = e.highlight ? "#eab308" : "#71717a";
        const width = e.highlight ? 3 : 1.5;

        // Shorten the line so the arrowhead doesn't overlap the node circle.
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const shrink = directed ? NODE_R + 4 : 0;
        const x1 = na.x + ux * (directed ? NODE_R : 0);
        const y1 = na.y + uy * (directed ? NODE_R : 0);
        const x2 = nb.x - ux * shrink;
        const y2 = nb.y - uy * shrink;

        const mx = (na.x + nb.x) / 2;
        const my = (na.y + nb.y) / 2;

        return (
          <g key={i}>
            <motion.line
              animate={{ x1, y1, x2, y2, stroke, strokeWidth: width }}
              transition={TWEEN}
              markerEnd={directed ? (e.highlight ? "url(#graph-arrow-hl)" : "url(#graph-arrow)") : undefined}
            />
            {e.weight !== undefined && (
              <g transform={`translate(${mx}, ${my})`}>
                <rect
                  x={-14}
                  y={-9}
                  width={28}
                  height={16}
                  rx={3}
                  fill={e.highlight ? "#fef3c7" : "#fafafa"}
                  stroke={e.highlight ? "#ca8a04" : "#d4d4d8"}
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={e.highlight ? "#854d0e" : "#3f3f46"}
                >
                  {String(e.weight)}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {p.nodes.map((n) => {
        const fill = n.fill ?? (n.highlight ? "#fde68a" : "#a5b4fc");
        const stroke = n.highlight ? "#ca8a04" : "#3730a3";
        const strokeWidth = n.highlight ? 3 : 1.5;
        return (
          <motion.g key={n.id} animate={{ x: n.x, y: n.y }} transition={TWEEN}>
            <motion.circle
              r={NODE_R}
              animate={{ fill, stroke, strokeWidth }}
              transition={TWEEN}
            />
            <text textAnchor="middle" y={5} fontSize={13} fontWeight={n.highlight ? 700 : 500} fill="#1e1b4b">
              {n.label ?? n.id}
            </text>
          </motion.g>
        );
      })}
    </g>
  );
}

function Matrix({ p }: { p: MatrixPrimitive }) {
  const cell = p.cellSize ?? 44;
  const rows = p.rows;
  const nRows = rows.length;
  const nCols = nRows > 0 ? rows[0].length : 0;
  if (nRows === 0 || nCols === 0) return null;

  const labelWidth = p.rowLabels ? cell * 0.8 : 0;
  const labelHeight = p.colLabels ? cell * 0.55 : 0;

  const defaultX = VIEW_W / 2 - (nCols * cell) / 2 - labelWidth / 2;
  const defaultY = VIEW_H / 2 - (nRows * cell) / 2 - labelHeight / 2;
  const startX = p.x ?? defaultX;
  const startY = p.y ?? defaultY;

  const gridX = startX + labelWidth;
  const gridY = startY + labelHeight;

  const highlightSet = new Set((p.highlight ?? []).map(([r, c]) => `${r},${c}`));
  const textSize = Math.max(10, Math.round(cell * 0.38));
  const gap = Math.max(1, Math.round(cell * 0.04));
  const inner = cell - gap;

  return (
    <g>
      {p.label && (
        <text
          x={startX}
          y={startY - cell * 0.2}
          fontSize={12}
          fontWeight={600}
          fill="currentColor"
          className="text-zinc-700 dark:text-zinc-300"
        >
          {p.label}
        </text>
      )}

      {p.colLabels?.map((lab, c) => (
        <text
          key={`col-${c}`}
          x={gridX + c * cell + inner / 2}
          y={gridY - 6}
          textAnchor="middle"
          fontSize={Math.max(10, Math.round(cell * 0.28))}
          fill="#71717a"
        >
          {lab}
        </text>
      ))}

      {p.rowLabels?.map((lab, r) => (
        <text
          key={`row-${r}`}
          x={gridX - 6}
          y={gridY + r * cell + inner / 2 + textSize * 0.35}
          textAnchor="end"
          fontSize={Math.max(10, Math.round(cell * 0.28))}
          fill="#71717a"
        >
          {lab}
        </text>
      ))}

      {rows.map((row, r) =>
        row.map((v, c) => {
          const hl = highlightSet.has(`${r},${c}`);
          return (
            <g key={`${r}-${c}`} transform={`translate(${gridX + c * cell}, ${gridY + r * cell})`}>
              <motion.rect
                width={inner}
                height={inner}
                rx={3}
                stroke="#52525b"
                strokeWidth={hl ? 2 : 1}
                animate={{ fill: hl ? "#fde68a" : "#e5e7eb" }}
                transition={TWEEN}
              />
              <text
                x={inner / 2}
                y={inner / 2 + textSize * 0.35}
                textAnchor="middle"
                fontSize={textSize}
                fill="#18181b"
              >
                {String(v)}
              </text>
            </g>
          );
        })
      )}
    </g>
  );
}
