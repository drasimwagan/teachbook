/**
 * Plugin registration. Add new plugins by importing them here and pushing
 * onto `allPlugins`. Each plugin self-contains its type string, docs, and
 * render function — see src/plugins/types.ts.
 *
 * We register synchronously at module-load time so the SceneRenderer and the
 * format guide see a consistent set of plugins on the first render.
 */

import { moleculePlugin } from "./chemistry/molecule";
import { heatmapPlugin } from "./ml/heatmap";
import { neuralNetworkPlugin } from "./ml/neural-network";
import { blochPlugin } from "./quantum/bloch";
import { registerPlugin } from "./registry";
import type { TeachbookPlugin } from "./types";

export const allPlugins: TeachbookPlugin[] = [
  moleculePlugin,
  neuralNetworkPlugin,
  heatmapPlugin,
  blochPlugin,
  // Add more plugins below — see docs/PLUGIN_AUTHORING.md.
];

for (const p of allPlugins) registerPlugin(p);

export { getPlugin, listPlugins, pluginCount, registerPlugin } from "./registry";
export type { TeachbookPlugin, PluginRenderContext } from "./types";
