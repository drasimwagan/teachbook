import { motion } from "framer-motion";
import type { TeachbookPlugin } from "../types";

type Point = [number, number];

type CircuitElement =
  | { kind: "wire"; from: Point; to: Point }
  | { kind: "resistor"; from: Point; to: Point; label?: string; highlight?: boolean }
  | { kind: "capacitor"; from: Point; to: Point; label?: string; highlight?: boolean }
  | { kind: "inductor"; from: Point; to: Point; label?: string; highlight?: boolean }
  | { kind: "battery"; from: Point; to: Point; label?: string; highlight?: boolean }
  | { kind: "voltage_source"; from: Point; to: Point; label?: string; highlight?: boolean }
  | { kind: "ground"; at: Point; label?: string }
  | { kind: "node"; at: Point; label?: string }
  | { kind: "label"; at: Point; text: string };

type CircuitPrimitive = {
  type: "circuit";
  elements: CircuitElement[];
  label?: string;
};

const TWEEN = { type: "tween", duration: 0.35, ease: "easeOut" } as const;

function unit(from: Point, to: Point): { ux: number; uy: number; nx: number; ny: number; len: number } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Normal (perpendicular, 90° CCW)
  const nx = -uy;
  const ny = ux;
  return { ux, uy, nx, ny, len };
}

function componentStroke(highlight?: boolean): string {
  return highlight ? "#eab308" : "#27272a";
}

function componentStrokeWidth(highlight?: boolean): number {
  return highlight ? 2.8 : 1.8;
}

/** Wire endpoint stubs: short lines from the component's edge to the connection points. */
function renderWireStubs(
  from: Point,
  to: Point,
  bodyLength: number,
  stroke: string,
  strokeWidth: number,
): React.ReactElement {
  const { ux, uy, len } = unit(from, to);
  const stub = (len - bodyLength) / 2;
  const b1x = from[0] + ux * stub;
  const b1y = from[1] + uy * stub;
  const b2x = to[0] - ux * stub;
  const b2y = to[1] - uy * stub;
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={b1x} y2={b1y} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={b2x} y1={b2y} x2={to[0]} y2={to[1]} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}

function midpoint(from: Point, to: Point): Point {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
}

function labelAt(
  from: Point,
  to: Point,
  offset: number,
  text: string,
  highlight?: boolean,
): React.ReactElement {
  const [mx, my] = midpoint(from, to);
  const { nx, ny } = unit(from, to);
  const x = mx + nx * offset;
  const y = my + ny * offset;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
      fill={highlight ? "#854d0e" : "#3f3f46"}
    >
      {text}
    </text>
  );
}

function Resistor({ from, to, label, highlight }: { from: Point; to: Point; label?: string; highlight?: boolean }) {
  const { ux, uy, nx, ny, len } = unit(from, to);
  const bodyLen = Math.min(60, len * 0.6);
  const stub = (len - bodyLen) / 2;
  const stroke = componentStroke(highlight);
  const sw = componentStrokeWidth(highlight);

  // Zig-zag with 6 peaks over bodyLen
  const peaks = 6;
  const peakLen = bodyLen / peaks;
  const peakHeight = 8;
  const startX = from[0] + ux * stub;
  const startY = from[1] + uy * stub;
  let d = `M ${startX} ${startY}`;
  for (let i = 0; i < peaks; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const px = startX + ux * (peakLen * (i + 0.5)) + nx * peakHeight * side;
    const py = startY + uy * (peakLen * (i + 0.5)) + ny * peakHeight * side;
    d += ` L ${px} ${py}`;
  }
  d += ` L ${startX + ux * bodyLen} ${startY + uy * bodyLen}`;

  return (
    <g>
      {renderWireStubs(from, to, bodyLen, stroke, sw)}
      <motion.path animate={{ d }} transition={TWEEN} fill="none" stroke={stroke} strokeWidth={sw} />
      {label && labelAt(from, to, 14, label, highlight)}
    </g>
  );
}

