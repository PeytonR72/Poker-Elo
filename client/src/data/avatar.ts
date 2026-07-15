/** Deterministic free avatar (DiceBear HTTP API) for a player id or bot name. */
export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1a222b`;
}
