import { useEffect, useRef } from "react";

/**
 * Marks board cards added since the previous committed render of the same hand
 * (for the flip animation). The ref is READ during render but only WRITTEN in
 * an effect: writing during render breaks under StrictMode, whose dev
 * double-render would re-read the already-mutated ref and mark nothing as new,
 * so board flips would never fire in dev.
 */
export function useBoardReveal(board: number[], handNumber: number) {
  const prev = useRef<{ hand: number; count: number }>({ hand: -1, count: 0 });
  const isNewHand = prev.current.hand !== handNumber;
  const prevCount = isNewHand ? 0 : prev.current.count;

  useEffect(() => {
    prev.current = { hand: handNumber, count: board.length };
  }, [board, handNumber]);

  return board.map((card, i) => ({ card, isNew: i >= prevCount }));
}