function Capacitor({ from, to, label, highlight }: { from: Point; to: Point; label?: string; highlight?: boolean }) {
  const { ux, uy, nx, ny } = unit(from, to);
  const plateGap = 8; // pixels between plates
  const plateHalf = 14; // half-length of plate
  const stroke = componentStroke(highlight);
  const sw = componentStrokeWidth(highlight);

  const [mx, my] = midpoint(from, to);
  const p1cx = mx - ux * (plateGap / 2);
  const p1cy = my - uy * (plateGap / 2);
  const p2cx = mx + ux * (plateGap / 2);
  const p2cy = my + uy * (plateGap / 2);

  // Plates drawn perpendicular to axis
  const plate1 = [
    p1cx - nx * plateHalf,
    p1cy - ny * plateHalf,
    p1cx + nx * plateHalf,
    p1cy + ny * plateHalf,
  ];
  const plate2 = [
    p2cx - nx * plateHalf,
    p2cy - ny * plateHalf,
    p2cx + nx * plateHalf,
    p2cy + ny * plateHalf,
  ];

  return (
    <g>
      {renderWireStubs(from, to, plateGap, stroke, sw)}
      <line x1={plate1[0]} y1={plate1[1]} x2={plate1[2]} y2={plate1[3]} stroke={stroke} strokeWidth={sw} />
      <line x1={plate2[0]} y1={plate2[1]} x2={plate2[2]} y2={plate2[3]} stroke={stroke} strokeWidth={sw} />
      {label && labelAt(from, to, plateHalf + 8, label, highlight)}
    </g>
  );
}

function Inductor({ from, to, label, highlight }: { from: Point; to: Point; label?: string; highlight?: boolean }) {
  const { ux, uy, len } = unit(from, to);
  const bodyLen = Math.min(60, len * 0.6);
  const stub = (len - bodyLen) / 2;
  const loops = 4;
  const loopLen = bodyLen / loops;
  const loopR = 6;
  const stroke = componentStroke(highlight);
  const sw = componentStrokeWidth(highlight);

  const startX = from[0] + ux * stub;
  const startY = from[1] + uy * stub;
  // Arcs along the component axis. Each loop is a semicircle bulging outward (in +n direction).
  let d = `M ${startX} ${startY}`;
  for (let i = 0; i < loops; i++) {
    // End of this arc
    const ex = startX + ux * (loopLen * (i + 1));
    const ey = startY + uy * (loopLen * (i + 1));
    // Semicircle bulge in the +n direction
    const rx = loopR;
    const ry = loopR;
    const largeArc = 0;
    const sweep = 0;
    d += ` A ${rx} ${ry} 0 ${largeArc} ${sweep} ${ex} ${ey}`;
  }

  return (
    <g>
      {renderWireStubs(from, to, bodyLen, stroke, sw)}
      <path d={d} fill="none" stroke={stroke} strokeWidth={sw} />
      {label && labelAt(from, to, 16, label, highlight)}
    </g>
  );
}

function Battery({ from, to, label, highlight }: { from: Point; to: Point; label?: string; highlight?: boolean }) {
  const { ux, uy, nx, ny } = unit(from, to);
  const plateGap = 8;
  const longHalf = 14;
  const shortHalf = 7;
  const stroke = componentStroke(highlight);
  const sw = componentStrokeWidth(highlight);

  const [mx, my] = midpoint(from, to);
  const p1cx = mx - ux * (plateGap / 2);
  const p1cy = my - uy * (plateGap / 2);
  const p2cx = mx + ux * (plateGap / 2);
  const p2cy = my + uy * (plateGap / 2);

  // Long plate near `from` side (convention: long = + terminal)
  // We'll put long on the "from" side, short on the "to" side — authors can
  // flip from/to to change polarity.
  const longPlate = [
    p1cx - nx * longHalf,
    p1cy - ny * longHalf,
    p1cx + nx * longHalf,
    p1cy + ny * longHalf,
  ];
  const shortPlate = [
    p2cx - nx * shortHalf,
    p2cy - ny * shortHalf,
    p2cx + nx * shortHalf,
    p2cy + ny * shortHalf,
  ];

  return (
    <g>
      {renderWireStubs(from, to, plateGap, stroke, sw)}
      <line x1={longPlate[0]} y1={longPlate[1]} x2={longPlate[2]} y2={longPlate[3]} stroke={stroke} strokeWidth={sw + 0.5} />
      <line x1={shortPlate[0]} y1={shortPlate[1]} x2={shortPlate[2]} y2={shortPlate[3]} stroke={stroke} strokeWidth={sw + 0.5} />
      {/* +/- markers */}
      <text
        x={p1cx + nx * (longHalf + 10)}
        y={p1cy + ny * (longHalf + 10)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={700}
        fill={stroke}
      >
        +
      </text>
      <text
        x={p2cx + nx * (shortHalf + 12)}
        y={p2cy + ny * (shortHalf + 12)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
        fontWeight={700}
        fill={stroke}
      >
        −
      </text>
      {label && labelAt(from, to, longHalf + 24, label, highlight)}
    </g>
  );
}

function VoltageSource({ from, to, label, highlight }: { from: Point; to: Point; label?: string; highlight?: boolean }) {
  const { ux, uy } = unit(from, to);
  const stroke = componentStroke(highlight);
  const sw = componentStrokeWidth(highlight);
  const [mx, my] = midpoint(from, to);
  const r = 16;

  return (
    <g>
      {renderWireStubs(from, to, r * 2, stroke, sw)}
      <circle cx={mx} cy={my} r={r} fill="#fafafa" stroke={stroke} strokeWidth={sw} />
      <text x={mx - ux * (r * 0.5)} y={my - uy * (r * 0.5)} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill={stroke}>
        +
      </text>
      <text x={mx + ux * (r * 0.5)} y={my + uy * (r * 0.5)} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill={stroke}>
        −
      </text>
      {label && labelAt(from, to, r + 10, label, highlight)}
    </g>
  );
}

function Ground({ at, label }: { at: Point; label?: string }) {
  const [x, y] = at;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + 10} stroke="#27272a" strokeWidth={1.8} />
      <line x1={x - 12} y1={y + 10} x2={x + 12} y2={y + 10} stroke="#27272a" strokeWidth={2} />
      <line x1={x - 8} y1={y + 14} x2={x + 8} y2={y + 14} stroke="#27272a" strokeWidth={1.5} />
      <line x1={x - 4} y1={y + 18} x2={x + 4} y2={y + 18} stroke="#27272a" strokeWidth={1.2} />
      {label && (
        <text x={x + 14} y={y + 14} fontSize={11} fill="#52525b">
          {label}
        </text>
      )}
    </g>
  );
}

