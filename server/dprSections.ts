import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { dprs, sites, sitePurchases, progressEntries, equipmentLogs, equipmentMaintenanceLogs, labourLogs, materialLogs, dprStructureItems,
  activityPersonnel, cutFillConsumptions, equipmentActivityAllocations, equipmentActivitySegments, dprDraftStoppages,
  equipmentActivitySegmentBoqItems, createDprRequestSchema } from "../shared/schema";
import { DPR_SECTIONS, normalizeDprSectionContext, pickDprSectionPayload,
  dprSectionStates, type DprSection, type DprSectionContext, type DprSectionSnapshot } from "../shared/dprSections";
import { meaningfulEquipmentRows } from "../shared/equipmentUsage";
import { resolveEquipmentAllocationParentHours, validateEquipmentActivityAllocations, validateEquipmentActivitySegments } from "../shared/equipmentActivityAllocations";
import { hasDprBoqReferences } from "../shared/dprBoqReferences";
import { isEvidenceBasedDprNullProjectRecovery } from "../shared/dprBoqSelection";

export class DprSectionConflict extends Error {
  code = "DPR_SECTION_CONFLICT";
  status = 409;
  constructor(message = "This DPR changed. Reload its saved sections before saving again.") { super(message); }
}
function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
export const contentToken = (value: any) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const sameContext = (a: any, b: any) => contentToken(normalizeDprSectionContext(a)) === contentToken(normalizeDprSectionContext(b));
export const activeDraft = (row: any) => row?.dprStatus === "draft" && !row.isDeleted && !row.isCancelled && !row.isSuperseded;
export async function lockDprIdentity(tx: any, context: any) {
  const key = contentToken(normalizeDprSectionContext(context));
  await tx.execute(sql`SELECT pg_advisory_xact_lock(1437, hashtext(${key}))`);
}
export async function findSectionDrafts(tx: any, context: DprSectionContext) {
  const rows = await tx.select().from(dprs).where(and(eq(dprs.date, context.date), eq(dprs.dprStatus, "draft")));
  return rows.filter((row: any) => activeDraft(row) && sameContext(row, context));
}
export async function readDraftStoppages(tx: any, equipmentIds: number[]) {
  const rows = equipmentIds.length ? await tx.select().from(dprDraftStoppages)
    .where(inArray(dprDraftStoppages.equipmentLogId, equipmentIds)) : [];
  return rows.sort((a: any, b: any) => a.id - b.id).map((row: any) => ({
    equipmentLogId: row.equipmentLogId,
    breakdown: {
      clientKey: row.clientKey, maintenanceLogId: row.maintenanceLogId ?? undefined,
      fromTime: row.fromTime ?? undefined, toTime: row.toTime ?? undefined,
      description: row.description ?? undefined, responsibility: row.responsibility ?? undefined,
      repairScope: row.repairScope ?? undefined, debitableToVendor: row.debitableToVendor ?? undefined,
      remarks: row.remarks ?? undefined,
      ...(row.objectPath ? { attachment: { fileName: row.fileName, objectPath: row.objectPath,
        mimeType: row.mimeType ?? undefined, fileSize: row.fileSize ?? undefined } } : {}),
    },
  }));
}
export async function stageDraftStoppages(tx: any, rows: any[], inputs: any[]) {
  for (let index = 0; index < rows.length; index++) {
    const input = inputs[index];
    if (!Array.isArray(input?.breakdowns)) continue;
    // The approved staging shape has no deletion intent/tombstone. Refuse an
    // operational removal rather than report success and resurrect it on GET.
    const linked = await tx.select().from(equipmentMaintenanceLogs).where(and(
      eq(equipmentMaintenanceLogs.sourceType, "dpr_log"),
      eq(equipmentMaintenanceLogs.sourceRecordId, rows[index].id),
      eq(equipmentMaintenanceLogs.isCancelled, false), eq(equipmentMaintenanceLogs.isDeleted, false),
    ));
    if (linked.some((record: any) => !input.breakdowns.some((b: any) => b.maintenanceLogId === record.id))) {
      throw new DprSectionConflict("Existing operational maintenance cannot be removed through a draft. Use the maintenance workflow.");
    }
    const keys = new Set<string>();
    for (const breakdown of input.breakdowns) {
      if (keys.has(breakdown.clientKey)) throw Object.assign(new Error("Duplicate stoppage client key."), { status: 422 });
      keys.add(breakdown.clientKey);
      if (breakdown.maintenanceLogId != null) {
        const [linked] = await tx.select().from(equipmentMaintenanceLogs).where(and(
          eq(equipmentMaintenanceLogs.id, breakdown.maintenanceLogId),
          eq(equipmentMaintenanceLogs.sourceType, "dpr_log"),
          eq(equipmentMaintenanceLogs.sourceRecordId, input.persistedId ?? rows[index].id),
          eq(equipmentMaintenanceLogs.isCancelled, false), eq(equipmentMaintenanceLogs.isDeleted, false),
        ));
        if (!linked) throw new DprSectionConflict("Stoppage does not belong to this equipment row.");
      }
      const attachment = breakdown.attachment;
      if (attachment && (!attachment.objectPath.startsWith("/objects/") ||
        (attachment.mimeType && !["image/", "application/pdf"].some(prefix => attachment.mimeType.startsWith(prefix))) ||
        (attachment.fileSize != null && attachment.fileSize > 15 * 1024 * 1024))) {
        throw Object.assign(new Error("Invalid breakdown attachment metadata."), { status: 422 });
      }
    }
    await tx.delete(dprDraftStoppages).where(eq(dprDraftStoppages.equipmentLogId, rows[index].id));
    if (input.breakdowns.length) await tx.insert(dprDraftStoppages).values(input.breakdowns.map((breakdown: any) => {
      const { attachment, ...fields } = breakdown;
      return { ...fields, ...attachment, equipmentLogId: rows[index].id };
    }));
  }
}
export async function readSectionAggregate(tx: any, id: number) {
  const dpr = await tx.query.dprs.findFirst({ where: eq(dprs.id, id), with: {
    progress: true, equipment: { with: { activityAllocations: true, activitySegments: { with: { boqItems: true } } } },
    labour: true, materials: true, structureItems: true, sitePurchases: true,
  } });
  if (!dpr) return undefined;
  for (const key of ["progress", "equipment", "labour", "materials", "structureItems", "sitePurchases"]) {
    dpr[key].sort((a: any, b: any) => a.id - b.id);
    dpr[key] = dpr[key].map((row: any) => ({ ...row, persistedId: row.id }));
  }
  for (const row of dpr.equipment) {
    if (row.activitySegments.length) {
      row.activitySegments.sort((a: any, b: any) => a.id - b.id);
      row.activitySegments = row.activitySegments.map((s: any) => ({ ...s, persistedId: s.id,
        boqItems: s.boqItems.sort((a: any, b: any) => a.id - b.id).map((b: any) => ({ ...b, persistedId: b.id })) }));
      delete row.activityAllocations;
    } else if (row.activityAllocations.length) {
      row.activityAllocations = row.activityAllocations.sort((a: any, b: any) => a.id - b.id)
        .map((a: any) => ({ ...a, persistedId: a.id }));
      delete row.activitySegments;
    } else { delete row.activitySegments; delete row.activityAllocations; }
  }
  const equipmentIds = dpr.equipment.map((row: any) => row.id);
  const breakdowns = equipmentIds.length ? await tx.select().from(equipmentMaintenanceLogs).where(and(
    eq(equipmentMaintenanceLogs.sourceType, "dpr_log"), inArray(equipmentMaintenanceLogs.sourceRecordId, equipmentIds),
    eq(equipmentMaintenanceLogs.isCancelled, false), eq(equipmentMaintenanceLogs.isDeleted, false),
  )) : [];
  for (const row of dpr.equipment) row.breakdowns = breakdowns.filter((b: any) => b.sourceRecordId === row.id)
    .sort((a: any, b: any) => a.id - b.id).map((b: any) => ({
      clientKey: `maintenance-${b.id}`, maintenanceLogId: b.id, fromTime: b.fromTime ?? "", toTime: b.toTime ?? "",
      description: b.description, responsibility: b.responsibility ?? "", repairScope: b.repairScope ?? "",
      debitableToVendor: !!b.debitableToVendor, remarks: b.remarks ?? "",
    }));
  if (dpr.dprStatus === "draft") {
    const staged = await readDraftStoppages(tx, equipmentIds);
    for (const row of dpr.equipment) {
      const own = staged.filter((s: any) => s.equipmentLogId === row.id).map((s: any) => s.breakdown);
      row.breakdowns = [...row.breakdowns.filter((b: any) => !own.some((s: any) => s.maintenanceLogId === b.maintenanceLogId)), ...own];
    }
  }
  const ids = dpr.progress.map((r: any) => r.id);
  const personnel = ids.length ? await tx.select().from(activityPersonnel).where(inArray(activityPersonnel.progressEntryId, ids)) : [];
  dpr.progress.forEach((r: any) => { r.personnelIds = personnel.filter((p: any) => p.progressEntryId === r.id).map((p: any) => p.personnelId).sort((a: number, b: number) => a - b); });
  const links = ids.length ? await tx.select({
    fillEntryKey: progressEntries.entryKey, sourceEntryKey: sql`source.entry_key`,
    openingBalanceId: cutFillConsumptions.openingBalanceId, quantity: cutFillConsumptions.quantity,
  }).from(cutFillConsumptions).innerJoin(progressEntries, eq(progressEntries.id, cutFillConsumptions.fillProgressEntryId))
    .leftJoin(sql`progress_entries source`, sql`source.id = ${cutFillConsumptions.sourceProgressEntryId}`)
    .where(inArray(cutFillConsumptions.fillProgressEntryId, ids)) : [];
  dpr.cutFillConsumptions = links.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return dpr;
}
export function sectionSnapshot(dpr: any): DprSectionSnapshot {
  return {
    dpr, context: normalizeDprSectionContext(dpr),
    headerToken: contentToken({ context: normalizeDprSectionContext(dpr), engineer: dpr.engineer,
      status: dpr.dprStatus, deleted: dpr.isDeleted, cancelled: dpr.isCancelled, superseded: dpr.isSuperseded }),
    sectionTokens: Object.fromEntries(DPR_SECTIONS.map(section => [section, contentToken(pickDprSectionPayload(section, dpr))])) as Record<DprSection, string>,
    sections: dprSectionStates(dpr),
  };
}
export function assertSectionTokens(snapshot: DprSectionSnapshot, expected: any, sections: readonly DprSection[] = DPR_SECTIONS) {
  if (!activeDraft(snapshot.dpr) || expected?.headerToken !== snapshot.headerToken
    || sections.some(section => expected?.sectionTokens?.[section] !== snapshot.sectionTokens[section])) throw new DprSectionConflict();
}

