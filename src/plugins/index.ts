/**
 * Plugin registration. Add new plugins by importing them here and pushing
 * onto `allPlugins`. Each plugin self-contains its type string, docs, and
 * render function — see src/plugins/types.ts.
 *
 * We register synchronously at module-load time so the SceneRenderer and the
 * format guide see a consistent set of plugins on the first render.
 */

import { moleculePlugin } from "./chemistry/molecule";
import { registerPlugin } from "./registry";
import type { TeachbookPlugin } from "./types";

export const allPlugins: TeachbookPlugin[] = [
  moleculePlugin,
  // Add more plugins below — see docs/PLUGIN_AUTHORING.md.
];

for (const p of allPlugins) registerPlugin(p);

export { getPlugin, listPlugins, pluginCount, registerPlugin } from "./registry";
export type { TeachbookPlugin, PluginRenderContext } from "./types";
