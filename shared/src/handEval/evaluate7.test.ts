import { describe, it, expect } from "vitest";
import { evaluate7 } from "./evaluate7.js";
import { evaluate7Naive } from "./evaluate7Naive.js";
import { cardFromString as C } from "../cards.js";

const seven = (s: string) => s.split(" ").map(C);

describe("evaluate7 matches the oracle on crafted hands", () => {
  const cases = [
    "Ah Kd 2h 5h 9h Jh 3c",
    "2c 7d 5h 6s 4c 3d Kh",
    "Ah 2c 3d 4s 5h 9d Kc",
    "Ah 2h 3h 4h 5h 9d Kc",
    "9c 9d 9h 9s Kc 2d 3h",
    "8c 8d 8h Kc Kd 2s 3h",
    "Qc Qd Qh 9s 2c 5d 7h",
    "Jc Jd 4h 4s 9c 2d 7h",
    "5c 5d Kh 9s 2c 7d 8h",
    "Ah Qd 9h 5s 2c 7d 3h",
    "As Ks Qs Js Ts 2c 3d",
  ];
  for (const c of cases) {
    it(c, () => {
      expect(evaluate7(seven(c))).toBe(evaluate7Naive(seven(c)));
    });
  }
});
