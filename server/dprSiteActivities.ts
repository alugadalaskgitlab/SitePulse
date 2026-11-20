import { and, asc, eq, inArray } from "drizzle-orm";
import { calculateSiteActivityResult } from "../shared/dprSiteActivities";
import { dprSiteActivities, dprSiteActivityStaff, personnel } from "../shared/schema";

const activityColumns = [
  "activityType", "sortOrder", "chainageFrom", "chainageTo", "side", "layer",
  "levelsKind", "deptPerson", "testName", "testPlace", "resultValue",
  "requiredValue", "officeWork", "visitorName", "visitorDesignation", "note",
  "fileName", "objectPath", "mimeType", "fileSize",
] as const;

export async function readDprSiteActivitiesByDprIds(tx: any, dprIds: number[]) {
  if (!dprIds.length) return new Map<number, any[]>();
  const rows = await tx.select().from(dprSiteActivities)
    .where(inArray(dprSiteActivities.dprId, dprIds))
    .orderBy(asc(dprSiteActivities.sortOrder), asc(dprSiteActivities.id));
  const links = rows.length ? await tx.select({
    siteActivityId: dprSiteActivityStaff.siteActivityId,
    personnelId: personnel.id,
    name: personnel.name,
    isActive: personnel.isActive,
  }).from(dprSiteActivityStaff)
    .innerJoin(personnel, eq(personnel.id, dprSiteActivityStaff.personnelId))
    .where(inArray(dprSiteActivityStaff.siteActivityId, rows.map((row: any) => row.id))) : [];
  const byDpr = new Map<number, any[]>();
  for (const row of rows as any[]) {
    const staff = links.filter((link: any) => link.siteActivityId === row.id);
    const list = byDpr.get(row.dprId) ?? [];
    list.push({
      ...row,
      persistedId: row.id,
      personnelIds: staff.map((link: any) => link.personnelId).sort((a: number, b: number) => a - b),
      staffNames: staff.map((link: any) => link.name),
      staff: staff.map(({ personnelId, name, isActive }: any) => ({ id: personnelId, name, isActive })),
      attachment: row.objectPath ? {
        fileName: row.fileName,
        objectPath: row.objectPath,
        mimeType: row.mimeType ?? undefined,
        fileSize: row.fileSize ?? undefined,
      } : undefined,
    });
    byDpr.set(row.dprId, list);
  }
  return byDpr;
}

export async function readDprSiteActivities(tx: any, dprId: number) {
  const activities = await readDprSiteActivitiesByDprIds(tx, [dprId]);
  return activities.get(dprId) ?? [];
}

function attachmentValues(input: any) {
  const attachment = input.attachment;
  if (Object.prototype.hasOwnProperty.call(input, "attachment") && attachment == null) {
    return { fileName: null, objectPath: null, mimeType: null, fileSize: null };
  }
  if (!attachment) {
    const existingPath = input.objectPath;
    if (!existingPath) return {};
    return {
      fileName: input.fileName ?? null,
      objectPath: existingPath,
      mimeType: input.mimeType ?? null,
      fileSize: input.fileSize ?? null,
    };
  }
  if (typeof attachment.fileName !== "string" || !attachment.fileName.trim()
      || typeof attachment.objectPath !== "string" || !attachment.objectPath.startsWith("/objects/")
      || (attachment.mimeType && !attachment.mimeType.startsWith("image/") && attachment.mimeType !== "application/pdf")
      || (attachment.fileSize != null && (!Number.isInteger(attachment.fileSize) || attachment.fileSize < 0 || attachment.fileSize > 15 * 1024 * 1024))) {
    throw Object.assign(new Error("Invalid site activity attachment metadata."), { status: 422 });
  }
  return {
    fileName: attachment.fileName,
    objectPath: attachment.objectPath,
    mimeType: attachment.mimeType ?? null,
    fileSize: attachment.fileSize ?? null,
  };
}

/**
 * Reconcile activity rows by their explicit persisted identity. New staff picks
 * must be active; already-linked inactive people remain attached and visible.
 */
