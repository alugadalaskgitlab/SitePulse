/**
 * Normalize whitespace in person names and title-case names that were entered
 * entirely in one case. Mixed-case spelling is preserved.
 */
export function formatPersonName(name?: string | null): string {
  const normalized = (name ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";

  const characters = Array.from(normalized);
  const letters = characters.filter((character) => character.toLowerCase() !== character.toUpperCase());
  if (!letters.length) return normalized;

  const allLower = letters.every((character) => character === character.toLowerCase());
  const allUpper = letters.every((character) => character === character.toUpperCase());
  if (!allLower && !allUpper) return normalized;

  const lower = Array.from(normalized.toLowerCase());
  let capitalizeNext = true;
  let formatted = "";
  for (let index = 0; index < lower.length; index++) {
    const character = lower[index];
    const isLetter = character.toLowerCase() !== character.toUpperCase();
    formatted += isLetter && capitalizeNext ? character.toUpperCase() : character;
    capitalizeNext = /[\s'’\-]/.test(character);
  }
  return formatted;
}
