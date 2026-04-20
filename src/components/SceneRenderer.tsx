import type { Scene, ScenePrimitive } from "../types";

type Props = { scene: Scene };

export default function SceneRenderer({ scene }: Props) {
  return (
    <svg viewBox="0 0 800 500" className="h-full w-full">
      {scene.primitives.map((p, i) => (
        <Primitive key={i} p={p} />
      ))}
    </svg>
  );
}

function Primitive({ p }: { p: ScenePrimitive }) {
  if (p.type === "grid") {
    const values = p.values;
    const highlight = new Set(p.highlight ?? []);
    const cell = 60;
    const startX = 400 - (values.length * cell) / 2;
    return (
      <g>
        {values.map((v, i) => (
          <g key={i} transform={`translate(${startX + i * cell}, 220)`}>
            <rect
              width={cell - 4}
              height={cell - 4}
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
          </g>
        ))}
      </g>
    );
  }
  if (p.type === "label") {
    return (
      <text x={p.x} y={p.y} fontSize={16} fill="currentColor">
        {p.text}
      </text>
    );
  }
  return null;
}