// Reconcile only owned rows. In-place updates retain serial identities, photo
// entry keys and references from other DPRs. Never delete another section.
export async function reconcileRows(tx: any, table: any, id: number, old: any[], incoming: any[], transform?: (row: any, saved?: any) => Promise<any>, ownerKey = "dprId") {
  const used = new Set<number>();
  const result: any[] = [];
  for (const input of incoming) {
    const reference = input.persistedId ?? input.id;
    const saved = reference != null ? old.find(row => row.id === reference)
      : input.entryKey ? old.find(row => row.entryKey === input.entryKey) : undefined;
    if (reference != null && !saved) throw new DprSectionConflict("A saved row no longer belongs to this DPR.");
    if (saved && used.has(saved.id)) throw new DprSectionConflict("Duplicate saved row reference.");
    const { id: _id, dprId: _dprId, persistedId: _persistedId, personnelIds: _personnel, uomOverrideReason: _reason, createdAt: _createdAt, ...data } = input;
    delete data[ownerKey];
    const values = transform ? await transform(data, saved) : data;
    const [row] = saved
      ? await tx.update(table).set(values).where(and(eq(table.id, saved.id), eq(table[ownerKey], id))).returning()
      : await tx.insert(table).values({ ...values, [ownerKey]: id }).returning();
    used.add(row.id);
    result.push(row);
  }
  const removed = old.filter(row => !used.has(row.id)).map(row => row.id);
  if (removed.length) {
    if (table === equipmentLogs) {
      const references = await tx.select().from(equipmentMaintenanceLogs).where(and(
        eq(equipmentMaintenanceLogs.sourceType, "dpr_log"), inArray(equipmentMaintenanceLogs.sourceRecordId, removed),
        eq(equipmentMaintenanceLogs.isCancelled, false), eq(equipmentMaintenanceLogs.isDeleted, false),
      ));
      if (references.length) throw new DprSectionConflict("Equipment with linked maintenance records cannot be removed through a draft section.");
    }
    if (table === progressEntries) {
      const references = await tx.select().from(cutFillConsumptions).where(inArray(cutFillConsumptions.sourceProgressEntryId, removed));
      if (references.length) throw new DprSectionConflict("An activity is referenced by cut/fill records. Keep that activity instead of removing it.");
      await tx.delete(activityPersonnel).where(inArray(activityPersonnel.progressEntryId, removed));
      await tx.delete(cutFillConsumptions).where(inArray(cutFillConsumptions.fillProgressEntryId, removed));
    }
    await tx.delete(table).where(inArray(table.id, removed));
  }
  return result;
}

