import type { TeachbookPlugin } from "./types";

const registry = new Map<string, TeachbookPlugin>();

export function registerPlugin(plugin: TeachbookPlugin): void {
  if (registry.has(plugin.type)) {
    console.warn(
      `[Teachbook plugins] Duplicate registration for type "${plugin.type}". ` +
        `Last one wins.`,
    );
  }
  registry.set(plugin.type, plugin);
}

export function getPlugin(type: string): TeachbookPlugin | undefined {
  return registry.get(type);
}

export function listPlugins(): TeachbookPlugin[] {
  return Array.from(registry.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.type.localeCompare(b.type);
  });
}

export function pluginCount(): number {
  return registry.size;
}
