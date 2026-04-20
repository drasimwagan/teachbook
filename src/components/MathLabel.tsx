import { useMemo } from "react";
import { motion } from "framer-motion";
import katex from "katex";

const TWEEN = { type: "tween", duration: 0.35, ease: "easeOut" } as const;

type Props = {
  text: string;
  x: number;
  y: number;
};

/**
 * Lazy-loaded KaTeX label renderer. Kept in its own module so katex + the
 * KaTeX CSS+fonts don't get bundled into the main chunk; SceneRenderer only
 * pays the cost when a scene actually has `latex: true` labels.
 */
export default function MathLabel({ text, x, y }: Props) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(text, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return null;
    }
  }, [text]);

  if (!html) {
    return (
      <motion.text animate={{ x, y }} transition={TWEEN} fontSize={14} fill="currentColor">
        {text}
      </motion.text>
    );
  }

  return (
    <motion.foreignObject
      animate={{ x: x - 4, y: y - 18 }}
      transition={TWEEN}
      width={260}
      height={36}
      style={{ overflow: "visible" }}
    >
      <div
        style={{ fontSize: "15px", color: "currentColor", whiteSpace: "nowrap" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </motion.foreignObject>
  );
}
