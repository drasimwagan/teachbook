import { invoke } from "@tauri-apps/api/core";

export async function claudePrompt(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  return invoke<string>("claude_prompt", {
    prompt,
    systemPrompt: systemPrompt ?? null,
  });
}

export async function claudeGenerateNotebook(request: string): Promise<string> {
  return invoke<string>("claude_generate_notebook", { request });
}

export async function claudeCheck(): Promise<string> {
  return invoke<string>("claude_check");
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
