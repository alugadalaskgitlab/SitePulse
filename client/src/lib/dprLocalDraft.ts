export interface DprLocalDraft {
  header: Record<string, unknown>;
  [key: string]: any;
}

export interface DprDraftStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

const ROW_ARRAY_FIELDS = [
  "progress",
  "structureItems",
  "equipment",
  "labour",
  "materials",
  "sitePurchases",
] as const;

const NESTED_ARRAY_FIELDS: Record<string, readonly string[]> = {
  progress: ["personnelIds", "allocations"],
  equipment: ["activitySegments", "activityAllocations", "breakdowns"],
  labour: ["workerNames", "personnelIds"],
};

const EMPTY_ROW_FIELDS = new Set([
  "entryKey",
  "persistedId",
  "id",
  "uom",
  "unit",
  "entryType",
  "type",
  "category",
  "gender",
  "workType",
  "noSiteWork",
  "reworkNoNewMaterial",
  "isIncidental",
  "dieselBalanceConfirmed",
]);

const EMPTY_DEFAULT_VALUES = new Set([
  "activity 1",
  "culvert",
  "pipe culvert",
  "excavation",
  "skilled",
  "male",
  "received",
  "time_meter",
  "sqm",
  "m³",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rowHasData(value: unknown, key = ""): boolean {
  if (EMPTY_ROW_FIELDS.has(key)) return false;
  if (value == null || value === false) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return !!trimmed && !EMPTY_DEFAULT_VALUES.has(trimmed.toLowerCase());
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(item => rowHasData(item));
  if (isRecord(value)) {
    return Object.entries(value).some(([childKey, childValue]) => rowHasData(childValue, childKey));
  }
  return value === true;
}

function isDprLocalDraft(value: unknown): value is DprLocalDraft {
  if (!isRecord(value) || !isRecord(value.header)) return false;
  if (["site", "date", "engineer"].some(key =>
    value.header[key] != null && typeof value.header[key] !== "string",
  )) return false;
  for (const field of ROW_ARRAY_FIELDS) {
    if (value[field] == null) continue;
    if (!Array.isArray(value[field]) || value[field].some(row => !isRecord(row))) return false;
    const nestedFields = NESTED_ARRAY_FIELDS[field] ?? [];
    for (const row of value[field] as Record<string, unknown>[]) {
      if (nestedFields.some(key => row[key] != null && !Array.isArray(row[key]))) return false;
    }
  }
  return true;
}

export function dprLocalDraftKey(dprId: number, userId: number | null | undefined): string | null {
  if (!Number.isInteger(dprId) || dprId < 0 || !Number.isInteger(userId) || Number(userId) <= 0) return null;
  return `dpr_draft_${dprId}_user_${userId}`;
}

export function parseDprLocalDraft(raw: string): DprLocalDraft | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isDprLocalDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasDprLocalDraftContent(draft: unknown): boolean {
  if (!isDprLocalDraft(draft)) return false;
  const header = draft.header;
  if (typeof header?.site === "string" && header.site.trim()) return true;
  return ROW_ARRAY_FIELDS.some(field =>
    Array.isArray(draft[field]) && (draft[field] as unknown[]).some(row => rowHasData(row)),
  );
}

export function canRestoreDprLocalDraft(status: unknown, draft: unknown): draft is DprLocalDraft {
  return status === "draft" && isDprLocalDraft(draft) && hasDprLocalDraftContent(draft);
}

export function removeDprLocalDrafts(storage: DprDraftStorage, dprId: number): void {
  const legacyKey = `dpr_draft_${dprId}`;
  const userScopedPrefix = `${legacyKey}_user_`;
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === legacyKey || key?.startsWith(userScopedPrefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => storage.removeItem(key));
}
