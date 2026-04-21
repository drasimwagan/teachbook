import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { parse as parseYaml } from "yaml";
import type {
  Root,
  Node,
  Yaml,
  Code,
  Heading,
  Paragraph,
  List,
  ListItem,
} from "mdast";
import type {
  Cell,
  Notebook,
  NotebookMetadata,
  QuizItem,
  Scene,
} from "../types";

export type ParseDiagnostic = {
  message: string;
  /** 1-indexed inclusive source-file line where the problem begins. */
  startLine?: number;
  /** 1-indexed inclusive source-file line where the problem ends. */
  endLine?: number;
};

export type ParseResult = {
  notebook: Notebook;
  errors: ParseDiagnostic[];
};

export function parseTbk(source: string): ParseResult {
  const errors: ParseDiagnostic[] = [];
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .parse(source) as Root;

  let metadata: NotebookMetadata = {
    title: "Untitled",
    subject: "",
    version: "0.1",
  };

  const cells: Cell[] = [];
  let current: Cell = { kind: "concept", prose: "", steps: [] };
  let proseParts: string[] = [];
  let inQuiz = false;
  // State for accumulating structured quiz items as we walk quiz-cell nodes.
  let quizItems: QuizItem[] = [];
  // Pending question from a `??` paragraph; awaiting MCQ options and/or a
  // `>>` line to finalize. Carries the parsed [type] metadata.
  let pendingQ:
    | {
        kind: "mcq" | "truefalse" | "numeric" | "short";
        question: string;
        tolerance?: number;
      }
    | null = null;
  // Collected options + correct-marker flags while parsing an MCQ question.
  let pendingOptions: { text: string; correct: boolean }[] | null = null;

  const finalizePendingQ = (explanationOrRubric?: string) => {
    if (!pendingQ) return;
    const q = pendingQ.question;
    if (pendingQ.kind === "short") {
      quizItems.push({ kind: "short", question: q, rubric: explanationOrRubric ?? "" });
    } else if (pendingQ.kind === "mcq") {
      const opts = pendingOptions ?? [];
      const correctIndex = Math.max(0, opts.findIndex((o) => o.correct));
      quizItems.push({
        kind: "mcq",
        question: q,
        options: opts.map((o) => o.text),
        correctIndex,
        explanation: explanationOrRubric,
      });
    } else if (pendingQ.kind === "truefalse") {
      // explanationOrRubric may start with [true]/[false]; pull it off.
      let correct = true;
      let expl = explanationOrRubric ?? "";
      const tfTag = expl.match(/^\[(true|false)\]\s*/i);
      if (tfTag) {
        correct = tfTag[1].toLowerCase() === "true";
        expl = expl.slice(tfTag[0].length);
      }
      quizItems.push({
        kind: "truefalse",
        question: q,
        correct,
        explanation: expl.trim() || undefined,
      });
    } else if (pendingQ.kind === "numeric") {
      const raw = explanationOrRubric ?? "";
      const num = raw.match(/[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
      const value = num ? Number(num[0]) : NaN;
      quizItems.push({
        kind: "numeric",
        question: q,
        value: Number.isFinite(value) ? value : 0,
        tolerance: pendingQ.tolerance,
        explanation: raw.replace(num?.[0] ?? "", "").trim() || undefined,
      });
    }
    pendingQ = null;
    pendingOptions = null;
  };

  const pushCell = () => {
    current.prose = proseParts.join("\n\n").trim();
    proseParts = [];
    if (current.kind === "quiz") {
      // Finalize any dangling pending question with no rubric/explanation.
      if (pendingQ) finalizePendingQ();
      if (quizItems.length > 0) {
        current.quizItems = quizItems;
        // Back-compat: the legacy question/rubric fields mirror the first
        // quiz item so older UI paths still light up.
        const first = quizItems[0];
        current.question = first.question;
        current.rubric =
          first.kind === "short"
            ? first.rubric
            : first.kind === "mcq"
              ? first.options[first.correctIndex] ?? ""
              : first.kind === "truefalse"
                ? String(first.correct)
                : String(first.value);
      }
      quizItems = [];
      pendingQ = null;
      pendingOptions = null;
    }
    if (
      current.prose ||
      current.steps.length ||
      current.code ||
      current.question ||
      (current.quizItems && current.quizItems.length > 0)
    ) {
      cells.push(current);
    }
  };

  for (const node of tree.children) {
    if (node.type === "yaml") {
      try {
        const parsed = parseYaml((node as Yaml).value) ?? {};
        metadata = { ...metadata, ...parsed };
      } catch (e) {
        errors.push({
          message: `Invalid YAML frontmatter: ${String(e)}`,
          startLine: node.position?.start.line,
          endLine: node.position?.end.line,
        });
      }
      continue;
    }

    if (node.type === "heading") {
      const h = node as Heading;
      const plain = nodeToText(h);
      if (/^quiz\b/i.test(plain.trim())) {
        pushCell();
        current = { kind: "quiz", prose: "", steps: [] };
        inQuiz = true;
        continue;
      }
      // Preserve raw source (keeps **bold**, *italic*, `code`, $math$ inline
      // formatting intact for the downstream ReactMarkdown + remark-math).
      proseParts.push(rawSlice(source, node) ?? `${"#".repeat(h.depth)} ${plain}`);
      continue;
    }

    if (node.type === "code") {
      const c = node as Code;
      if (c.lang === "scene") {
        const meta = parseSceneMeta(c.meta ?? "");
        try {
          const scene = JSON.parse(c.value) as Scene;
          if (!scene.primitives || !Array.isArray(scene.primitives)) {
            errors.push({
              message: `Scene at step=${meta.step ?? "?"} missing 'primitives' array`,
              startLine: c.position?.start.line,
              endLine: c.position?.end.line,
            });
            continue;
          }
          current.steps.push({
            narration: meta.narration ?? "",
            scene,
            codeLines: parseCodeLines(meta.code_lines),
            sourceLine: c.position?.start.line,
            sourceEndLine: c.position?.end.line,
          });
        } catch (e) {
          errors.push({
            message: `Invalid scene JSON at step=${meta.step ?? "?"}: ${String(e)}`,
            startLine: c.position?.start.line,
            endLine: c.position?.end.line,
          });
        }
        continue;
      }
      // Non-scene code block: attach first one as cell.code, still render in prose
      if (!current.code) {
        current.code = c.value;
        current.codeLang = c.lang ?? undefined;
      }
      proseParts.push(`\`\`\`${c.lang ?? ""}\n${c.value}\n\`\`\``);
      continue;
    }

    if (node.type === "list") {
      // Quiz MCQ option list: only consume if we have a pending mcq question.
      if (inQuiz && pendingQ?.kind === "mcq") {
        const list = node as List;
        pendingOptions = list.children.map((itemNode) => {
          const raw = nodeToText(itemNode as ListItem).trim();
          // Recognize correct-answer markers at the start of an option:
          //   [x] or [X] or [✓] or [✔]   → correct
          //   [ ]                          → explicitly incorrect
          //   (x) / (X) / (✓) / (✔)       → correct
          //   ( )                          → explicitly incorrect
          //   ✓ / ✔ at start               → correct
          const m = raw.match(/^(\[[xX✓✔ ]\]|\([xX✓✔ ]\)|[✓✔])\s*(.*)$/);
          if (m) {
            return {
              text: m[2].trim(),
              correct: /[xX✓✔]/.test(m[1]),
            };
          }
          return { text: raw, correct: false };
        });
        continue;
      }
      // Non-quiz list or unrelated list in a quiz cell — fall through to
      // prose preservation using the raw source.
      const raw = rawSlice(source, node);
      if (raw) {
        proseParts.push(raw);
        continue;
      }
    }

    if (node.type === "paragraph") {
      const p = node as Paragraph;
      const text = nodeToText(p);
      if (inQuiz) {
        if (text.startsWith("??")) {
          // Finalize any prior pending question that lacked a >> line.
          if (pendingQ) finalizePendingQ();
          const rest = text.replace(/^\?\?\s*/, "").trim();
          // Parse optional [type opts...] prefix. Legal types: mcq,
          // truefalse, numeric, short. Numeric supports tol=<num>.
          const tagMatch = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
          if (tagMatch) {
            const tagBody = tagMatch[1].trim();
            const question = tagMatch[2].trim();
            const kindWord = tagBody.split(/\s+/)[0].toLowerCase();
            if (
              kindWord === "mcq" ||
              kindWord === "truefalse" ||
              kindWord === "numeric" ||
              kindWord === "short"
            ) {
              let tolerance: number | undefined;
              const tolMatch = tagBody.match(/tol\s*=\s*([-+]?\d+(?:\.\d+)?)/);
              if (tolMatch) tolerance = Number(tolMatch[1]);
              pendingQ = { kind: kindWord, question, tolerance };
              continue;
            }
          }
          // No type tag → default to short-answer. Preserves legacy syntax.
          pendingQ = { kind: "short", question: rest };
          continue;
        }
        if (text.startsWith(">>")) {
          finalizePendingQ(text.replace(/^>>\s*/, "").trim());
          continue;
        }
      }
      // Preserve raw source for prose paragraphs so Markdown / math markers
      // survive into the Read view's ReactMarkdown pipeline.
      const raw = rawSlice(source, p);
      if (raw) {
        proseParts.push(raw);
        continue;
      }
      proseParts.push(text);
      continue;
    }
  }

  pushCell();

  const totalSteps = cells.reduce((s, c) => s + c.steps.length, 0);
  return {
    notebook: { metadata, cells, totalSteps, source },
    errors,
  };
}

function parseCodeLines(v: string | undefined): [number, number] | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return undefined;
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  if (isNaN(start) || isNaN(end) || start < 1 || end < start) return undefined;
  return [start, end];
}

function parseSceneMeta(meta: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)=("([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(meta)) !== null) {
    out[m[1]] = m[3] ?? m[4] ?? "";
  }
  return out;
}

/** Slice the raw source between a node's position offsets, preserving all
 *  original markdown formatting (bold, italic, math, links, code spans).
 *  Returns null if the node lacks position info. */
function rawSlice(source: string, node: Node): string | null {
  const pos = node.position;
  if (
    !pos ||
    typeof pos.start?.offset !== "number" ||
    typeof pos.end?.offset !== "number"
  ) {
    return null;
  }
  return source.slice(pos.start.offset, pos.end.offset);
}

function nodeToText(node: Node): string {
  if ("value" in node && typeof (node as { value: unknown }).value === "string") {
    return (node as { value: string }).value;
  }
  if ("children" in node && Array.isArray((node as { children: Node[] }).children)) {
    return (node as { children: Node[] }).children.map(nodeToText).join("");
  }
  return "";
}
