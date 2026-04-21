import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// Vite ?raw import inlines the file at build time. The guide ships inside
// the frontend bundle so it's available offline.
import userGuideMd from "../../docs/USER_GUIDE.md?raw";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function UserGuideDialog({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-[860px] max-w-full h-[85vh] rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold">User guide</h2>
            <p className="text-xs text-zinc-500">
              Press <kbd className="font-mono">Esc</kbd> or click outside to close.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm"
          >
            Close
          </button>
        </header>

        <article className="flex-1 overflow-auto px-6 py-4 prose prose-sm dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{userGuideMd}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
