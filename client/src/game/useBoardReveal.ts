import { useRef } from "react";

/** Marks board cards added since the previous render of the same hand (for flip animation). */
export function useBoardReveal(board: number[], handNumber: number) {
  const prev = useRef<{ hand: number; count: number }>({ hand: -1, count: 0 });
  const isNewHand = prev.current.hand !== handNumber;
  const prevCount = isNewHand ? 0 : prev.current.count;
  prev.current = { hand: handNumber, count: board.length };
  return board.map((card, i) => ({ card, isNew: i >= prevCount }));
}
