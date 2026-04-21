import { claudePrompt } from "./claude";

export type Grade = {
  score: number; // 0..10
  correct: boolean; // score >= 7
  feedback: string; // 2-3 sentence narrative
};

const SYSTEM_PROMPT = [
  "You are grading a student's answer to a quiz question inside the Teachbook",
  "learning app. Compare the student's answer to the provided rubric (the",
  "instructor's model answer) and assign an integer score from 0 to 10.",
  "",
  "Scoring guide:",
  "  10 — fully correct, well-reasoned, matches the rubric's key points",
  "   8 — correct in substance, may omit minor detail",
  "   6 — partially correct; captures the idea but contains a notable error",
  "   3 — demonstrates some understanding but is largely wrong",
  "   0 — blank, off-topic, or contradicts the rubric entirely",
  "",
  "Respond with ONLY a JSON object on a single line, no prose, no fences:",
  '  {"score": <0-10>, "correct": <true|false>, "feedback": "<2-3 sentences>"}',
  "",
  "`correct` must be true iff score >= 7. Feedback should be specific:",
  "quote or paraphrase what the student got right and what they missed.",
  "Do not include the rubric verbatim in the feedback.",
].join("\n");

export async function gradeAnswer(
  question: string,
  rubric: string,
  studentAnswer: string,
): Promise<Grade> {
  const prompt = [
    `Question: ${question}`,
    "",
    `Rubric (model answer): ${rubric}`,
    "",
    `Student's answer: ${studentAnswer}`,
  ].join("\n");
  const raw = await claudePrompt(prompt, SYSTEM_PROMPT);
  return parseGrade(raw);
}

/** Parse Claude's response. Tolerates ``` fences and stray prose. */
export function parseGrade(raw: string): Grade {
  // Try direct parse first.
  const direct = tryJSON(raw);
  if (direct) return normalize(direct);
  // Strip fences.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const inner = tryJSON(fenced[1]);
    if (inner) return normalize(inner);
  }
  // Find the first {...} block.
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) {
    const block = tryJSON(brace[0]);
    if (block) return normalize(block);
  }
  throw new Error(
    `Could not parse grade from Claude's response: ${raw.slice(0, 200)}`,
  );
}

function tryJSON(s: string): unknown {
  try {
    return JSON.parse(s.trim());
  } catch {
    return null;
  }
}

function normalize(obj: unknown): Grade {
  if (!obj || typeof obj !== "object") {
    throw new Error("grade payload is not an object");
  }
  const o = obj as Record<string, unknown>;
  const score = Math.max(
    0,
    Math.min(10, Math.round(Number(o.score ?? 0))),
  );
  const feedback =
    typeof o.feedback === "string" ? o.feedback : "(no feedback provided)";
  const correct =
    typeof o.correct === "boolean" ? o.correct : score >= 7;
  return { score, correct, feedback };
}
