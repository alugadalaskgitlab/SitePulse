/**
 * Presentation-only casing for business/entity names.
 * Never use this when saving data, matching identities, or producing Tally output.
 */
export function displayName(value: string | null | undefined): string {
  return (value ?? "").toUpperCase();
}
