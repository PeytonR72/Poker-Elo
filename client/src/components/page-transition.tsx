import type { ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Thin enter-only fade + 4px slide wrapper for screen/tab changes. Give it a
 * stable `key` per screen so a switch remounts it and replays the enter
 * animation. Deliberately no exit phase and no AnimatePresence: at 180ms an
 * exit fade is imperceptible, and skipping it avoids the mode="wait" blank
 * frame / stuck-enter class of bugs with nested presences. Reduced motion is
 * degraded to instant by the app-root <MotionConfig reducedMotion="user">.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export default PageTransition;
