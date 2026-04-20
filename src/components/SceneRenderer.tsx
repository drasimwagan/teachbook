import type {
  ArrowPrimitive,
  AxesPrimitive,
  GraphPrimitive,
  GridPrimitive,
  LabelPrimitive,
  PlotPrimitive,
  Scene,
  ScenePrimitive,
  ShapePrimitive,
} from "../types";

type Props = { scene: Scene };

const VIEW_W = 800;
const VIEW_H = 500;

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
        <Primitive key={i} p={p} axes={axes} />
      ))}
    </svg>
  );
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
    default:
      // plugin or unknown — render a placeholder tag
      return (
        <text x={10} y={20} fontSize={12} fill="#b91c1c">
          unknown primitive: {String(p.type)}
        </text>
      );
  }
}

function Grid({ p }: { p: GridPrimitive }) {
  const highlight = new Set(p.highlight ?? []);
  const cell = 60;
  const startX = VIEW_W / 2 - (p.values.length * cell) / 2;
  return (
    <g>
      {p.values.map((v, i) => (
        <g key={i} transform={`translate(${startX + i * cell}, ${VIEW_H / 2 - 30})`}>
          <rect
            width={cell - 4}
            height={cell - 4}
            rx={4}
            fill={highlight.has(i) ? "#fde68a" : "#e5e7eb"}
            stroke="#52525b"
            strokeWidth={1}
          />
          <text
            x={(cell - 4) / 2}
            y={(cell - 4) / 2 + 6}
            textAnchor="middle"
            fontSize={20}
            fill="#18181b"
          >
            {String(v)}
          </text>
          <text
            x={(cell - 4) / 2}
            y={-6}
            textAnchor="middle"
            fontSize={10}
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
    return <circle cx={x} cy={y} r={p.radius ?? 20} fill={fill} stroke={stroke} />;
  }
  if (p.shape === "rect") {
    const w = p.width ?? 40;
    const h = p.height ?? 40;
    return (
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={fill} stroke={stroke} />
    );
  }
  // polygon fallback: treat as regular pentagon
  const r = p.radius ?? 25;
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / 5;
    return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} stroke={stroke} />;
}

function Arrow({ p, axes }: { p: ArrowPrimitive; axes: AxisCtx }) {
  const [x1, y1] = project(axes, p.from[0], p.from[1]);
  const [x2, y2] = project(axes, p.to[0], p.to[1]);
  return (
    <g className="text-zinc-700 dark:text-zinc-200">
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={2}
        markerEnd="url(#arrowhead)"
      />
      {p.label && (
        <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6} fontSize={12} fill="currentColor">
          {p.label}
        </text>
      )}
    </g>
  );
}

function Label({ p, axes }: { p: LabelPrimitive; axes: AxisCtx }) {
  const [x, y] = project(axes, p.x, p.y);
  return (
    <text x={x} y={y} fontSize={14} fill="currentColor" className="text-zinc-800 dark:text-zinc-100">
      {p.text}
    </text>
  );
}

function Axes({ p }: { p: AxesPrimitive }) {
  const pad = 60;
  const [ox, oy] = project(p, 0, 0);
  const [, yTopPx] = project(p, 0, p.yMax);
  const [xRightPx] = project(p, p.xMax, 0);
  return (
    <g className="text-zinc-400">
      {/* x axis */}
      <line
        x1={pad}
        y1={oy}
        x2={VIEW_W - pad}
        y2={oy}
        stroke="currentColor"
        strokeWidth={1}
      />
      {/* y axis */}
      <line
        x1={ox}
        y1={VIEW_H - pad}
        x2={ox}
        y2={pad}
        stroke="currentColor"
        strokeWidth={1}
      />
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
      <path d={d} fill="none" stroke="#2563eb" strokeWidth={2} />
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

function Graph({ p }: { p: GraphPrimitive }) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  // Assume node coords are in viewBox space directly for simplicity
  return (
    <g>
      {p.edges.map(([a, b], i) => {
        const na = byId.get(a);
        const nb = byId.get(b);
        if (!na || !nb) return null;
        return (
          <line
            key={i}
            x1={na.x}
            y1={na.y}
            x2={nb.x}
            y2={nb.y}
            stroke="#71717a"
            strokeWidth={1.5}
          />
        );
      })}
      {p.nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
          <circle r={18} fill="#a5b4fc" stroke="#3730a3" strokeWidth={1.5} />
          <text textAnchor="middle" y={5} fontSize={12} fill="#1e1b4b">
            {n.label ?? n.id}
          </text>
        </g>
      ))}
    </g>
  );
}