export async function reconcileDraftEquipmentAssignments(tx: any, rows: any[], inputs: any[]) {
  for (let i = 0; i < rows.length; i++) {
    const input = inputs[i];
    if (input?._preserveActivityAssignment ||
      (input?.activityAllocations === undefined && input?.activitySegments === undefined)) continue;
    const row = rows[i];
    const segmentsExplicit = Array.isArray(input.activitySegments)
      && (input.activitySegments.length > 0 || !Array.isArray(input.activityAllocations));
    if (segmentsExplicit) {
      const oldSegments = await tx.select().from(equipmentActivitySegments).where(eq(equipmentActivitySegments.equipmentLogId, row.id));
      const oldLinks = oldSegments.length ? await tx.select().from(equipmentActivitySegmentBoqItems)
        .where(inArray(equipmentActivitySegmentBoqItems.segmentId, oldSegments.map((s: any) => s.id))) : [];
      await tx.delete(equipmentActivityAllocations).where(eq(equipmentActivityAllocations.equipmentLogId, row.id));
      const segments = validateEquipmentActivitySegments(input.activitySegments, resolveEquipmentAllocationParentHours(row), row).segments;
      const savedSegments = await reconcileRows(tx, equipmentActivitySegments, row.id, oldSegments,
        segments.map((segment, index) => {
          const { boqItems, ...fields } = segment;
          return { ...fields, persistedId: input.activitySegments[index].persistedId ?? input.activitySegments[index].id };
        }), undefined, "equipmentLogId");
      for (let index = 0; index < savedSegments.length; index++) {
        await reconcileRows(tx, equipmentActivitySegmentBoqItems, savedSegments[index].id,
          oldLinks.filter((link: any) => link.segmentId === savedSegments[index].id),
          segments[index].boqItems.map((item, itemIndex) => ({
            ...item, persistedId: input.activitySegments[index].boqItems[itemIndex].persistedId ?? input.activitySegments[index].boqItems[itemIndex].id,
          })), undefined, "segmentId");
      }
    } else {
      const oldAllocations = await tx.select().from(equipmentActivityAllocations).where(eq(equipmentActivityAllocations.equipmentLogId, row.id));
      await tx.delete(equipmentActivitySegments).where(eq(equipmentActivitySegments.equipmentLogId, row.id));
      const allocations = validateEquipmentActivityAllocations(input.activityAllocations, resolveEquipmentAllocationParentHours(row), row).allocations;
      await reconcileRows(tx, equipmentActivityAllocations, row.id, oldAllocations,
        allocations.map((allocation, index) => ({
          ...allocation, persistedId: input.activityAllocations[index].persistedId ?? input.activityAllocations[index].id,
        })), undefined, "equipmentLogId");
    }
  }
}

