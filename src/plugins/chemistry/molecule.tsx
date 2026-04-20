import { motion } from "framer-motion";
import type { TeachbookPlugin } from "../types";

type Atom = {
  id: string;
  element: string;
  x: number;
  y: number;
};

type Bond = {
  from: string;
  to: string;
  /** 1 = single, 2 = double, 3 = triple. Default 1. */
  order?: 1 | 2 | 3;
};

type MoleculePrimitive = {
  type: "molecule";
  atoms: Atom[];
  bonds: Bond[];
  /** Optional caption rendered above the molecule. */
  label?: string;
  /** Scale factor. atoms' (x, y) are multiplied by this to stretch the
   *  structure. Default 1 (coords are in viewBox pixels). */
  scale?: number;
  /** Origin offset in pixels. Default (400, 250) — viewBox center. */
  ox?: number;
  oy?: number;
};

// CPK-ish color palette, simplified. Missing elements fall back to gray.
const ELEMENT_COLOR: Record<string, string> = {
  H: "#f5f5f4",
  C: "#27272a",
  N: "#2563eb",
  O: "#dc2626",
  F: "#84cc16",
  Cl: "#22c55e",
  Br: "#a16207",
  I: "#7c3aed",
  S: "#eab308",
  P: "#f97316",
  Na: "#a855f7",
  K: "#c084fc",
  Ca: "#94a3b8",
  Fe: "#b45309",
};

const ELEMENT_TEXT_COLOR: Record<string, string> = {
  H: "#18181b",
  C: "#fafafa",
  F: "#0a0a0a",
  S: "#18181b",
};

const TWEEN = { type: "tween", duration: 0.35, ease: "easeOut" } as const;

const TEXT_FALLBACK = "#0a0a0a";
const ATOM_RADIUS = 18;

function Bonds({
  atoms,
  bonds,
}: {
  atoms: Map<string, { cx: number; cy: number }>;
  bonds: Bond[];
}) {
  return (
    <g>
      {bonds.map((b, i) => {
        const a1 = atoms.get(b.from);
        const a2 = atoms.get(b.to);
        if (!a1 || !a2) return null;
        const order = b.order ?? 1;

        // Offset parallel lines for double/triple bonds.
        const dx = a2.cx - a1.cx;
        const dy = a2.cy - a1.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        // Normal perpendicular to the bond axis.
        const nx = -dy / len;
        const ny = dx / len;
        const spacing = 4;

        const offsets =
          order === 1
            ? [0]
            : order === 2
              ? [-spacing, spacing]
              : [-2 * spacing, 0, 2 * spacing];

        // Shrink line endpoints so they don't overlap the atom circles.
        const shrink = ATOM_RADIUS;
        const ux = dx / len;
        const uy = dy / len;
        const sx = a1.cx + ux * shrink;
        const sy = a1.cy + uy * shrink;
        const ex = a2.cx - ux * shrink;
        const ey = a2.cy - uy * shrink;

        return (
          <g key={`${b.from}-${b.to}-${i}`}>
            {offsets.map((o, j) => (
              <motion.line
                key={j}
                animate={{
                  x1: sx + nx * o,
                  y1: sy + ny * o,
                  x2: ex + nx * o,
                  y2: ey + ny * o,
                }}
                transition={TWEEN}
                stroke="#27272a"
                strokeWidth={1.8}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

export const moleculePlugin: TeachbookPlugin = {
  type: "molecule",
  category: "chemistry",
  description:
    "2D molecular structure with CPK-colored atoms and single / double / triple bonds.",
  schemaDoc: `molecule: { type: "molecule", atoms: [{id, element, x, y}, ...], bonds: [{from, to, order?: 1|2|3}, ...], label?, scale?, ox?, oy? }
  // Atoms placed at (ox + x*scale, oy + y*scale) in the 800x500 viewBox.
  // Default ox=400, oy=250, scale=1. For molecules ~3 atoms across, use
  // scale around 35-50 with small integer-ish x/y like -1, 0, 1.
  // Element strings use standard symbols: H, C, N, O, F, Cl, S, P, etc.`,

  render: (primitive) => {
    const p = primitive as unknown as MoleculePrimitive;
    const scale = p.scale ?? 1;
    const ox = p.ox ?? 400;
    const oy = p.oy ?? 250;
    if (!Array.isArray(p.atoms) || !Array.isArray(p.bonds)) {
      return (
        <text x={10} y={20} fontSize={12} fill="#b91c1c">
          molecule: missing atoms[] or bonds[]
        </text>
      );
    }

    const placed = new Map<string, { cx: number; cy: number }>();
    for (const a of p.atoms) {
      placed.set(a.id, { cx: ox + a.x * scale, cy: oy + a.y * scale });
    }

    return (
      <g>
        {p.label && (
          <text x={40} y={40} fontSize={14} fontWeight={600} fill="currentColor">
            {p.label}
          </text>
        )}
        <Bonds atoms={placed} bonds={p.bonds} />
        {p.atoms.map((a) => {
          const pos = placed.get(a.id)!;
          const fill = ELEMENT_COLOR[a.element] ?? "#a1a1aa";
          const textFill =
            ELEMENT_TEXT_COLOR[a.element] ??
            (fill === "#27272a" || fill === "#0a0a0a"
              ? "#fafafa"
              : TEXT_FALLBACK);
          return (
            <motion.g
              key={a.id}
              animate={{ x: pos.cx, y: pos.cy }}
              transition={TWEEN}
            >
              <motion.circle
                r={ATOM_RADIUS}
                animate={{ fill }}
                transition={TWEEN}
                stroke="#3f3f46"
                strokeWidth={1}
              />
              <text
                textAnchor="middle"
                y={5}
                fontSize={14}
                fontWeight={700}
                fill={textFill}
              >
                {a.element}
              </text>
            </motion.g>
          );
        })}
      </g>
    );
  },
};
