// Canonical key for fuzzy-matching material names across deliveries / recipes / master.
// "GSB Material" -> "GSB", "20 MM Aggregate" -> "20MM", "6mm Down" -> "6MMDOWN".
export function canonMaterialName(name: string): string {
  return (name || "")
    .toUpperCase()
    .replace(/AGGREGATES?/g, "")
    .replace(/MATERIAL/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}
