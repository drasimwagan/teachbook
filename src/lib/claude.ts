import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export async function claudePrompt(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  return invoke<string>("claude_prompt", {
    prompt,
    systemPrompt: systemPrompt ?? null,
  });
}

export async function claudeCheck(): Promise<string> {
  return invoke<string>("claude_check");
}

export type StreamHandlers = {
  onChunk: (text: string) => void;
  onDone: (full: string) => void;
  onError: (message: string) => void;
};

/**
 * Streams a Claude response via Tauri events. Returns a promise that resolves
 * when the stream ends, plus a cancel function (currently a no-op — the child
 * process keeps running if you drop interest; wire Ctrl-C later if needed).
 */
export async function claudePromptStream(
  prompt: string,
  systemPrompt: string | undefined,
  handlers: StreamHandlers,
): Promise<void> {
  const requestId = crypto.randomUUID();
  const unlisteners: UnlistenFn[] = [];

  const stop = () => {
    for (const u of unlisteners) u();
  };

  return new Promise<void>(async (resolve, reject) => {
    try {
      unlisteners.push(
        await listen<string>(`claude-chunk-${requestId}`, (ev) => {
          handlers.onChunk(ev.payload);
        }),
      );
      unlisteners.push(
        await listen<string>(`claude-done-${requestId}`, (ev) => {
          handlers.onDone(ev.payload);
          stop();
          resolve();
        }),
      );
      unlisteners.push(
        await listen<string>(`claude-error-${requestId}`, (ev) => {
          handlers.onError(ev.payload);
          stop();
          reject(new Error(ev.payload));
        }),
      );

      await invoke("claude_prompt_stream", {
        requestId,
        prompt,
        systemPrompt: systemPrompt ?? null,
      });
    } catch (e) {
      stop();
      handlers.onError(String(e));
      reject(e);
    }
  });
}

export function chatSystemPrompt(opts: {
  notebookSource?: string;
  currentStep?: number;
  narration?: string;
}): string {
  const parts: string[] = [
    "You are a patient tutor inside the Teachbook learning app.",
    "A student is stepping through a notebook. Answer their questions about the concept being taught.",
    "Keep answers short (2-4 sentences) unless the student asks for depth.",
    "If they ask about 'this step' or 'the current step', use the context below.",
  ];
  if (opts.notebookSource && opts.notebookSource.trim()) {
    const trimmed =
      opts.notebookSource.length > 6000
        ? opts.notebookSource.slice(0, 6000) + "\n...[truncated]"
        : opts.notebookSource;
    parts.push("", "Current notebook source:", "```", trimmed, "```");
  }
  if (opts.currentStep != null) {
    parts.push("", `The student is currently on step ${opts.currentStep + 1}.`);
    if (opts.narration) {
      parts.push(`Narration for this step: ${opts.narration}`);
    }
  }
  return parts.join("\n");
}
