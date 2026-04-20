import { claudePromptStream } from "./claude";
import { parseTbk } from "./tbk-parser";
import type { Notebook } from "../types";

const SCENE_FENCE_RE = /```scene\b[\s\S]*?\n```/m;

function extractSceneBlock(raw: string): string {
  const trimmed = raw.trim();

  // Case 1: Claude wrapped the response in ```markdown ... ``` fences.
  const outerFence = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/;
  const m = trimmed.match(outerFence);
  if (m) {
    return extractSceneBlock(m[1]);
  }

  // Case 2: response contains the scene block plus prose — extract just the fence.
  const sceneMatch = trimmed.match(SCENE_FENCE_RE);
  if (sceneMatch) return sceneMatch[0];

  // Case 3: assume raw is already a valid scene block.
  if (trimmed.startsWith("```scene")) return trimmed;

  throw new Error(
    "Claude did not return a recognizable scene block. Response was:\n" + raw,
  );
}

export type InsertStepInput = {
  source: string;
  afterStepIndex: number;
  request: string;
  /** Called with raw chunks as they stream in (for live preview). */
  onChunk?: (chunk: string) => void;
};

export type InsertStepResult = {
  newSource: string;
  newStepIndex: number;
};

function locateStep(nb: Notebook, globalIndex: number) {
  let remaining = globalIndex;
  for (const cell of nb.cells) {
    if (remaining < cell.steps.length) {
      return cell.steps[remaining];
    }
    remaining -= cell.steps.length;
  }
  return null;
}

export async function insertStepAfter({
  source,
  afterStepIndex,
  request,
  onChunk,
}: InsertStepInput): Promise<InsertStepResult> {
  const { notebook } = parseTbk(source);
  const anchor = locateStep(notebook, afterStepIndex);
  if (!anchor?.sourceEndLine) {
    throw new Error(
      `Could not locate source position for step ${afterStepIndex + 1}.`,
    );
  }

  const prompt = buildInsertPrompt({ source, afterStepIndex, anchor, request });
  const system = `You are editing a Teachbook .tbk notebook. Return ONLY the new scene block — a single markdown code fence starting with \`\`\`scene and ending with \`\`\`. No prose before or after. No outer markdown fences. The scene must use primitives and coordinate conventions consistent with the existing notebook.`;

  const raw = await new Promise<string>((resolve, reject) => {
    claudePromptStream(prompt, system, {
      onChunk: (c) => onChunk?.(c),
      onDone: (full) => resolve(full),
      onError: (msg) => reject(new Error(msg)),
    }).catch(reject);
  });

  const sceneBlock = extractSceneBlock(raw);

  // Validate by parsing
  const fenceBody = /```scene[^\n]*\n([\s\S]*?)\n```/.exec(sceneBlock);
  if (!fenceBody) {
    throw new Error("Generated scene block is malformed (no fence body).");
  }
  try {
    const parsed = JSON.parse(fenceBody[1]);
    if (!parsed || !Array.isArray(parsed.primitives)) {
      throw new Error("Missing 'primitives' array");
    }
  } catch (e) {
    throw new Error(`Generated scene JSON is invalid: ${e}`);
  }

  // Splice the scene block after the anchor's end line (1-indexed).
  const lines = source.split("\n");
  const insertAt = anchor.sourceEndLine;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const blockLines = sceneBlock.split("\n");

  const needLeadingBlank = before.length > 0 && before[before.length - 1].trim() !== "";
  const needTrailingBlank = after.length > 0 && after[0].trim() !== "";
  const merged = [
    ...before,
    ...(needLeadingBlank ? [""] : []),
    ...blockLines,
    ...(needTrailingBlank ? [""] : []),
    ...after,
  ];

  const newSource = merged.join("\n");

  const reparsed = parseTbk(newSource);
  const newIndex = Math.min(afterStepIndex + 1, reparsed.notebook.totalSteps - 1);

  return { newSource, newStepIndex: newIndex };
}

function buildInsertPrompt(args: {
  source: string;
  afterStepIndex: number;
  anchor: { scene: { primitives: unknown[] }; narration: string };
  request: string;
}): string {
  const { source, afterStepIndex, anchor, request } = args;
  const anchorScene = JSON.stringify(anchor.scene);
  return [
    `I want to insert a new scene step AFTER step ${afterStepIndex + 1} in this Teachbook notebook.`,
    "",
    `The step after which we are inserting has narration: "${anchor.narration}"`,
    `Its scene JSON is: ${anchorScene}`,
    "",
    "User's request for the new step:",
    request,
    "",
    "Full current notebook for context:",
    "```markdown",
    source.length > 6000 ? source.slice(0, 6000) + "\n...[truncated]" : source,
    "```",
    "",
    "Respond with a SINGLE scene block in this exact shape:",
    "```scene step=N narration=\"...\" code_lines=M-K",
    "{\"primitives\": [ ... ]}",
    "```",
    "",
    `Use step=${afterStepIndex + 2} as the step number. Include code_lines if the notebook's cell has a code/solution block and the new step corresponds to specific lines. Reuse the same primitive types as the anchor scene so the visualization style stays consistent. If any primitive in the anchor has an "id" (e.g. a moving ball), include the SAME id on the same primitive in your new step so it tweens smoothly.`,
  ].join("\n");
}
