/**
 * Uppercase policy for human-readable business identity fields.
 *
 * Use only for names and short display labels that are explicitly designated
 * uppercase. Do not use for credentials, email addresses, URLs, filenames,
 * storage keys, UOMs, document/asset codes, imported specifications, or prose.
 */
export function uppercaseBusinessText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function uppercaseOptionalBusinessText<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  return uppercaseBusinessText(value) as T;
}

type BoqProjectBusinessText = {
  name?: string;
  client?: string | null;
  contractor?: string | null;
};

/**
 * BOQ project contractNo is intentionally absent: it is a document identifier
 * and may be case-sensitive. Only approved human-readable labels are changed.
 */
export function normalizeBoqProjectBusinessText<T extends BoqProjectBusinessText>(data: T): T {
  const normalized = { ...data };
  if (typeof normalized.name === "string") {
    normalized.name = uppercaseBusinessText(normalized.name);
  }
  if (typeof normalized.client === "string") {
    normalized.client = uppercaseBusinessText(normalized.client);
  }
  if (typeof normalized.contractor === "string") {
    normalized.contractor = uppercaseBusinessText(normalized.contractor);
  }
  return normalized;
}