export const circuitPlugin: TeachbookPlugin = {
  type: "circuit",
  category: "electronics",
  description:
    "Circuit schematic with standard symbols: resistor, capacitor, inductor, battery, voltage source, ground, wires, nodes.",
  schemaDoc: `circuit: {
    type: "circuit",
    elements: [ ... ],
    label?
  }
  // Element kinds (all connect two points unless noted):
  //   {kind: "wire", from: [x, y], to: [x, y]}
  //   {kind: "resistor", from, to, label?, highlight?}
  //   {kind: "capacitor", from, to, label?, highlight?}
  //   {kind: "inductor", from, to, label?, highlight?}
  //   {kind: "battery", from, to, label?, highlight?}  // long plate at "from" (+)
  //   {kind: "voltage_source", from, to, label?, highlight?}  // circle with ±
  //   {kind: "ground", at: [x, y], label?}
  //   {kind: "node", at: [x, y], label?}   // junction dot
  //   {kind: "label", at: [x, y], text}    // free-floating text
  // Coordinates are viewBox pixels (800x500). Good starting grid: 50px spacing.
  // Use highlight: true on an element to emphasize it (e.g. "currently charging").`,

  render: (primitive) => {
    const p = primitive as unknown as CircuitPrimitive;
    const elements = p.elements ?? [];
    if (!Array.isArray(elements)) {
      return (
        <text x={10} y={20} fontSize={12} fill="#b91c1c">
          circuit: missing elements[]
        </text>
      );
    }
    return (
      <g>
        {p.label && (
          <text x={40} y={40} fontSize={14} fontWeight={600} fill="currentColor">
            {p.label}
          </text>
        )}
        {elements.map((el, i) => {
          switch (el.kind) {
            case "wire": {
              const stroke = "#27272a";
              return (
                <motion.line
                  key={i}
                  animate={{
                    x1: el.from[0],
                    y1: el.from[1],
                    x2: el.to[0],
                    y2: el.to[1],
                  }}
                  transition={TWEEN}
                  stroke={stroke}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              );
            }
            case "resistor":
              return <Resistor key={i} from={el.from} to={el.to} label={el.label} highlight={el.highlight} />;
            case "capacitor":
              return <Capacitor key={i} from={el.from} to={el.to} label={el.label} highlight={el.highlight} />;
            case "inductor":
              return <Inductor key={i} from={el.from} to={el.to} label={el.label} highlight={el.highlight} />;
            case "battery":
              return <Battery key={i} from={el.from} to={el.to} label={el.label} highlight={el.highlight} />;
            case "voltage_source":
              return <VoltageSource key={i} from={el.from} to={el.to} label={el.label} highlight={el.highlight} />;
            case "ground":
              return <Ground key={i} at={el.at} label={el.label} />;
            case "node":
              return (
                <g key={i}>
                  <circle cx={el.at[0]} cy={el.at[1]} r={3.5} fill="#27272a" />
                  {el.label && (
                    <text x={el.at[0] + 6} y={el.at[1] - 6} fontSize={11} fill="#52525b">
                      {el.label}
                    </text>
                  )}
                </g>
              );
            case "label":
              return (
                <text key={i} x={el.at[0]} y={el.at[1]} fontSize={12} fill="#27272a">
                  {el.text}
                </text>
              );
            default:
              return null;
          }
        })}
      </g>
    );
  },
};
