import { useState } from "react";
import type { Notebook } from "../types";
import { chatSystemPrompt, claudePromptStream } from "../lib/claude";

type Props = {
  notebook: Notebook | null;
  source: string;
  currentStep: number;
};

type Message = {
  role: "user" | "assistant" | "error";
  content: string;
  streaming?: boolean;
};

export default function ChatPane({ notebook, source, currentStep }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    const assistantMsg: Message = { role: "assistant", content: "", streaming: true };
    const nextMessages: Message[] = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setBusy(true);

    const narration = (() => {
      if (!notebook) return undefined;
      let remaining = currentStep;
      for (const cell of notebook.cells) {
        if (remaining < cell.steps.length) {
          return cell.steps[remaining]?.narration;
        }
        remaining -= cell.steps.length;
      }
      return undefined;
    })();

    const system = chatSystemPrompt({
      notebookSource: source,
      currentStep,
      narration,
    });

    const history = nextMessages
      .filter((m) => m.role !== "error")
      .map((m) =>
        m.role === "user" ? `Student: ${m.content}` : `Tutor: ${m.content}`,
      )
      .slice(0, -1) // exclude the empty assistant placeholder
      .join("\n\n");

    try {
      await claudePromptStream(history, system, {
        onChunk: (chunk) => {
          setMessages((cur) => {
            const copy = cur.slice();
            const last = copy[copy.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              copy[copy.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
            }
            return copy;
          });
        },
        onDone: (full) => {
          setMessages((cur) => {
            const copy = cur.slice();
            const last = copy[copy.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              copy[copy.length - 1] = {
                role: "assistant",
                content: full || last.content,
                streaming: false,
              };
            }
            return copy;
          });
        },
        onError: (msg) => {
          setMessages((cur) => {
            const copy = cur.slice();
            // Drop empty assistant placeholder if nothing arrived
            if (
              copy.length > 0 &&
              copy[copy.length - 1].role === "assistant" &&
              copy[copy.length - 1].content === ""
            ) {
              copy.pop();
            }
            copy.push({ role: "error", content: msg });
            return copy;
          });
        },
      });
    } catch {
      // onError already handled UI
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col overflow-hidden">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500 shrink-0">
        Chat
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
        {messages.length === 0 ? (
          <div className="text-zinc-400 text-xs">
            Ask Claude about the current step, the concept, or request a new
            example. The current notebook and step are sent as context.
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "rounded bg-blue-100 dark:bg-blue-950 px-2 py-1 whitespace-pre-wrap"
                  : m.role === "error"
                    ? "rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-1 font-mono text-xs whitespace-pre-wrap"
                    : "rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1 whitespace-pre-wrap"
              }
            >
              {m.content || (m.streaming ? <span className="text-zinc-400 italic">…</span> : null)}
              {m.streaming && m.content && (
                <span className="ml-0.5 inline-block animate-pulse text-zinc-400">▍</span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 flex gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={busy ? "Streaming…" : "Ask a question..."}
          disabled={busy}
          className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </section>
  );
}
