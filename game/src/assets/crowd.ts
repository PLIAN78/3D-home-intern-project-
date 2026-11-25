/** Per-frame counters shared by the asset components (reset by AssetSystem before anything draws). */
export const crowd = { animated: 0 };

/**
 * Realistic models on or off. Off ("?classic" in the address) draws the old
 * primitive figures and vehicles everywhere, for before/after comparisons.
 */
export const REALISTIC = typeof location === "undefined" || !/[?&]classic\b/.test(location.search);

/** The player's current outfit, registered by the game store (so people code needn't import the store). */
let playerOutfit: (() => unknown) | null = null;
export const registerPlayerOutfit = (get: () => unknown) => (playerOutfit = get);
export const isPlayerOutfit = (o: unknown) => !!playerOutfit && playerOutfit() === o;
