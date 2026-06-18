import type { Pot, Seat } from "./types.js";

/**
 * Build main + side pots from each seat's total contribution this hand.
 * Folded seats' chips are included as dead money but the folder is not eligible.
 * Invariant: sum of pot amounts == sum of all committedTotal (chip conservation).
 */
export function buildPots(seats: (Seat | null)[]): Pot[] {
  const contrib: { idx: number; amt: number; eligible: boolean }[] = [];
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i];
    if (s && s.committedTotal > 0) {
      contrib.push({
        idx: i,
        amt: s.committedTotal,
        eligible: s.status === "active" || s.status === "allin",
      });
    }
  }

  const layers: Pot[] = [];
  let remaining = contrib.filter((c) => c.amt > 0);
  while (remaining.length) {
    const min = Math.min(...remaining.map((c) => c.amt));
    let amount = 0;
    const eligible: number[] = [];
    for (const c of remaining) {
      amount += min;
      c.amt -= min;
      if (c.eligible) eligible.push(c.idx);
    }
    layers.push({ amount, eligible });
    remaining = remaining.filter((c) => c.amt > 0);
  }

  // Merge consecutive layers with identical eligible sets; fold dead-only layers
  // (no eligible winners) into the previous pot so no chips are lost.
  const merged: Pot[] = [];
  for (const p of layers) {
    if (p.eligible.length === 0) {
      if (merged.length) merged[merged.length - 1]!.amount += p.amount;
      else merged.push({ amount: p.amount, eligible: [] });
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligible, p.eligible)) last.amount += p.amount;
    else merged.push({ amount: p.amount, eligible: [...p.eligible] });
  }
  return merged;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}
