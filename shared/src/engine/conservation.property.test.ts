import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { applyAction } from "./reducer.js";
import { legalActions, type ActionMask } from "./legalActions.js";
import type { Action, TableState } from "./types.js";
import { shuffledDeck } from "../deck.js";
import { mulberry32 } from "../rng.js";

function totalChips(state: TableState): number {
  let t = 0;
  for (const s of state.seats) if (s) t += s.stack;
  return t;
}

function chooseRandom(mask: ActionMask, rng: () => number): Action {
  const roll = rng();
  if (mask.canRaise && roll < 0.35) {
    const span = mask.maxRaiseTo - mask.minRaiseTo;
    const to = mask.minRaiseTo + Math.floor(rng() * (span + 1));
    return { seat: mask.seat, type: "raise", amount: to };
  }
  if (mask.canCall && roll < 0.85) return { seat: mask.seat, type: "call" };
  if (mask.canCheck) return { seat: mask.seat, type: "check" };
  return { seat: mask.seat, type: "fold" };
}

describe("GATE: chips are conserved across randomized hands", () => {
  it(
    "sum of stacks is invariant for many random multi-all-in hands",
    () => {
      for (let seed = 0; seed < 3000; seed++) {
        const rng = mulberry32(seed + 1);
        const n = 2 + Math.floor(rng() * 5); // 2..6 players
        const seats: (ReturnType<typeof createSeat> | null)[] = [];
        for (let i = 0; i < 6; i++) {
          seats.push(
            i < n ? createSeat("p" + i, true, 100 + Math.floor(rng() * 900)) : null,
          );
        }
        const before = seats.reduce((a, s) => a + (s ? s.stack : 0), 0);

        let st = createHand({
          seats,
          buttonIndex: seed % n,
          sb: 10,
          bb: 20,
          deck: shuffledDeck(seed),
          handNumber: 1,
          elapsedMs: 0,
          format: "turbo",
        });

        let guard = 0;
        while (st.street !== "complete" && guard++ < 5000) {
          const i = st.toAct;
          if (i == null) throw new Error(`seed ${seed}: toAct null before complete`);
          st = applyAction(st, chooseRandom(legalActions(st, i), rng)).state;
        }

        expect(st.street, `seed ${seed}: hand did not complete`).toBe("complete");

        const after = totalChips(st);
        if (after !== before) {
          throw new Error(
            `seed ${seed}: chip conservation violated — before=${before}, after=${after}, diff=${after - before}`,
          );
        }
      }
      expect(true).toBe(true);
    },
    { timeout: 60000 },
  );
});
