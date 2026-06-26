import { describe, it, expect } from "vitest";
import { formMatches, botFillEtaSec } from "./matchmaker.js";
import type { Waiter } from "./matchmaker.js";
import {
  TABLE_SIZE,
  RANKED_MIN_ONLINE,
  BOT_FILL_WAIT_MS,
} from "@poker/shared";

const T0 = 1_000_000;
function w(id: string, rating: number, ageMs = 0, format = "turbo"): Waiter {
  return { playerId: id, rating, format, enqueuedAt: T0 - ageMs };
}

describe("formMatches", () => {
  it("forms a full human table when TABLE_SIZE compatible players wait", () => {
    const waiters = Array.from({ length: TABLE_SIZE }, (_, i) => w(`p${i}`, 400 + i));
    const { matches, matchedIds } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toHaveLength(TABLE_SIZE);
    expect(matchedIds.size).toBe(TABLE_SIZE);
  });

  it("does not form a match for fresh sub-table waiters when enough are online", () => {
    const waiters = [w("a", 400), w("b", 410), w("c", 420)];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    expect(matches).toHaveLength(0);
  });

  it("bot-fills after BOT_FILL_WAIT_MS elapses for the oldest waiter", () => {
    const waiters = [w("a", 400, BOT_FILL_WAIT_MS + 1), w("b", 410, 500), w("c", 420, 500)];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(matches[0]!.humanIds.length).toBeLessThanOrEqual(TABLE_SIZE);
  });

  it("bot-fills immediately when fewer than RANKED_MIN_ONLINE are online", () => {
    const waiters = [w("a", 400)];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE - 1);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toEqual(["a"]);
  });

  it("keeps far-apart ratings separate while windows are small, groups them once windows grow", () => {
    // ratings 400 and 900 — far apart. Fresh: not grouped. Old enough: grouped (window expands).
    const fresh = [w("a", 400), w("b", 900)];
    expect(formMatches(fresh, T0, RANKED_MIN_ONLINE).matches).toHaveLength(0);

    const old = [w("a", 400, BOT_FILL_WAIT_MS + 1), w("b", 900, BOT_FILL_WAIT_MS + 1)];
    const { matches } = formMatches(old, T0, RANKED_MIN_ONLINE);
    // window after long wait is large enough to overlap; both land in one bot-filled match
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("does not mix formats", () => {
    const waiters = [
      ...Array.from({ length: TABLE_SIZE }, (_, i) => w(`r${i}`, 400, BOT_FILL_WAIT_MS + 1, "rapid")),
      w("t0", 400, BOT_FILL_WAIT_MS + 1, "turbo"),
    ];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    const formats = matches.map((m) => m.format).sort();
    expect(formats).toEqual(["rapid", "turbo"]);
    const rapid = matches.find((m) => m.format === "rapid")!;
    expect(rapid.humanIds).toHaveLength(TABLE_SIZE);
  });
});

describe("botFillEtaSec", () => {
  it("counts down toward the bot-fill deadline", () => {
    expect(botFillEtaSec(w("a", 400, 0), T0)).toBe(Math.ceil(BOT_FILL_WAIT_MS / 1000));
    expect(botFillEtaSec(w("a", 400, BOT_FILL_WAIT_MS), T0)).toBe(0);
    expect(botFillEtaSec(w("a", 400, BOT_FILL_WAIT_MS + 5000), T0)).toBe(0);
  });
});
