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

/**
 * Fields authored on a progress row which can affect the three validation
 * passes performed while versioning a submitted DPR.  Keep this list
 * deliberately explicit: a version payload also contains identity fields and
 * server-owned review facts which must not make an otherwise untouched
 * historical row look changed.
 */
const VALIDATION_AUTHORED_FIELDS = [
  "activity",
  "chainageFrom",
  "chainageTo",
  "chainageFromKm",
  "chainageToKm",
  "side",
  "length",
  "width",
  "thickness",
  "quantity",
  "uom",
  "noSiteWork",
  "noSiteWorkDescription",
  "boqItemId",
  "earthworkArrangementId",
  "programmeBarId",
  "quantitySource",
  "quantitySourceNote",
  "chainageOverrideReason",
  "lengthOverrideReason",
  "executedBy",
  "layerNo",
  "isIncidental",
  "incidentalDescription",
  "materialOutcome",
  "reusableQty",
] as const;

const NUMERIC_VALIDATION_FIELDS = new Set<string>([
  "chainageFromKm",
  "chainageToKm",
  "length",
  "width",
  "thickness",
  "quantity",
  "boqItemId",
  "earthworkArrangementId",
  "programmeBarId",
  "layerNo",
  "reusableQty",
]);

const BOOLEAN_VALIDATION_FIELDS = new Set<string>([
  "noSiteWork",
  "isIncidental",
]);

const LOWERCASE_VALIDATION_FIELDS = new Set<string>([
  "side",
  "executedBy",
]);

// These values are enums consumed by case-sensitive validators.  Do not make
// an uppercase forged enum look semantically unchanged merely because its
// lowercase spelling is familiar.
const EXACT_VALIDATION_FIELDS = new Set<string>([
  "quantitySource",
  "materialOutcome",
]);

/**
 * Values from SiteEdit are often empty strings while persisted rows contain
 * nulls (and pg numeric values can arrive as strings).  Compare their
 * meaning, not their JSON representation, so client normalisation alone does
 * not cause a historical row to be revalidated.
 */
function validationValueComparable(value: unknown, field: string): string | number | boolean | null {
  if (NUMERIC_VALIDATION_FIELDS.has(field)) {
    if (value == null || (typeof value === "string" && value.trim() === "")) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : `invalid:${String(value).trim()}`;
  }
  if (BOOLEAN_VALIDATION_FIELDS.has(field)) {
    if (value == null || value === "") return false;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized || normalized === "false" || normalized === "0") return false;
      if (normalized === "true" || normalized === "1") return true;
    }
    return Boolean(value);
  }
  if (value == null) return "";
  const rawText = String(value);
  if (EXACT_VALIDATION_FIELDS.has(field)) return rawText;
  const text = rawText.trim();
  if (!text) return "";
  return LOWERCASE_VALIDATION_FIELDS.has(field) ? text.toLowerCase() : text.toUpperCase();
}

function validationChainageComparable(
  row: Record<string, unknown>,
  side: "From" | "To",
): string {
  const text = typeof row[`chainage${side}`] === "string"
    ? String(row[`chainage${side}`]).trim()
    : "";
  const parsedText = parseChainageKm(text);
  const numeric = row[`chainage${side}Km`];
  const parsedNumeric = numeric != null
    && !(typeof numeric === "string" && numeric.trim() === "")
    && Number.isFinite(Number(numeric))
    ? Number(numeric)
    : null;
  if (parsedText != null) return parsedText.toFixed(6);
  if (parsedNumeric != null) return parsedNumeric.toFixed(6);
  return text.toUpperCase();
}

function validationLengthComparable(row: Record<string, unknown>): string | number | boolean | null {
  const entered = validationValueComparable(row.length, "length");
  const chainageKm = (side: "From" | "To"): number | null => {
    const text = typeof row[`chainage${side}`] === "string"
      ? String(row[`chainage${side}`]).trim()
      : "";
    const parsedText = parseChainageKm(text);
    if (parsedText != null) return parsedText;
    const numeric = row[`chainage${side}Km`];
    if (numeric == null || (typeof numeric === "string" && numeric.trim() === "")) return null;
    const parsedNumeric = Number(numeric);
    return Number.isFinite(parsedNumeric) ? parsedNumeric : null;
  };
  const from = chainageKm("From");
  const to = chainageKm("To");
  if (from == null || to == null) return entered;
  const derived = Math.abs(to - from) * 1000;
  if (entered == null || typeof entered !== "number") return derived;
  // SiteEdit derives length from a complete chainage range when the persisted
  // legacy row omitted it.  Treat that display-only materialisation as the
  // same authored value while retaining genuine manual corrections.
  const tolerance = Math.max(0.005, Math.abs(derived) * 0.001);
  return Math.abs(entered - derived) <= tolerance ? derived : entered;
}

/**
 * Compare progress facts that are meaningful to programme-link,
 * quantity-source, and material-outcome validation.
 *
 * Identity (`id`, `persistedId`, `entryKey`) and server-owned review facts
 * (`chainageReviewStatus`, scope/link review fields) are intentionally
 * excluded.  Those facts are resolved/preserved separately by the route.
 */
export function dprProgressValidationFactsChanged(
  source: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (validationChainageComparable(source, "From") !== validationChainageComparable(payload, "From")) return true;
  if (validationChainageComparable(source, "To") !== validationChainageComparable(payload, "To")) return true;
  return VALIDATION_AUTHORED_FIELDS
    // chainageFromKm/chainageToKm are numeric aliases of the display chainage,
    // not independent authored facts.  Likewise, length can be materialised
    // from a complete chainage range by the edit client.
    .filter((field) =>
      field !== "chainageFrom"
      && field !== "chainageTo"
      && field !== "chainageFromKm"
      && field !== "chainageToKm"
    )
    .some((field) =>
      (field === "length" ? validationLengthComparable(source) : validationValueComparable(source[field], field))
      !== (field === "length" ? validationLengthComparable(payload) : validationValueComparable(payload[field], field))
    );
}

/**
 * Programme-link validation is also scoped by the DPR's BOQ-project header.
 * A row with identical authored fields is not semantically untouched when the
 * validation context changes, so the version route must re-run that validator
 * for the current rows.  Quantity/material validation has no header context.
 */
export function dprProgressProgrammeContextChanged(
  sourceHeader: Record<string, unknown>,
  payloadHeader: Record<string, unknown>,
): boolean {
  return validationValueComparable(sourceHeader.boqProjectId, "boqProjectId")
    !== validationValueComparable(payloadHeader.boqProjectId, "boqProjectId");
}

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