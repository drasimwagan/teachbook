import { useEffect } from "react";

/**
 * Fire `onEscape` whenever Esc is pressed while `active` is true. Intended
 * for modal dialogs that want "click outside / press Esc" to close. Pair
 * with the usual backdrop onClick.
 */
export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
