import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { parse as parseYaml } from "yaml";
import type { Root, Node, Yaml, Code, Heading, Paragraph } from "mdast";
import type { Cell, Notebook, NotebookMetadata, Scene } from "../types";

export type ParseResult = {
  notebook: Notebook;
  errors: string[];
};

export function parseTbk(source: string): ParseResult {
  const errors: string[] = [];
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
        errors.push(`Invalid YAML frontmatter: ${String(e)}`);
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
            errors.push(
              `Scene at step=${meta.step ?? "?"} missing 'primitives' array`,
            );
            continue;
          }
          current.steps.push({
            narration: meta.narration ?? "",
            scene,
          });
        } catch (e) {
          errors.push(
            `Invalid scene JSON at step=${meta.step ?? "?"}: ${String(e)}`,
          );
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
