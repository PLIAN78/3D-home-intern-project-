/** Normalise a collection name for matching ("35′ collection" ≡ "35′ Collection" ≡ "35' Collection"). */
export function collectionKey(name: string): string {
  return name.toLowerCase().replace(/[′’']/g, "'").replace(/\s+/g, " ").trim();
}
