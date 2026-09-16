import { parseChainageKm } from "./barSide";

export type ProgressIdentityResolution<T = any> =
  | { ok: true; sources: Array<T | undefined> }
  | { ok: false; message: string };

/**
 * Resolve replacement progress rows to their original rows exactly once.
 *
 * A persisted id is authoritative for legacy rows whose entryKey is null.
 * When both identities are supplied they must resolve to the same source.
 * Duplicate ids, duplicate keys, and two payload rows claiming one source
 * are rejected before any server-owned review facts are copied.
 */
export function resolveDprProgressSources<T extends { id?: unknown; entryKey?: unknown }>(
  payloadRows: unknown[],
  sourceRows: T[],
): ProgressIdentityResolution<T> {
  const sourceById = new Map<number, T>();
  const sourceByKey = new Map<string, T>();
  for (const source of sourceRows) {
    const id = Number(source.id);
    if (Number.isInteger(id) && id > 0) sourceById.set(id, source);
    if (typeof source.entryKey === "string" && source.entryKey.trim()) {
      const prior = sourceByKey.get(source.entryKey);
      if (prior && Number(prior.id) !== id) {
        return { ok: false, message: `Source progress rows share entryKey ${source.entryKey}` };
      }
      sourceByKey.set(source.entryKey, source);
    }
  }

  const seenIds = new Set<number>();
  const seenKeys = new Set<string>();
  const seenSources = new Set<number>();
  const sources: Array<T | undefined> = [];
  for (let index = 0; index < payloadRows.length; index += 1) {
    const row = (payloadRows[index] ?? {}) as Record<string, unknown>;
    const hasPersistedId = row.persistedId != null;
    const persistedId = hasPersistedId ? Number(row.persistedId) : null;
    if (hasPersistedId && (!Number.isInteger(persistedId) || (persistedId as number) <= 0)) {
      return { ok: false, message: `Progress row ${index + 1} has an invalid persistedId` };
    }
    if (persistedId != null) {
      if (seenIds.has(persistedId)) {
        return { ok: false, message: `Progress row ${index + 1} duplicates persistedId ${persistedId}` };
      }
      seenIds.add(persistedId);
    }

    const key = typeof row.entryKey === "string" && row.entryKey.trim()
      ? row.entryKey
      : null;
    if (key != null) {
      if (seenKeys.has(key)) {
        return { ok: false, message: `Progress row ${index + 1} duplicates entryKey ${key}` };
      }
      seenKeys.add(key);
    }

    const sourceByPayloadId = persistedId == null ? undefined : sourceById.get(persistedId);
    const sourceByPayloadKey = key == null ? undefined : sourceByKey.get(key);
    if (persistedId != null && !sourceByPayloadId) {
      return { ok: false, message: `Progress row ${index + 1} references an unknown persistedId ${persistedId}` };
    }
    if (
      sourceByPayloadId
      && sourceByPayloadKey
      && Number(sourceByPayloadId.id) !== Number(sourceByPayloadKey.id)
    ) {
      return { ok: false, message: `Progress row ${index + 1} has conflicting persistedId and entryKey identities` };
    }
    const source = sourceByPayloadId ?? sourceByPayloadKey;
    if (source) {
      const sourceId = Number(source.id);
      if (Number.isInteger(sourceId) && seenSources.has(sourceId)) {
        return { ok: false, message: `Progress rows claim source row ${sourceId} more than once` };
      }
      if (Number.isInteger(sourceId)) seenSources.add(sourceId);
    }
    sources.push(source);
  }
  return { ok: true, sources };
}

const REVIEW_RELEVANT_FIELDS = [
  "side",
  "chainageFrom",
  "chainageTo",
  "boqItemId",
  "programmeBarId",
  "earthworkArrangementId",
  "noSiteWork",
  "isIncidental",
  "layerNo",
] as const;

function comparable(value: unknown, field: string): string {
  if (field === "noSiteWork" || field === "isIncidental") return String(!!value);
  if (value == null || value === "") return "";
  return typeof value === "number" ? String(value) : String(value).trim().toUpperCase();
}

function chainageComparable(row: Record<string, unknown>, side: "From" | "To"): string {
  const text = typeof row[`chainage${side}`] === "string"
    ? String(row[`chainage${side}`]).trim()
    : "";
  const parsedText = parseChainageKm(text);
  const numeric = row[`chainage${side}Km`];
  const parsedNumeric = numeric != null && Number.isFinite(Number(numeric)) ? Number(numeric) : null;
  if (parsedText != null) return parsedText.toFixed(6);
  if (parsedNumeric != null) return parsedNumeric.toFixed(6);
  return text.toUpperCase();
}

/** Compares only facts that determine the validity of review/scope decisions. */
export function dprProgressReviewFactsChanged(
  source: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (chainageComparable(source, "From") !== chainageComparable(payload, "From")) return true;
  if (chainageComparable(source, "To") !== chainageComparable(payload, "To")) return true;
  return REVIEW_RELEVANT_FIELDS
    .filter((field) => field !== "chainageFrom" && field !== "chainageTo")
    .some((field) => comparable(source[field], field) !== comparable(payload[field], field));
}