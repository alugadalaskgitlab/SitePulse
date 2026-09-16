import { boqItemDisplayName, type BoqItemNameFields } from "./boqItemName";

export interface DprBoqProjectChoice {
  id: number;
  status?: string | null;
  barCount?: number | null;
}

export interface DprBoqSiteChoice {
  id: number;
  name: string;
}

export interface DprBoqSelectableItem extends BoqItemNameFields {
  id: number;
  includeInDpr?: boolean | null;
}

/**
 * Site names are user-facing strings and have historically accumulated
 * harmless whitespace/case differences.  Normalize only those differences;
 * never do a partial/fuzzy match because two sites can legitimately have
 * similar names.
 */
export function normalizeDprSiteName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase()
    : "";
}

/**
 * Resolve a site name only when the normalized exact match is unambiguous.
 * Returning null for duplicate names is deliberate: choosing an arbitrary
 * site would query the wrong BOQ project and make valid items appear absent.
 */
export function resolveDprSiteId(
  sites: readonly DprBoqSiteChoice[],
  siteName: unknown,
): number | null {
  const normalized = normalizeDprSiteName(siteName);
  if (!normalized) return null;
  const matches = sites.filter((site) => normalizeDprSiteName(site.name) === normalized);
  const ids = new Set(matches.map((site) => site.id));
  return ids.size === 1 ? matches[0].id : null;
}

/**
 * One DPR-project rule for Guided, Detailed, and Edit.
 * Edit may prefer the project already saved on the DPR; otherwise every form
 * uses active-with-programme → active → first API row. `undefined` means that
 * no saved preference exists yet. An explicit `null` is different: it is a
 * saved DPR with no BOQ project and must not be replaced by a newly guessed
 * project.
 */
export function resolveDprBoqProjectId(
  projects: readonly DprBoqProjectChoice[],
  preferredProjectId?: number | null,
): number | null {
  if (preferredProjectId === null) return null;
  if (
    preferredProjectId != null
    && projects.some((project) => project.id === preferredProjectId)
  ) {
    return preferredProjectId;
  }
  return (
    projects.find((project) => project.status === "active" && Number(project.barCount ?? 0) > 0)?.id
    ?? projects.find((project) => project.status === "active")?.id
    ?? projects[0]?.id
    ?? null
  );
}

function isRealDprBoqItemId(value: unknown): value is number | string {
  if (value === null || value === undefined || value === "") return false;
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;
  return Number.isInteger(numeric) && numeric > 0;
}

/**
 * Collect the BOQ item ids currently present in a DPR form/read object.
 *
 * Unlike the server's payload-specific reference checker this deliberately
 * walks arbitrary nested client state. Guided equipment keeps pass-through
 * assignments in a nested bag, and allocation/segment representations have
 * changed over time. Recovery must use the live evidence, not just the rows
 * that one editor happens to render.
 */
export function collectDprBoqItemIds(value: unknown): number[] {
  const visited = new WeakSet<object>();
  const ids = new Set<number>();
  const visit = (current: unknown): void => {
    if (current == null || typeof current !== "object") return;
    if (visited.has(current)) return;
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    const record = current as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "boqItemId")
      && isRealDprBoqItemId(record.boqItemId)) {
      ids.add(Number(record.boqItemId));
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return Array.from(ids).sort((a, b) => a - b);
}

/**
 * Resolve a project from live BOQ-item evidence.
 *
 * The ordinary project resolver intentionally uses deterministic API order.
 * That is correct for a fresh form, but unsafe when recovering an existing
 * DPR whose header is null: two projects can belong to the same site and the
 * first one may not own the already-linked item. A recovery is allowed only
 * when exactly one candidate owns every referenced item. Partial or ambiguous
 * matches return null rather than guessing.
 */
