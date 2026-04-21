import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { parse as parseYaml } from "yaml";
import type { Root, Node, Yaml, Code, Heading, Paragraph } from "mdast";
import type { Cell, Notebook, NotebookMetadata, Scene } from "../types";

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
  let quizQuestion: string | undefined;
  let quizRubric: string | undefined;

  const pushCell = () => {
    current.prose = proseParts.join("\n\n").trim();
    proseParts = [];
    if (current.kind === "quiz") {
      current.question = quizQuestion;
      current.rubric = quizRubric;
      quizQuestion = undefined;
      quizRubric = undefined;
    }
    if (
      current.prose ||
      current.steps.length ||
      current.code ||
      current.question
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
      const text = nodeToText(h);
      if (/^quiz\b/i.test(text.trim())) {
        pushCell();
        current = { kind: "quiz", prose: "", steps: [] };
        inQuiz = true;
        continue;
      }
      proseParts.push(`${"#".repeat(h.depth)} ${text}`);
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

    if (node.type === "paragraph") {
      const p = node as Paragraph;
      const text = nodeToText(p);
      if (inQuiz) {
        if (text.startsWith("??")) {
          quizQuestion = text.replace(/^\?\?\s*/, "").trim();
          continue;
        }
        if (text.startsWith(">>")) {
          quizRubric = text.replace(/^>>\s*/, "").trim();
          continue;
        }
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

function nodeToText(node: Node): string {
  if ("value" in node && typeof (node as { value: unknown }).value === "string") {
    return (node as { value: string }).value;
  }
  if ("children" in node && Array.isArray((node as { children: Node[] }).children)) {
    return (node as { children: Node[] }).children.map(nodeToText).join("");
  }
  return "";
}