export async function reconcileDprSiteActivities(
  tx: any,
  dprId: number,
  inputs: any[] | undefined,
  currentRows?: any[],
) {
  if (inputs === undefined) return currentRows ?? await readDprSiteActivities(tx, dprId);
  const existing = currentRows ?? await readDprSiteActivities(tx, dprId);
  const existingById = new Map(existing.map((row: any) => [Number(row.id), row]));
  const used = new Set<number>();
  const savedRows: any[] = [];

  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index];
    const persistedId = input.persistedId == null ? null : Number(input.persistedId);
    const saved = persistedId == null ? undefined : existingById.get(persistedId);
    if (persistedId != null && !saved) {
      throw Object.assign(new Error("A site activity no longer belongs to this DPR. Reload before saving."), { status: 409 });
    }
    if (persistedId == null) {
      const hasValue = activityColumns.some(column =>
        !["activityType", "sortOrder"].includes(column)
        && input[column] != null
        && input[column] !== "",
      ) || (input.personnelIds ?? []).length > 0
        || !!input.attachment?.objectPath;
      if (!hasValue) continue;
    }
    if (persistedId != null) used.add(persistedId);
    const values: Record<string, any> = {};
    for (const column of activityColumns) {
      if (column === "sortOrder") values.sortOrder = index;
      else if (input[column] !== undefined) values[column] = input[column] === "" ? null : input[column];
    }
    values.resultPass = calculateSiteActivityResult(input.resultValue, input.requiredValue);
    Object.assign(values, attachmentValues(input));
    values.updatedAt = new Date();

    const [row] = saved
      ? await tx.update(dprSiteActivities).set(values)
        .where(and(eq(dprSiteActivities.id, persistedId!), eq(dprSiteActivities.dprId, dprId))).returning()
      : await tx.insert(dprSiteActivities).values({ ...values, dprId }).returning();
    if (!row) throw Object.assign(new Error("A site activity could not be saved. Reload and try again."), { status: 409 });
    savedRows.push(row);

    const requestedIds: number[] = Array.from(new Set<number>(
      (Array.isArray(input.personnelIds) ? input.personnelIds : []).map((value: unknown) => Number(value)),
    ));
    if (requestedIds.some((id: number) => !Number.isInteger(id) || id <= 0)) {
      throw Object.assign(new Error("Choose valid site staff for this activity."), { status: 422 });
    }
    const oldLinks: any[] = saved
      ? await tx.select().from(dprSiteActivityStaff).where(eq(dprSiteActivityStaff.siteActivityId, row.id))
      : [];
    const priorIds = new Set<number>(oldLinks.map((link: any) => Number(link.personnelId)));
    const personnelRows: any[] = requestedIds.length
      ? await tx.select().from(personnel).where(inArray(personnel.id, requestedIds))
      : [];
    if (personnelRows.length !== requestedIds.length) {
      throw Object.assign(new Error("One or more selected staff members no longer exist."), { status: 422 });
    }
    if (personnelRows.some((person: any) => !priorIds.has(Number(person.id)) && Number(person.isActive ?? 1) === 0)) {
      throw Object.assign(new Error("Inactive staff can remain on saved activities but cannot be newly selected."), { status: 422 });
    }
    const removed = oldLinks.filter((link: any) => !requestedIds.includes(Number(link.personnelId))).map((link: any) => link.id);
    if (removed.length) await tx.delete(dprSiteActivityStaff).where(inArray(dprSiteActivityStaff.id, removed));
    const added: number[] = requestedIds.filter((id: number) => !priorIds.has(id));
    if (added.length) await tx.insert(dprSiteActivityStaff).values(added.map((personnelId: number) => ({
      siteActivityId: row.id,
      personnelId,
    })));
  }

  const removedIds = existing.filter((row: any) => !used.has(Number(row.id))).map((row: any) => row.id);
  if (removedIds.length) await tx.delete(dprSiteActivities).where(inArray(dprSiteActivities.id, removedIds));
  return savedRows;
}