export function resolveDprBoqProjectIdByEvidence(
  projects: readonly DprBoqProjectChoice[],
  evidenceBoqItemIds: readonly number[],
  candidateItemsByProject: ReadonlyMap<number, readonly { id: number }[]>,
): number | null {
  const evidence = Array.from(new Set(
    evidenceBoqItemIds.filter((id) => Number.isInteger(id) && id > 0),
  ));
  if (evidence.length === 0) return null;

  const owners = projects.filter((project) => {
    const itemIds = new Set(
      (candidateItemsByProject.get(project.id) ?? [])
        .map((item) => Number(item.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    );
    return evidence.every((id) => itemIds.has(id));
  });
  return owners.length === 1 ? owners[0].id : null;
}

/**
 * Legacy compatibility predicate for old callers/tests. Server persistence
 * must use isEvidenceBasedDprNullProjectRecovery instead: client confirmation
 * is not authorization and a saved null is recoverable only with real BOQ
 * evidence.
 */
export function isConfirmedDprNullProjectRecovery({
  savedProjectId,
  requestedProjectId,
  confirmed,
  sameSite,
  hasBoqReferences,
}: {
  savedProjectId: number | null;
  requestedProjectId: number | null;
  confirmed: boolean;
  sameSite: boolean;
  hasBoqReferences: boolean;
}): boolean {
  return savedProjectId === null
    && Number.isInteger(requestedProjectId)
    && Number(requestedProjectId) > 0
    && confirmed
    && sameSite
    && !hasBoqReferences;
}

/**
 * A saved null project may be repaired only when the current DPR carries
 * actual BOQ evidence.  The project/site ownership and item-to-project
 * checks are deliberately performed by the server; this predicate is only
 * the shared shape of the evidence-based transition and never trusts a
 * client confirmation flag.
 */
export function isEvidenceBasedDprNullProjectRecovery({
  savedProjectId,
  requestedProjectId,
  sameSite,
  hasBoqReferences,
}: {
  savedProjectId: number | null;
  requestedProjectId: number | null;
  sameSite: boolean;
  hasBoqReferences: boolean;
}): boolean {
  return savedProjectId === null
    && Number.isInteger(requestedProjectId)
    && Number(requestedProjectId) > 0
    && sameSite
    && hasBoqReferences;
}

/**
 * Return true when any DPR-owned row contains a BOQ item reference.
 *
 * Guided equipment keeps some links in `passthrough`, while equipment
 * allocations/segments and cut/fill allocations can be nested several levels
 * deep. Recursing over plain form data keeps the page guards consistent and
 * avoids allowing a site/project change to orphan a nested reference.
 */
export function hasDprBoqReferences(value: unknown): boolean {
  return collectDprBoqItemIds(value).length > 0;
}

/**
 * Return true when the supplied live DPR/form rows contain work that is more
 * than an untouched editor placeholder.
 *
 * This is intentionally narrower than a generic "non-empty object" check:
 * default progress/equipment/labour rows contain option values and generated
 * keys, while a blank row added after a special row must not make a
 * null-project DPR look like ordinary BOQ work.  No-site-work and incidental
 * rows are meaningful as soon as they are marked, even when their required
 * description is still being completed.
 */
export function hasDprMeaningfulNonBoqWork(value: unknown): boolean {
  const visited = new WeakSet<object>();
  const stringKeys = [
    "activity",
    "description",
    "noSiteWorkDescription",
    "incidentalDescription",
    "task",
    "contractor",
    "machine",
    "vehicleNo",
    "operator",
    "side",
    "chainageFrom",
    "chainageTo",
    "structureName",
    "location",
    "material",
    "itemDescription",
    "vendor",
    "billNo",
    "receiptNumber",
    "supplier",
    "remarks",
    "remark",
  ] as const;
  const numericKeys = [
    "quantity",
    "length",
    "width",
    "thickness",
    "amount",
    "amountPaid",
    "count",
    "diesel",
    "openingReading",
    "closingReading",
    "numberOfTrips",
    "tripDistance",
    "totalKm",
    "waterQuantity",
    "reusableQty",
  ] as const;
  const idKeys = [
    "boqItemId",
    "programmeBarId",
    "earthworkArrangementId",
    "equipmentId",
    "plantUsageId",
    "structureId",
  ] as const;
  const structureDefaults: Record<string, string> = {
    structureType: "Culvert",
    structureSubType: "Pipe Culvert",
    stage: "Excavation",
    itemOfWork: "Excavation",
  };
  const visit = (current: unknown): boolean => {
    if (current == null || typeof current !== "object") return false;
    if (visited.has(current)) return false;
    visited.add(current);
    if (Array.isArray(current)) return current.some(visit);

    const record = current as Record<string, unknown>;
    if (record.noSiteWork === true || record.isIncidental === true) return true;
    for (const key of stringKeys) {
      if (typeof record[key] === "string" && record[key].trim() !== "") return true;
    }
    for (const key of numericKeys) {
      const numeric = Number(record[key]);
      if (Number.isFinite(numeric) && numeric > 0) return true;
    }
    for (const key of idKeys) {
      const raw = record[key];
      if (isRealDprBoqItemId(raw)
        || (key === "structureId" && typeof raw === "string" && raw.trim() !== "")) {
        return true;
      }
    }
    for (const key of Object.keys(structureDefaults)) {
      if (typeof record[key] === "string"
        && record[key].trim() !== ""
        && record[key].trim() !== structureDefaults[key]) {
        return true;
      }
    }
    for (const key of ["personnelIds", "breakdowns", "attachments", "allocations"]) {
      const nested = record[key];
      if (Array.isArray(nested) && nested.length > 0) return true;
    }
    return Object.values(record).some(visit);
  };
  return visit(value);
}

/** Preserve the server's deterministic order; exclude only explicit DPR opt-outs. */
export function dprSelectableBoqItems<T extends DprBoqSelectableItem>(
  items: readonly T[],
): T[] {
  return items.filter((item) => item.includeInDpr !== false);
}

/** The only user-facing BOQ label allowed in a DPR picker. */
export function dprBoqItemDisplayName(item?: DprBoqSelectableItem | null): string {
  return boqItemDisplayName(item);
}