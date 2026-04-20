import { useState } from "react";
import type { Notebook } from "../types";

type Props = { notebook: Notebook | null };
type Message = { role: "user" | "assistant"; content: string };

export default function ChatPane({ notebook: _notebook }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  function send() {
    if (!input.trim()) return;
    setMessages([...messages, { role: "user", content: input }]);
    setInput("");
  }

  return (
    <section className="flex flex-col overflow-hidden">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500">
        Chat
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
        {messages.length === 0 ? (
          <div className="text-zinc-400">
            Ask Claude about the concept, or request a new step.
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "rounded bg-blue-100 dark:bg-blue-950 px-2 py-1"
                  : "rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1"
              }
            >
              {m.content}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a question..."
          className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm"
        />
        <button
          onClick={send}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </section>
  );
}
