/** Unambiguous uppercase alphabet (no O/0/I/1/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Generate a room code of `length` chars using a provided rng (0..1). */
export function makeRoomCode(length, rng) {
    let out = "";
    for (let i = 0; i < length; i++) {
        const idx = Math.floor(rng() * ROOM_CODE_ALPHABET.length);
        out += ROOM_CODE_ALPHABET[idx];
    }
    return out;
}
