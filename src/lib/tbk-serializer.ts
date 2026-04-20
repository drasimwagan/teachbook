import { stringify as stringifyYaml } from "yaml";
import type { Notebook } from "../types";

/**
 * Serialize a Notebook back to .tbk markdown.
 *
 * This is a lossy inverse of `parseTbk` for MVP: cells are emitted in order,
 * prose first then scenes then quiz. Round-trip safety holds for
 * Claude-generated notebooks that follow the canonical layout.
 */
export function serializeTbk(nb: Notebook): string {
  const parts: string[] = [];

  parts.push("---");
  parts.push(stringifyYaml(nb.metadata).trim());
  parts.push("---");
  parts.push("");

  let globalStep = 0;
  for (const cell of nb.cells) {
    if (cell.kind === "quiz") {
      parts.push("## Quiz");
      parts.push("");
      if (cell.question) {
        parts.push(`?? ${cell.question}`);
        parts.push("");
      }
      if (cell.rubric) {
        parts.push(`>> ${cell.rubric}`);
        parts.push("");
      }
      continue;
    }

    if (cell.prose.trim()) {
      parts.push(cell.prose);
      parts.push("");
    }

    for (const step of cell.steps) {
      const narr = step.narration.replace(/"/g, '\\"');
      parts.push(`\`\`\`scene step=${globalStep} narration="${narr}"`);
      parts.push(JSON.stringify(step.scene));
      parts.push("```");
      parts.push("");
      globalStep += 1;
    }
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
