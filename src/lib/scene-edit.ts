// Surgically update a primitive inside a `.tbk` scene fence.
//
// The parser records `sourceLine` (1-indexed, the line with ```scene …) and
// `sourceEndLine` (the line with the closing ```). The JSON body sits on the
// lines between them. We parse that JSON, patch the requested primitive,
// re-serialize, and splice the new body back into the source.
//
// Formatting note: we detect whether the original body was compact (single
// line) or pretty (multi-line) and preserve that shape. This keeps the
// source diffable when authors drag a primitive: a compact fence stays
// compact, a pretty fence stays pretty.

export type PrimitivePatch = Record<string, unknown>;

export type UpdateResult =
  | { ok: true; source: string }
  | { ok: false; error: string };

export function updatePrimitiveInSource(
  source: string,
  sourceLine: number, // 1-indexed, line with opening ```scene …
  sourceEndLine: number, // 1-indexed, line with closing ```
  primitiveIndex: number,
  patch: PrimitivePatch,
): UpdateResult {
  if (sourceEndLine - sourceLine < 1) {
    return { ok: false, error: "scene fence has no body" };
  }
  const lines = source.split("\n");
  // Source lines are 1-indexed in mdast; array is 0-indexed.
  const bodyStart = sourceLine; // first body line index in array
  const bodyEnd = sourceEndLine - 1; // last body line index in array (exclusive)
  const bodyLines = lines.slice(bodyStart, bodyEnd);
  const body = bodyLines.join("\n");

  let scene: { primitives?: unknown[] };
  try {
    scene = JSON.parse(body) as { primitives?: unknown[] };
  } catch (e) {
    return {
      ok: false,
      error: `failed to parse scene JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const prims = scene.primitives;
  if (!Array.isArray(prims)) {
    return { ok: false, error: "scene is missing primitives array" };
  }
  if (primitiveIndex < 0 || primitiveIndex >= prims.length) {
    return {
      ok: false,
      error: `primitive index ${primitiveIndex} out of range (0..${prims.length - 1})`,
    };
  }
  const prev = prims[primitiveIndex];
  if (!prev || typeof prev !== "object") {
    return { ok: false, error: "primitive is not an object" };
  }
  prims[primitiveIndex] = { ...(prev as object), ...patch };

  // Preserve compact vs pretty formatting. A body with no interior newline is
  // "compact" (single JSON line between fence markers).
  const isCompact = !body.includes("\n");
  const newBody = isCompact
    ? JSON.stringify(scene)
    : JSON.stringify(scene, null, 2);

  const newLines = [
    ...lines.slice(0, bodyStart),
    ...newBody.split("\n"),
    ...lines.slice(bodyEnd),
  ];
  return { ok: true, source: newLines.join("\n") };
}
