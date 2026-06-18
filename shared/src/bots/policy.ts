import { evaluate7, HandCategory } from "../handEval/index.js";
import { rankOf, suitOf, type Card } from "../cards.js";
import type { ActionMask } from "../engine/legalActions.js";
import type { PublicView } from "../engine/selectors.js";
import type { Action } from "../engine/types.js";

/** Pure tight-aggressive bot. Consumes only public info + its own hole cards. */
export function decide(
  view: PublicView,
  hole: [Card, Card],
  mask: ActionMask,
  rng: () => number,
): Action {
  const me = view.seats[mask.seat]!;
  const bb = view.bb;
  const stackBB = me.stack / bb;
  const pot = potSize(view);

  // ── Preflop ──────────────────────────────────────────────────────────────
  if (view.board.length === 0) {
    const tier = preflopTier(hole);

    // Short-stack push/fold: no limping when <= 12 BB
    if (stackBB <= 12) {
      return tier >= 2 ? raiseTo(mask, mask.maxRaiseTo) : foldOrCheck(mask);
    }

    if (tier === 4) {
      // Premium: 4-bet/jam, never fold preflop
      return raiseTo(mask, view.currentBet + bb * 4);
    }
    if (tier === 3) {
      // Strong: 3-bet, call reraises
      if (mask.callAmount === 0) {
        return rng() < 0.7 ? raiseTo(mask, bb * 3) : callOrCheck(mask);
      }
      return mask.callAmount <= bb * 6 ? raiseTo(mask, view.currentBet + bb * 3) : callOrCheck(mask);
    }
    if (tier === 2) {
      // Good: raise or call, fold to big 3-bets
      if (mask.callAmount === 0) return raiseTo(mask, bb * 3);
      return mask.callAmount <= bb * 4 ? callOrCheck(mask) : foldOrCheck(mask);
    }
    if (tier === 1) {
      // Playable: call raises, fold to 3-bets
      if (mask.callAmount === 0) return rng() < 0.18 ? raiseTo(mask, bb * 3) : callOrCheck(mask);
      return mask.callAmount <= bb * 3 ? callOrCheck(mask) : foldOrCheck(mask);
    }
    // Tier 0 (trash): fold if facing a raise, check otherwise
    return foldOrCheck(mask);
  }

  // ── Postflop ─────────────────────────────────────────────────────────────
  const handValue = evaluate7([hole[0], hole[1], ...view.board]);
  const cat = Math.floor(handValue / 16 ** 5);

  if (cat >= HandCategory.Trips) {
    // Trips or better: bet/raise strongly
    const betSize = Math.round(pot * 0.75);
    return raiseTo(mask, view.currentBet + betSize + bb);
  }

  if (cat === HandCategory.TwoPair) {
    // Two pair: bet/call moderate
    if (mask.callAmount === 0) return raiseTo(mask, view.currentBet + Math.round(pot * 0.5) + bb);
    const potOdds = mask.callAmount / Math.max(1, pot + mask.callAmount);
    return potOdds < 0.5 ? callOrCheck(mask) : foldOrCheck(mask);
  }

  if (cat === HandCategory.Pair) {
    // Pair: call moderate bets, fold to large ones
    if (mask.callAmount === 0) return rng() < 0.25 ? raiseTo(mask, view.currentBet + Math.round(pot * 0.4) + bb) : callOrCheck(mask);
    const potOdds = mask.callAmount / Math.max(1, pot + mask.callAmount);
    if (potOdds < 0.35) return callOrCheck(mask);
    return rng() < 0.1 ? callOrCheck(mask) : foldOrCheck(mask);
  }

  // Weak/no made hand (HighCard): check/fold, occasional bluff
  if (mask.callAmount === 0) return rng() < 0.12 ? raiseTo(mask, view.currentBet + Math.round(pot * 0.4) + bb) : foldOrCheck(mask);
  return foldOrCheck(mask);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function potSize(view: PublicView): number {
  let p = 0;
  for (const pot of view.pots) p += pot.amount;
  for (const s of view.seats) if (s) p += s.committedThisStreet;
  return p;
}

/**
 * Preflop hand strength tier:
 *  4 = premium (AA, KK, QQ, AKs)
 *  3 = strong  (99-JJ, AQ, AKo)
 *  2 = good    (22-88, suited broadway, strong aces)
 *  1 = playable (suited connectors, suited aces, broadway)
 *  0 = trash
 *
 * Ranks: 0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 */
function preflopTier(hole: [Card, Card]): number {
  const r1 = rankOf(hole[0]);
  const r2 = rankOf(hole[1]);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const pair = r1 === r2;
  const suited = suitOf(hole[0]) === suitOf(hole[1]);

  // Tier 4: AA, KK, QQ (pair >= Q) and AKs/AQs
  if (pair && hi >= 10) return 4; // QQ, KK, AA (rank 10=Q, 11=K, 12=A)
  if (hi === 12 && lo >= 10 && suited) return 4; // AKs, AQs

  // Tier 3: 99-JJ, AK offsuit, AQ offsuit
  if (pair && hi >= 7) return 3; // 99 (rank 7=9), TT (8), JJ (9)
  if (hi === 12 && lo >= 10) return 3; // AK, AQ offsuit (lo>=10 means Q or K)

  // Tier 2: small/mid pairs (22-88), suited broadway (KQs, KJs, AJs, ATs), strong aces
  if (pair) return 2; // 22-88 (rank 0..6)
  if (hi === 12 && suited) return 2; // any suited ace (A2s-A9s, AJs already covered)
  if (hi >= 10 && lo >= 9 && suited) return 2; // suited broadway: KJs(lo=9,hi=11), QJs(lo=9,hi=10), KQs(lo=10,hi=11)
  if (hi === 12 && lo >= 8) return 2; // ATo+ offsuit (lo=8=T)

  // Tier 1: playable — suited connectors (6-9 connected), broadway offsuit, suited aces weaker
  if (hi >= 9 && lo >= 8) return 1; // broadway-ish offsuit: KQ(11,10), QJ(10,9), KJ(11,9)
  if (suited && hi - lo <= 2 && lo >= 4 && hi <= 9) return 1; // suited connectors 6-T range
  if (hi === 12 && lo >= 5) return 1; // suited ace weaker

  return 0;
}

function raiseTo(mask: ActionMask, to: number): Action {
  if (!mask.canRaise) return callOrCheck(mask);
  let t = Math.round(to);
  if (t < mask.minRaiseTo) t = mask.minRaiseTo;
  if (t > mask.maxRaiseTo) t = mask.maxRaiseTo;
  return { seat: mask.seat, type: "raise", amount: t };
}

function callOrCheck(mask: ActionMask): Action {
  if (mask.canCheck) return { seat: mask.seat, type: "check" };
  if (mask.canCall) return { seat: mask.seat, type: "call" };
  return { seat: mask.seat, type: "fold" };
}

function foldOrCheck(mask: ActionMask): Action {
  return mask.canCheck ? { seat: mask.seat, type: "check" } : { seat: mask.seat, type: "fold" };
}
