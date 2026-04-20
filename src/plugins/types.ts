import type { ReactElement } from "react";
import type { AxesPrimitive } from "../types";

/**
 * Context passed to a plugin's render function. Plugins can use it to
 * project points through an axes primitive if the scene provides one, or
 * to know the viewBox dimensions (always 800x500).
 */
export type PluginRenderContext = {
  /** Scene-level axes if any axes primitive is present, else undefined. */
  axes?: AxesPrimitive;
  viewW: number;
  viewH: number;
  /**
   * Project a point through the scene's axes if present, else pass through.
   * Useful for plugins that want to align with existing plot coordinate systems.
   */
  project: (x: number, y: number) => [number, number];
};

/**
 * A plugin extends the visualization engine with a new primitive type, scoped
 * to a domain (chemistry, quantum mechanics, electronics, etc.). Plugins:
 *
 *   1. are statically registered at compile time (see src/plugins/index.ts)
 *   2. declare their JSON shape via `schemaDoc` — included in the format
 *      guide Claude sees when generating or editing notebooks
 *   3. return SVG-compatible React elements from `render`
 *
 * Plugins own their own type narrowing. Their primitive passes through the
 * engine as the opaque `{ type: string, [k: string]: unknown }` shape; the
 * plugin is responsible for validating its own fields.
 */
export type TeachbookPlugin = {
  /** Unique primitive type string (e.g. "molecule"). Must not collide with
   *  core types: grid, shape, arrow, label, axes, plot, graph, matrix. */
  type: string;
  /** Domain — shown in plugin lists and docs. */
  category: string;
  /** One-line human-readable summary. */
  description: string;
  /**
   * Schema shown to Claude in the TBK format guide. Keep it short: a JSON
   * shape line plus 1-3 lines explaining semantics. Follow the style of the
   * core primitive docs in src/lib/prompts.ts.
   */
  schemaDoc: string;
  /** Render the primitive as an SVG fragment. Called once per scene per step. */
  render: (
    primitive: { type: string; [key: string]: unknown },
    ctx: PluginRenderContext,
  ) => ReactElement | null;
};
