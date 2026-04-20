import { motion } from "framer-motion";
import type { TeachbookPlugin } from "../types";

type BlochPrimitive = {
  type: "bloch";
  /** Polar angle from |0⟩ axis (the z axis). 0 = |0⟩, π = |1⟩. Radians. */
  theta: number;
  /** Azimuthal angle around the z axis. 0 = +x (|+⟩). Radians. */
  phi: number;
  /** Optional label shown next to the state point (e.g. "|ψ⟩", "|+⟩"). */
  label?: string;
  /** Sphere radius in viewBox px. Default 150. */
  radius?: number;
  /** Sphere center. Defaults to (400, 250). */
  x?: number;
  y?: number;
  /** Draw the pole and equator labels. Default true. */
  showAxes?: boolean;
  /** Visual tilt around the x-axis so the equator shows as an ellipse, giving
   *  a 3D feel. Radians. Default 0.38 (≈ 22°). */
  tilt?: number;
  /** Trail of previous states rendered as faded points. Each entry is (theta, phi). */
  trail?: [number, number][];
};

const TWEEN = { type: "tween", duration: 0.5, ease: "easeInOut" } as const;

function project(
  theta: number,
  phi: number,
  tilt: number,
  r: number,
): { x: number; y: number; depth: number } {
  // Sphere-space point
  const x3 = Math.sin(theta) * Math.cos(phi);
  const y3 = Math.sin(theta) * Math.sin(phi);
  const z3 = Math.cos(theta);
  // Rotate around x axis by `tilt` so equator tilts toward viewer
  const y2 = y3 * Math.cos(tilt) - z3 * Math.sin(tilt);
  const z2 = y3 * Math.sin(tilt) + z3 * Math.cos(tilt);
  // Orthographic projection: screen x = sphere x, screen y = -z (screen y down)
  return { x: x3 * r, y: -z2 * r, depth: y2 };
}

export const blochPlugin: TeachbookPlugin = {
  type: "bloch",
  category: "quantum",
  description:
    "Bloch sphere: single-qubit state as a point on the unit sphere. Standard states at poles and equator.",
  schemaDoc: `bloch: {
    type: "bloch",
    theta, phi,     // spherical coords (radians). theta from |0⟩ axis; phi around z.
    label?,         // e.g. "|+⟩", "|ψ⟩"
    radius?,        // default 150
    x?, y?,         // center. default (400, 250)
    showAxes?,      // pole and equator labels. default true
    tilt?,          // x-axis rotation for 3D feel. default 0.38 rad
    trail?: [[theta, phi], ...]   // previous states as faded points
  }
  // Canonical states: |0⟩=(0, 0), |1⟩=(π, 0), |+⟩=(π/2, 0), |-⟩=(π/2, π),
  // |+i⟩=(π/2, π/2), |-i⟩=(π/2, 3π/2). Use trail to show rotation history
  // when a gate is applied step by step.`,

  render: (primitive) => {
    const p = primitive as unknown as BlochPrimitive;
    if (typeof p.theta !== "number" || typeof p.phi !== "number") {
      return (
        <text x={10} y={20} fontSize={12} fill="#b91c1c">
          bloch: theta and phi required (radians)
        </text>
      );
    }
    const r = p.radius ?? 150;
    const cx = p.x ?? 400;
    const cy = p.y ?? 250;
    const tilt = p.tilt ?? 0.38;
    const showAxes = p.showAxes ?? true;
    const equatorYRadius = r * Math.sin(tilt);

    // Poles on screen
    const top = project(0, 0, tilt, r);
    const bottom = project(Math.PI, 0, tilt, r);
    // Equator cardinal points
    const east = project(Math.PI / 2, 0, tilt, r);
    const west = project(Math.PI / 2, Math.PI, tilt, r);
    const front = project(Math.PI / 2, Math.PI / 2, tilt, r);
    const back = project(Math.PI / 2, -Math.PI / 2, tilt, r);

    const state = project(p.theta, p.phi, tilt, r);

    return (
      <g transform={`translate(${cx}, ${cy})`}>
        {/* Sphere outline */}
        <circle cx={0} cy={0} r={r} fill="#fafafa" fillOpacity={0.4} stroke="#3f3f46" strokeWidth={1.5} />

        {/* Equator: ellipse foreshortened by tilt */}
        <ellipse
          cx={0}
          cy={0}
          rx={r}
          ry={equatorYRadius}
          fill="none"
          stroke="#71717a"
          strokeWidth={1}
          strokeDasharray="3,3"
        />

        {/* Z axis (|0⟩ at top, |1⟩ at bottom) */}
        <line
          x1={top.x}
          y1={top.y}
          x2={bottom.x}
          y2={bottom.y}
          stroke="#71717a"
          strokeWidth={0.8}
        />
        {/* X axis (|+⟩ right, |-⟩ left) */}
        <line
          x1={west.x}
          y1={west.y}
          x2={east.x}
          y2={east.y}
          stroke="#71717a"
          strokeWidth={0.8}
        />
        {/* Y axis (projected) — front-facing half solid, back-facing dashed */}
        <line
          x1={0}
          y1={0}
          x2={front.x}
          y2={front.y}
          stroke="#71717a"
          strokeWidth={0.8}
        />
        <line
          x1={0}
          y1={0}
          x2={back.x}
          y2={back.y}
          stroke="#71717a"
          strokeWidth={0.8}
          strokeDasharray="2,3"
          opacity={0.7}
        />

        {showAxes && (
          <g fontSize={12} fontWeight={600} fill="#27272a">
            <text x={top.x + 6} y={top.y - 2}>|0⟩</text>
            <text x={bottom.x + 6} y={bottom.y + 14}>|1⟩</text>
            <text x={east.x + 6} y={east.y + 4}>|+⟩</text>
            <text x={west.x - 28} y={west.y + 4}>|-⟩</text>
            <text x={front.x + 4} y={front.y + 4} fontSize={10} opacity={0.7}>|+i⟩</text>
          </g>
        )}

        {/* Trail */}
        {p.trail?.map(([t, ph], i) => {
          const pt = project(t, ph, tilt, r);
          return (
            <circle
              key={`trail-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={3}
              fill="#60a5fa"
              opacity={0.35}
            />
          );
        })}

        {/* State vector */}
        <motion.line
          animate={{ x2: state.x, y2: state.y }}
          initial={{ x2: state.x, y2: state.y }}
          transition={TWEEN}
          x1={0}
          y1={0}
          stroke="#2563eb"
          strokeWidth={2.5}
          markerEnd="url(#bloch-arrow)"
        />

        <defs>
          <marker
            id="bloch-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="#2563eb" />
          </marker>
        </defs>

        {/* State point */}
        <motion.circle
          animate={{ cx: state.x, cy: state.y }}
          initial={{ cx: state.x, cy: state.y }}
          transition={TWEEN}
          r={6}
          fill="#2563eb"
          stroke="#1e3a8a"
          strokeWidth={1.5}
        />

        {/* State label */}
        {p.label && (
          <motion.text
            animate={{ x: state.x + 12, y: state.y - 8 }}
            initial={{ x: state.x + 12, y: state.y - 8 }}
            transition={TWEEN}
            fontSize={14}
            fontWeight={700}
            fill="#1e3a8a"
          >
            {p.label}
          </motion.text>
        )}
      </g>
    );
  },
};