export async function saveDprSection(database: any, storage: any, request: any, actorId: number | null,
  validate: (input: any, id: number) => Promise<void>, scopeToken?: string | null) {
  const { section, context, dprId } = request;
  return database.transaction(async (tx: any) => {
    // Discover the old identity before locking; never acquire another project
    // after a header lock. The locked reread/token check below is authoritative.
    const [optimistic] = dprId ? await tx.select().from(dprs).where(eq(dprs.id, dprId)) : [];
    let project: any;
    if (context.boqProjectId != null) {
      project = await storage.lockProjectAndCheckScopeTx(tx, context.boqProjectId, scopeToken);
      if (!project) throw new DprSectionConflict("Project no longer exists.");
      const [site] = project.siteId == null ? [] : await tx.select().from(sites).where(eq(sites.id, project.siteId));
      if (!site || normalizeDprSectionContext({ ...context, site: site.name }).site !== context.site) {
        throw Object.assign(new Error("The selected project does not belong to this DPR site."), { status: 403 });
      }
    }
    const identities = [context];
    if (optimistic && optimistic.boqProjectId == null && context.boqProjectId != null) identities.push({ ...context, boqProjectId: null });
    identities.sort((a, b) => contentToken(normalizeDprSectionContext(a)).localeCompare(contentToken(normalizeDprSectionContext(b))));
    for (const identity of identities) await lockDprIdentity(tx, identity);
    let id = dprId;
    let created = false;
    if (!id) {
      const candidates = await findSectionDrafts(tx, context);
      if (candidates.length > 1) throw new DprSectionConflict("Multiple drafts exist. Choose the draft explicitly.");
      id = candidates[0]?.id;
      if (!id) {
        const [header] = await tx.insert(dprs).values({ ...context, site: context.site.toUpperCase(),
          engineer: request.data.engineer.toUpperCase(), dprStatus: "draft", authorUserId: actorId,
          submittedAt: null, lastEditedAt: new Date(), lastEditedByUserId: actorId }).returning();
        id = header.id; created = true;
      }
    }
    await tx.select().from(dprs).where(eq(dprs.id, id)).for("update");
    const old = await readSectionAggregate(tx, id);
    if (!old || !activeDraft(old)) throw new DprSectionConflict("The selected DPR is no longer an active draft in this context.");
    const snapshot = sectionSnapshot(old);
    if (dprId) assertSectionTokens(snapshot, { headerToken: request.headerToken, sectionTokens: { [section]: request.sectionToken } }, [section]);
    else if (!created && snapshot.sections[section as DprSection].state !== "empty") {
      throw new DprSectionConflict("This section was already saved. Open its saved draft before editing.");
    }
    const owned = pickDprSectionPayload(section, request.data);
    const input = createDprRequestSchema.parse({ ...old, ...owned, boqProjectId: context.boqProjectId, dprStatus: "draft" });
    const recoveringProject = !sameContext(old, context) && isEvidenceBasedDprNullProjectRecovery({
      savedProjectId: old.boqProjectId,
      requestedProjectId: context.boqProjectId,
      sameSite: sameContext({ ...old, boqProjectId: context.boqProjectId }, context),
      hasBoqReferences: hasDprBoqReferences(input),
    });
    if (!sameContext(old, context) && !recoveringProject) throw new DprSectionConflict("The selected DPR context cannot be changed.");
    if (recoveringProject) {
      const matchingSites = (await tx.select().from(sites)).filter((site: any) =>
        normalizeDprSectionContext({ ...context, site: site.name }).site === context.site);
      if (matchingSites.length !== 1 || matchingSites[0].id !== project?.siteId) {
        throw new DprSectionConflict("Project recovery requires one unambiguous matching site.");
      }
      const candidates = await findSectionDrafts(tx, context);
      if (candidates.some((row: any) => row.id !== id)) throw new DprSectionConflict("Another draft already uses this project context. Choose explicitly.");
      // Validate every old link too, including rows removed from the payload.
      const persistedIds = await storage.getPersistedDprBoqItemIdsTx(tx, id);
      await storage.assertBoqItemIdsBelongToProjectTx(tx, id, context.boqProjectId, persistedIds);
    }
    await validate(input, id);
    if (!dprId && dprSectionStates(input)[section as DprSection].state === "empty") {
      throw Object.assign(new Error("Enter at least one meaningful row before saving a new DPR section."), { status: 422 });
    }
    await storage.assertDprProjectLinksTx(tx, id, context.boqProjectId, input, input.equipment);
    if (section === "activity") {
      const progress = await reconcileRows(tx, progressEntries, id, old.progress, input.progress ?? [], async (row, saved) => {
        if (saved?.entryKey && row.entryKey !== saved.entryKey) throw new DprSectionConflict("A saved activity's photo/reference key cannot change.");
        return row;
      });
      if (progress.length) {
        await tx.delete(cutFillConsumptions).where(inArray(cutFillConsumptions.fillProgressEntryId, progress.map(r => r.id)));
      }
      for (let i = 0; i < progress.length; i++) {
        const ids = input.progress?.[i]?.personnelIds ?? [];
        const oldPersonnel = await tx.select().from(activityPersonnel).where(eq(activityPersonnel.progressEntryId, progress[i].id));
        const removed = oldPersonnel.filter((row: any) => !ids.includes(row.personnelId)).map((row: any) => row.id);
        if (removed.length) await tx.delete(activityPersonnel).where(inArray(activityPersonnel.id, removed));
        const added = [...new Set(ids)].filter(personnelId => !oldPersonnel.some((row: any) => row.personnelId === personnelId));
        if (added.length) await tx.insert(activityPersonnel).values(added.map(personnelId => ({ progressEntryId: progress[i].id, personnelId })));
      }
      await storage.persistCutFillConsumptionsTx(tx, { ...old, boqProjectId: context.boqProjectId }, progress, input, [id]);
      await reconcileRows(tx, dprStructureItems, id, old.structureItems, input.structureItems ?? []);
    } else if (section === "equipment") {
      const incoming = meaningfulEquipmentRows(input.equipment as any[]);
      storage.assertValidDprEquipmentDieselSources(incoming);
      const preserved = await storage.preserveOmittedEquipmentAllocationsTx(tx, old.equipment, incoming);
      const normalized = await storage.normaliseDprEquipmentRowsTx(tx, preserved, context.boqProjectId);
      const rows = await reconcileRows(tx, equipmentLogs, id, old.equipment, normalized.map((r: any, i: number) => ({ ...r, persistedId: incoming[i].persistedId })));
      await stageDraftStoppages(tx, rows, incoming);
      await reconcileDraftEquipmentAssignments(tx, rows, incoming);
    } else {
      const table = section === "labour" ? labourLogs : materialLogs;
      await reconcileRows(tx, table, id, old[section], (input as any)[section] ?? []);
      if (section === "materials") {
        await reconcileRows(tx, sitePurchases, id, old.sitePurchases, input.sitePurchases ?? [], async row => ({
          ...row, documentStatus: "draft",
        }));
      }
    }
    await tx.update(dprs).set({ lastEditedAt: new Date(), lastEditedByUserId: actorId,
      ...(recoveringProject ? { boqProjectId: context.boqProjectId } : {}),
      ...(section === "activity" ? { remarks: input.remarks ?? null } : {}) }).where(eq(dprs.id, id));
    return sectionSnapshot(await readSectionAggregate(tx, id));
  });
}