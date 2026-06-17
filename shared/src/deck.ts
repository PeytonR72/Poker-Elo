import { mulberry32 } from "./rng.js";
import { fullDeck, type Card } from "./cards.js";

/** Fisher-Yates over mulberry32. The seed is SERVER-ONLY — never sent to clients. */
export function shuffledDeck(seed: number): Card[] {
  const deck = fullDeck();
  const rng = mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}
