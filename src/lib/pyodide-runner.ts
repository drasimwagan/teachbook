// Pyodide is loaded lazily from a CDN on first use. Keeps our bundle small
// and avoids shipping ~6 MB of WASM to users who never open the Run pane.
//
// Trade-off: first run requires network. A future enhancement can bundle the
// wheel locally via `public/pyodide/` for offline use.

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type PyodideAPI = {
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: {
    set: (key: string, value: unknown) => void;
    get: (key: string) => unknown;
    delete: (key: string) => void;
  };
  setStdout: (opts: { batched: (msg: string) => void }) => void;
  setStderr: (opts: { batched: (msg: string) => void }) => void;
  toPy: (obj: unknown) => unknown;
};

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideAPI>;
  }
}

let loadingPromise: Promise<PyodideAPI> | null = null;

export function isLoaded(): boolean {
  return loadingPromise !== null;
}

export async function getPyodide(
  onProgress?: (msg: string) => void,
): Promise<PyodideAPI> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    onProgress?.("fetching pyodide.js…");
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[data-pyodide="1"]',
        );
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () =>
            reject(new Error("Failed to load Pyodide from CDN")),
          );
          return;
        }
        const s = document.createElement("script");
        s.src = `${PYODIDE_CDN}pyodide.js`;
        s.dataset.pyodide = "1";
        s.onload = () => resolve();
        s.onerror = () =>
          reject(
            new Error(
              `Failed to fetch ${s.src}. Pyodide requires internet on first load.`,
            ),
          );
        document.head.appendChild(s);
      });
    }
    onProgress?.("initializing Python runtime…");
    const pyodide = await window.loadPyodide!({ indexURL: PYODIDE_CDN });
    onProgress?.("ready");
    return pyodide;
  })();
  return loadingPromise;
}

export type RunResult = {
  ok: boolean;
  error?: string;
};

/**
 * Execute Python code. stdout/stderr callbacks are invoked line-by-line (or
 * flush-by-flush, via Pyodide's "batched" mode — which captures each write()).
 */
export async function runPython(
  pyodide: PyodideAPI,
  code: string,
  onStdout: (s: string) => void,
  onStderr: (s: string) => void,
): Promise<RunResult> {
  pyodide.setStdout({ batched: onStdout });
  pyodide.setStderr({ batched: onStderr });
  try {
    await pyodide.runPythonAsync(code);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Inject a map of JS values as Python globals. Scene primitives are plain
 * objects, so Pyodide converts them to dicts; lists → lists; numbers → ints/floats.
 */
export function injectGlobals(
  pyodide: PyodideAPI,
  vars: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(vars)) {
    pyodide.globals.set(k, pyodide.toPy(v));
  }
}
