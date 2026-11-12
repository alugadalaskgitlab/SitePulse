import { createHash, randomUUID } from "node:crypto";
import { createInsertSchema } from "drizzle-zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  dprs, progressEntries, equipmentLogs, labourLogs, materialLogs, sitePurchases,
  dprStructureItems, auditLogs, editPermissionRequests, equipmentMaintenanceLogs,
  cutFillConsumptions, vendorBillItems, vendorBills, equipmentMaster, equipmentActivitySegments,
  equipmentActivitySegmentBoqItems, equipmentActivityAllocations, boqItems, workProgramBars,
} from "../shared/schema";
import { readWorkerNames, replaceLabourWorkers } from "./labourWorkers";
import { correctionError, correctionFields, needsApproval, planDprCorrection } from "./dprCorrectionPlan";
import { calculateLengthFromChainage, geometryQtyForRow } from "../shared/dprGeometry";
import { parseChainageKm } from "../shared/barSide";

const tables: Record<string, any> = { header: dprs, progress: progressEntries, equipment: equipmentLogs, labour: labourLogs, materials: materialLogs, sitePurchases, structureItems: dprStructureItems };
export const correctionHash = (value: any) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Actor = { id: number; isAdmin?: boolean; isOwner?: boolean; fullName?: string; username?: string };
type Validate = (candidate: any, saved: any, changes: any[], actor: Actor, tx: any) => Promise<void>;
const name = (actor: Actor) => actor.fullName || actor.username || `User ${actor.id}`;
const reasonText = (value: any) => {
  if (typeof value !== "string" || value.trim().length < 10 || value.length > 2000) correctionError("Enter a correction/review reason of 10–2000 characters.", 400);
  return value.trim();
};
const checkActor = (actor: Actor) => { if (!Number.isInteger(actor?.id)) correctionError("Authentication required.", 401); };
const ownerDirectProgressFields = new Set([
  "chainageFrom", "chainageTo", "side", "width", "thickness", "length", "quantity",
  "boqItemId", "isIncidental", "reworkNoNewMaterial", "split",
]);
const ownerCanApplyDirectly = (actor: Actor, review: any) => actor.isOwner === true
  && review.requiresApproval
  && review.changes.filter((change: any) => change.requiresApproval).every((change: any) =>
    change.section === "progress" && (
      ownerDirectProgressFields.has(change.field)
      || change.derived === true && ["length", "quantity", "quantitySource"].includes(change.field)
    ));

/** Extends submitted-DPR editing using existing edit requests and audit history.
 * No new tables, migration, financial writers or equipment finalizer. */
export function dprCorrectionService(database: any, validate: Validate) {
  async function load(tx: any, id: number, lock = false) {
    if (lock) {
      await tx.execute(sql`SELECT id FROM boq_projects WHERE id = (SELECT boq_project_id FROM dprs WHERE id=${id}) FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM dprs WHERE id=${id} FOR UPDATE`);
      for (const table of Object.values(tables).filter(t => t !== dprs)) {
        await tx.select({ id: table.id }).from(table).where(eq(table.dprId, id)).orderBy(table.id).for("update");
      }
    }
    const saved = await tx.query.dprs.findFirst({
      where: eq(dprs.id, id),
      with: {
        progress: { orderBy: asc(progressEntries.id) },
        equipment: { orderBy: asc(equipmentLogs.id), with: { activitySegments: { with: { boqItems: true } }, activityAllocations: true } },
        labour: { orderBy: asc(labourLogs.id) }, materials: { orderBy: asc(materialLogs.id) },
        sitePurchases: { orderBy: asc(sitePurchases.id) }, structureItems: { orderBy: asc(dprStructureItems.id) },
      },
    });
    if (!saved) correctionError("DPR not found.", 404);
    saved.labour = await readWorkerNames(tx, saved.labour);
    const masterIds = saved.equipment.map((e: any) => e.equipmentId).filter((id: any) => id != null);
    saved.correctionEquipmentMasters = masterIds.length ? await tx.select().from(equipmentMaster).where(inArray(equipmentMaster.id, masterIds)).orderBy(equipmentMaster.id) : [];
    const equipmentIds = saved.equipment.map((e: any) => e.id);
    const breakdowns = equipmentIds.length ? await tx.select().from(equipmentMaintenanceLogs).where(and(
      eq(equipmentMaintenanceLogs.sourceType, "dpr_log"), inArray(equipmentMaintenanceLogs.sourceRecordId, equipmentIds),
      eq(equipmentMaintenanceLogs.isCancelled, false), eq(equipmentMaintenanceLogs.isDeleted, false),
    )).orderBy(equipmentMaintenanceLogs.id) : [];
    for (const row of saved.equipment) {
      if (row.activitySegments?.length) row.activityAllocations = undefined;
      else if (row.activityAllocations?.length) row.activitySegments = undefined;
      else { row.activitySegments = undefined; row.activityAllocations = undefined; }
      row.breakdowns = breakdowns.filter((b: any) => b.sourceRecordId === row.id).map((b: any) => ({
        clientKey: `maintenance-${b.id}`, maintenanceLogId: b.id, fromTime: b.fromTime ?? "", toTime: b.toTime ?? "",
        description: b.description, responsibility: b.responsibility ?? "", repairScope: b.repairScope ?? "",
        debitableToVendor: !!b.debitableToVendor, remarks: b.remarks ?? "",
      }));
    }
    // Cut/fill links must not disappear when editing an unrelated field.
    const ids = saved.progress.map((p: any) => p.id);
    const links = ids.length ? await tx.select().from(cutFillConsumptions).where(inArray(cutFillConsumptions.fillProgressEntryId, ids)).orderBy(cutFillConsumptions.id) : [];
    saved.correctionCutFillLinks = links;
    saved.correctionCutFillSourceLinks = ids.length ? await tx.select().from(cutFillConsumptions).where(inArray(cutFillConsumptions.sourceProgressEntryId, ids)).orderBy(cutFillConsumptions.id) : [];
    const sourceIds = Array.from(new Set<number>(links.map((l: any) => l.sourceProgressEntryId).filter((id: any) => id != null)));
    const sources = sourceIds.length ? await tx.select({ id: progressEntries.id, entryKey: progressEntries.entryKey }).from(progressEntries).where(inArray(progressEntries.id, sourceIds)) : [];
    for (const row of saved.progress) row.allocations = links.filter((l: any) => l.fillProgressEntryId === row.id).map((l: any) => ({
      sourceKey: l.sourceProgressEntryId != null ? `progress:${sources.find((s: any) => s.id === l.sourceProgressEntryId)?.entryKey}` : `opening:${l.openingBalanceId}`,
      sourceEntryKey: sources.find((s: any) => s.id === l.sourceProgressEntryId)?.entryKey ?? null,
      openingBalanceId: l.openingBalanceId ?? null, quantity: Number(l.quantity),
    }));
    const history = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(
      eq(auditLogs.module, "dpr"), eq(auditLogs.transactionId, id), eq(auditLogs.action, "correction_applied"),
    )).orderBy(auditLogs.id);
    saved.correctionRevision = history.length;
    return saved;
  }
  async function review(tx: any, saved: any, form: any, actor: Actor) {
    const plan = planDprCorrection(saved, form);
    const setDerived = (row: any, field: string, value: any) => {
      const old = saved.progress.find((p: any) => p.id === row.id);
      if (value == null) return;
      row[field] = value;
      let patch = plan.patches.progress.find(p => p.id === row.id);
      if (!patch) { patch = { id: row.id, values: {} }; plan.patches.progress.push(patch); }
      patch.values[field] = value;
      const existing = plan.changes.find(c => c.section === "progress" && c.rowId === row.id && c.field === field);
      if (existing) { existing.newValue = value; existing.derived = true; }
      else if (old[field] !== value) plan.changes.push({ section: "progress", rowId: row.id, field, oldValue: old[field] ?? null, newValue: value, requiresApproval: needsApproval("progress", field), derived: true });
    };
    for (const row of plan.candidate.progress) {
      const fields = plan.changes.filter(c => c.section === "progress" && c.rowId === row.id).map(c => c.field);
      if (!fields.some(f => ["chainageFrom", "chainageTo", "length", "width", "thickness", "boqItemId"].includes(f)) || row.noSiteWork) continue;
      if (fields.some(f => ["chainageFrom", "chainageTo"].includes(f)) && !row.lengthOverrideReason?.trim()) {
        setDerived(row, "length", calculateLengthFromChainage(row.chainageFrom ?? "", row.chainageTo ?? ""));
      }
      const item = row.boqItemId != null ? (await tx.select().from(boqItems).where(eq(boqItems.id, row.boqItemId)))[0] : undefined;
      const qty = geometryQtyForRow(row, item ?? { unit: row.uom });
      if (qty != null && row.quantitySource !== "manual") {
        setDerived(row, "quantity", qty);
        setDerived(row, "quantitySource", "calculated");
      }
    }
    const splitSpec = form.splitProgress;
    if (splitSpec != null) {
      const sourceId = Number(splitSpec.sourcePersistedId);
      const source = plan.candidate.progress.find((row: any) => Number(row.id) === sourceId);
      const original = saved.progress.find((row: any) => Number(row.id) === sourceId);
      if (actor.isOwner !== true) {
        plan.blocked.push({ section: "progress", rowId: sourceId, field: "split", message: "Only the Owner can split a submitted DPR line directly." });
      } else if (!source || !original || typeof splitSpec.splitAt !== "string") {
        plan.blocked.push({ section: "progress", rowId: sourceId, field: "split", message: "Choose a saved work line and enter a split chainage." });
      } else if ([...saved.correctionCutFillLinks, ...saved.correctionCutFillSourceLinks]
        .some((link: any) => link.fillProgressEntryId === sourceId || link.sourceProgressEntryId === sourceId)) {
        plan.blocked.push({ section: "progress", rowId: sourceId, field: "split", message: "This line is linked to the cut/fill ledger and cannot be split here." });
      } else {
        const from = parseChainageKm(source.chainageFrom);
        const to = parseChainageKm(source.chainageTo);
        const splitAt = parseChainageKm(splitSpec.splitAt);
        if (from == null || to == null || splitAt == null || splitAt <= from || splitAt >= to) {
          plan.blocked.push({ section: "progress", rowId: sourceId, field: "split", message: "Split chainage must be strictly inside the saved line's chainage range." });
        } else {
          const oldTo = source.chainageTo;
          const oldLength = Number(source.length);
          const totalQty = Number(source.quantity);
          const splitText = splitSpec.splitAt.trim();
          const firstLength = calculateLengthFromChainage(source.chainageFrom ?? "", splitText);
          source.chainageTo = splitText;
          source.chainageToKm = splitAt;
          source.length = firstLength ?? (Number.isFinite(oldLength) ? oldLength * (splitAt - from) / (to - from) : null);
          const item = source.boqItemId == null
            ? undefined
            : (await tx.select().from(boqItems).where(eq(boqItems.id, source.boqItemId)))[0];
          const calculatedQty = source.quantitySource === "manual" ? null : geometryQtyForRow(source, item ?? { unit: source.uom });
          const firstQty = calculatedQty ?? (Number.isFinite(totalQty) ? totalQty * (splitAt - from) / (to - from) : null);
          const secondLength = Number.isFinite(oldLength) && source.length != null
            ? Math.max(0, oldLength - Number(source.length))
            : calculateLengthFromChainage(splitText, oldTo ?? "");
          const secondQty = Number.isFinite(totalQty) && firstQty != null
            ? Math.max(0, totalQty - firstQty)
            : null;
          if (firstQty == null || secondQty == null) {
            plan.blocked.push({ section: "progress", rowId: sourceId, field: "split", message: "The line quantity cannot be divided safely; enter valid chainage or quantity first." });
          } else {
            source.quantity = firstQty;
            const newRow: any = { ...source };
            delete newRow.id;
            delete newRow.persistedId;
            delete newRow.allocations;
            newRow.entryKey = randomUUID();
            newRow.chainageFrom = splitText;
            newRow.chainageFromKm = splitAt;
            newRow.chainageTo = oldTo;
            newRow.chainageToKm = parseChainageKm(oldTo);
            newRow.length = secondLength;
            newRow.quantity = secondQty;
            newRow.noSiteWork = false;
            newRow.noSiteWorkDescription = null;
            newRow.isIncidental = splitSpec.secondIsIncidental === true;
            newRow.incidentalDescription = newRow.isIncidental
              ? String(splitSpec.secondIncidentalDescription ?? "").trim()
              : null;
            newRow.reworkNoNewMaterial = newRow.isIncidental && splitSpec.secondReworkNoNewMaterial === true;
            if (newRow.isIncidental && !newRow.incidentalDescription) {
              plan.blocked.push({ section: "progress", rowId: sourceId, field: "split", message: "Enter a description for the second line marked incidental." });
            }
            const sourceValues = { chainageTo: splitText, chainageToKm: splitAt, length: source.length, quantity: firstQty };
            const sourcePatch = plan.patches.progress.find((patch: any) => patch.id === sourceId)
              ?? { id: sourceId, values: {} };
            Object.assign(sourcePatch.values, sourceValues);
            if (!plan.patches.progress.includes(sourcePatch)) plan.patches.progress.push(sourcePatch);
            for (const [field, value] of Object.entries(sourceValues)) {
              const oldValue = (original as any)[field] ?? null;
              if (JSON.stringify(oldValue) === JSON.stringify(value)) continue;
              const existing = plan.changes.find(change => change.section === "progress" && change.rowId === sourceId && change.field === field);
              if (existing) { existing.newValue = value; existing.derived = true; }
              else plan.changes.push({
                section: "progress", rowId: sourceId, field, oldValue, newValue: value,
                requiresApproval: true, derived: true,
              });
            }
            plan.candidate.progress.push(newRow);
            const insertValues = Object.fromEntries(
              correctionFields.progress.filter((field: string) => field in newRow).map((field: string) => [field, newRow[field]]),
            );
            plan.patches.progress.push({ id: null, values: insertValues });
            plan.changes.push({
              section: "progress", rowId: sourceId, field: "split",
              oldValue: null,
              newValue: {
                chainage: splitText,
                newEntryKey: newRow.entryKey,
                quantity: secondQty,
                isIncidental: newRow.isIncidental,
                incidentalDescription: newRow.incidentalDescription,
                reworkNoNewMaterial: newRow.reworkNoNewMaterial,
              },
              requiresApproval: true,
            });
          }
        }
      }
    }
    for (const patch of plan.patches.equipment) {
      if (!Object.hasOwn(patch.values, "activitySegments")) continue;
      for (const segment of patch.values.activitySegments) {
        for (const link of segment.boqItems) {
          const [item] = await tx.select().from(boqItems).where(eq(boqItems.id, link.boqItemId));
          if (!item || saved.boqProjectId == null || item.boqProjectId !== saved.boqProjectId) {
            plan.blocked.push({ section: "equipment", rowId: patch.id, field: "activitySegments", message: `BOQ #${link.boqItemId} must belong to the DPR's saved project.` });
          }
          if (link.programmeBarId != null) {
            const [bar] = await tx.select().from(workProgramBars).where(eq(workProgramBars.id, link.programmeBarId));
            if (!bar || bar.boqProjectId !== saved.boqProjectId || bar.boqItemId !== link.boqItemId) plan.blocked.push({ section: "equipment", rowId: patch.id, field: "activitySegments", message: "The assignment's programme bar must belong to its BOQ item and project." });
          }
        }
      }
    }
    for (const change of plan.changes) {
      if (change.section === "progress" && ["quantity", "reusableQty", "materialOutcome", "boqItemId", "earthworkArrangementId"].includes(change.field)
          && [...saved.correctionCutFillLinks, ...saved.correctionCutFillSourceLinks].some(l => l.fillProgressEntryId === change.rowId || l.sourceProgressEntryId === change.rowId)) {
        plan.blocked.push({ section: "progress", rowId: change.rowId, field: change.field, message: "This quantity is linked to the cut/fill ledger. Review its allocations in that workflow before changing the credited/material quantity." });
      }
    }
    for (const [section, patches] of Object.entries(plan.patches)) {
      for (const patch of patches) {
        const { workerNames, activitySegments, ...values } = patch.values;
        const parsed = createInsertSchema(tables[section]).partial().safeParse(values);
        if (!parsed.success) for (const issue of parsed.error.issues) plan.blocked.push({
          section, rowId: patch.id, field: issue.path.join("."), message: issue.message,
        });
        if (workerNames !== undefined && (!Array.isArray(workerNames) || workerNames.some((n: any) => typeof n !== "string"))) {
          plan.blocked.push({ section, rowId: patch.id, field: "workerNames", message: "Worker names must be text." });
        }
      }
    }
    if (!plan.blocked.length && plan.changes.length) {
      try {
        const beforeValidation = structuredClone(plan.candidate);
        await validate(plan.candidate, saved, plan.changes, actor, tx);
        // Persist and display the same canonical values as normal validators,
        // including physical UOM/quantity normalization. Never approve one
        // quantity in the dialog and silently save a different one.
        for (const section of Object.keys(correctionFields).filter(s => s !== "header")) {
          for (const row of plan.candidate[section] ?? []) {
            const before = beforeValidation[section].find((r: any) => r.id === row.id);
            for (const field of correctionFields[section]) {
              if (JSON.stringify(row[field]) === JSON.stringify(before?.[field])) continue;
              const existing = plan.changes.find(c => c.section === section && c.rowId === row.id && c.field === field);
              if (existing) { existing.newValue = row[field] ?? null; existing.derived = true; }
              else plan.changes.push({ section, rowId: row.id, field, oldValue: saved[section].find((r: any) => r.id === row.id)?.[field] ?? null, newValue: row[field] ?? null, requiresApproval: needsApproval(section, field), derived: true });
              let patch = plan.patches[section].find(p => p.id === row.id);
              if (!patch) { patch = { id: row.id, values: {} }; plan.patches[section].push(patch); }
              patch.values[field] = row[field] ?? null;
            }
          }
        }
        plan.requiresApproval = plan.changes.some(c => c.requiresApproval);
      } catch (error: any) {
        if (!error?.message) throw error;
        plan.blocked.push({ section: error.correctionSection ?? "validation", rowId: error.correctionRowId ?? saved.id, field: error.correctionField ?? "changedRows", message: error.message });
      }
    }
    plan.changes = plan.changes.filter(c => JSON.stringify(c.oldValue) !== JSON.stringify(c.newValue));
    plan.requiresApproval = plan.changes.some(c => c.requiresApproval);
    for (const change of plan.changes) {
      const row = change.section === "header" ? saved : saved[change.section]?.find((r: any) => r.id === change.rowId);
      change.rowLabel = row?.machine || row?.activity || row?.itemOfWork || `${change.section} #${change.rowId}`;
    }
    const impact: string[] = [];
    if (plan.requiresApproval) {
      impact.push("A different Administrator must approve these corrected operational facts. Existing usage, movement, diesel/stock postings, hire statements and bills are not rewritten.");
      impact.push("Financial disposition: any difference requires a separate adjustment/reversal review in the original billing or stock workflow; this approval is not an accounting adjustment.");
      for (const patch of plan.patches.equipment ?? []) {
        const row = saved.equipment.find((e: any) => e.id === patch.id);
        if (row?.plantUsageId != null) impact.push(`Equipment log #${row.id}: original usage reference #${row.plantUsageId} retained, including when that usage is missing. No replacement usage is created.`);
        const bills = await tx.select({ id: vendorBills.id, status: vendorBills.status, qty: vendorBillItems.qty, amount: vendorBillItems.amount })
          .from(vendorBillItems).innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId))
          .where(eq(vendorBillItems.source, `auto:dpr_equipment:${patch.id}`));
        for (const bill of bills) impact.push(`Bill #${bill.id} (${bill.status}): existing quantity ${bill.qty}, amount ${bill.amount} remains unchanged. Review any required adjustment separately.`);
      }
    } else impact.push("Only the displayed operational fields change. No equipment usage, stock, diesel, hire or billing postings are generated.");
    return {
      ...plan,
      baseHash: correctionHash(saved),
      revision: saved.correctionRevision,
      impact,
      ownerDirectAllowed: ownerCanApplyDirectly(actor, plan),
    };
  }
  const publicReview = (r: any) => ({
    baseHash: r.baseHash, revision: r.revision, changes: r.changes,
    blocked: r.blocked, requiresApproval: r.requiresApproval, impact: r.impact,
    ownerDirectAllowed: r.ownerDirectAllowed,
  });
  async function apply(tx: any, saved: any, review: any, actor: Actor, reason: string, approver?: Actor, requestId?: number) {
    // Server validation can enrich progress review/source facts; carry only
    // these explicit fields beyond the authored diff.
    for (const patch of review.patches.progress) {
      const candidate = review.candidate.progress.find((p: any) => p.id === patch.id);
      if (!candidate) continue;
      for (const field of ["quantitySource", "chainageReviewStatus", "linkReviewRequired", "scopeWarningType", "scopeOverrideReason", "scopeOverrideBy", "scopeOverrideAt"]) {
        if (candidate[field] !== undefined) patch.values[field] = candidate[field];
      }
    }
    for (const [section, patches] of Object.entries(review.patches) as [string, any[]][]) {
      for (const patch of patches) {
        const { workerNames, activitySegments, ...values } = patch.values;
        if (section === "progress" && patch.id == null) {
          const [inserted] = await tx.insert(progressEntries).values({ ...values, dprId: saved.id }).returning();
          const candidate = review.candidate.progress.find((row: any) => row.entryKey === values.entryKey);
          if (candidate) candidate.id = inserted.id;
          const splitChange = review.changes.find((change: any) => change.section === "progress" && change.field === "split");
          if (splitChange?.newValue?.newEntryKey === values.entryKey) splitChange.newValue.persistedId = inserted.id;
          continue;
        }
        if (section === "equipment" && activitySegments !== undefined) {
          const previous = await tx.select({ id: equipmentActivitySegments.id }).from(equipmentActivitySegments).where(eq(equipmentActivitySegments.equipmentLogId, patch.id));
          if (previous.length) await tx.delete(equipmentActivitySegmentBoqItems).where(inArray(equipmentActivitySegmentBoqItems.segmentId, previous.map((s: any) => s.id)));
          await tx.delete(equipmentActivitySegments).where(eq(equipmentActivitySegments.equipmentLogId, patch.id));
          await tx.delete(equipmentActivityAllocations).where(eq(equipmentActivityAllocations.equipmentLogId, patch.id));
          for (const segment of activitySegments) {
            const [inserted] = await tx.insert(equipmentActivitySegments).values({ equipmentLogId: patch.id, startTime: segment.startTime, endTime: segment.endTime, hoursWorked: segment.hoursWorked }).returning();
            if (segment.boqItems.length) await tx.insert(equipmentActivitySegmentBoqItems).values(segment.boqItems.map((link: any) => ({ ...link, segmentId: inserted.id })));
          }
        }
        if (Object.keys(values).length) await tx.update(tables[section]).set(values).where(eq(tables[section].id, patch.id));
        if (section === "labour" && workerNames !== undefined) await replaceLabourWorkers(tx, [{ id: patch.id }], [{ workerNames }]);
      }
    }
    await tx.update(dprs).set({
      lastEditedByUserId: actor.id, lastEditedAt: new Date(), lockStatus: "locked",
      unlockedByUserId: null, unlockedAt: null, unlockReason: null,
    }).where(eq(dprs.id, saved.id));
    await tx.insert(auditLogs).values({
      module: "dpr", transactionId: saved.id, action: "correction_applied",
      userId: actor.id, userName: name(actor), userRole: actor.isOwner ? "owner" : actor.isAdmin ? "admin" : "editor",
      reason, oldValues: { revision: review.revision, snapshot: saved },
      newValues: { revision: review.revision + 1, snapshot: review.candidate, changes: review.changes,
        impact: review.impact,
        disposition: review.requiresApproval
          ? approver ? "separate_financial_review_required" : "owner_direct_reviewed_correction"
          : "no_financial_change",
        ownerDirectCorrection: actor.isOwner === true && !approver && review.requiresApproval,
        approverId: approver?.id ?? null, approverName: approver ? name(approver) : null, requestId: requestId ?? null },
      stockImpact: "No postings, reversals, replacements or financial record changes.",
    });
    return { ...review.candidate, id: saved.id, correctionRevision: review.revision + 1 };
  }
  return {
    async preview(id: number, form: any, actor: Actor) {
      checkActor(actor);
      return database.transaction(async (tx: any) => publicReview(await review(tx, await load(tx, id), form, actor)));
    },
    async submit(id: number, data: any, actor: Actor) {
      checkActor(actor);
      const reason = reasonText(data?.reason);
      if (data?.confirmImpact !== true) correctionError("Confirm the displayed correction and financial disposition.", 400);
      return database.transaction(async (tx: any) => {
        const saved = await load(tx, id, true);
        if (typeof data.baseHash !== "string" || data.baseHash !== correctionHash(saved)) correctionError("DPR changed since review. Keep your edits and review them again against the latest revision.");
        const reviewed = await review(tx, saved, data.form, actor);
        if (reviewed.blocked.length) correctionError(reviewed.blocked.map((b: any) => `${b.section} #${b.rowId} / ${b.field}: ${b.message}`).join("\n"));
        if (!reviewed.changes.length) correctionError("There are no changes to save.", 400);
        const ownerDirectCorrection = ownerCanApplyDirectly(actor, reviewed);
        if (!reviewed.requiresApproval || ownerDirectCorrection) return apply(tx, saved, reviewed, actor, reason);
        const pending = await tx.select().from(editPermissionRequests).where(and(
          eq(editPermissionRequests.recordType, "dpr_correction"), eq(editPermissionRequests.recordId, id),
          eq(editPermissionRequests.requestedBy, actor.id), eq(editPermissionRequests.status, "pending"),
        ));
        if (pending.length) correctionError("You already have a pending correction for this DPR. Review or decline that request before submitting another.");
        const [request] = await tx.insert(editPermissionRequests).values({
          recordType: "dpr_correction", recordId: id, requestedBy: actor.id, requestedByName: name(actor), requestReason: reason,
        }).returning();
        await tx.insert(auditLogs).values({
          module: "dpr_correction_request", transactionId: request.id, action: "requested", userId: actor.id, userName: name(actor),
          reason, oldValues: { baseHash: data.baseHash, revision: reviewed.revision },
          newValues: { form: data.form, changes: reviewed.changes, impact: reviewed.impact },
          stockImpact: "Awaiting a different Administrator; no operational or financial records changed.",
        });
        return { pending: true, requestId: request.id, id };
      });
    },
    async list(id: number) {
      const requests = await database.select().from(editPermissionRequests).where(and(
        eq(editPermissionRequests.recordType, "dpr_correction"), eq(editPermissionRequests.recordId, id),
      )).orderBy(desc(editPermissionRequests.id));
      const ids = requests.map((r: any) => r.id);
      const details = ids.length ? await database.select().from(auditLogs).where(and(
        eq(auditLogs.module, "dpr_correction_request"), inArray(auditLogs.transactionId, ids), eq(auditLogs.action, "requested"),
      )) : [];
      const applied = await database.select().from(auditLogs).where(and(eq(auditLogs.module, "dpr"), eq(auditLogs.transactionId, id), eq(auditLogs.action, "correction_applied"))).orderBy(desc(auditLogs.id));
      return [
        ...requests.map((r: any) => { const data: any = details.find((a: any) => a.transactionId === r.id)?.newValues; return { ...r, changes: data?.changes ?? [], impact: data?.impact ?? [] }; }),
        ...applied.filter((a: any) => !(a.newValues as any)?.requestId).map((a: any) => ({
          id: `audit-${a.id}`, requestedBy: a.userId, requestedByName: a.userName,
          status: (a.newValues as any)?.ownerDirectCorrection === true ? "owner_corrected" : "used",
          requestReason: a.reason, createdAt: a.createdAt, changes: a.newValues?.changes ?? [], impact: a.newValues?.impact ?? [],
        })),
      ];
    },
    async decide(id: number, requestId: number, data: any, actor: Actor) {
      checkActor(actor);
      const reason = reasonText(data?.reason);
      if (actor.isAdmin !== true) correctionError("Administrator approval is required.", 403);
      if (typeof data?.approve !== "boolean" || data?.confirmImpact !== true) correctionError("Explicit review confirmation is required.", 400);
      return database.transaction(async (tx: any) => {
        const saved = await load(tx, id, true);
        const [request] = await tx.select().from(editPermissionRequests).where(and(
          eq(editPermissionRequests.id, requestId), eq(editPermissionRequests.recordType, "dpr_correction"), eq(editPermissionRequests.recordId, id),
        )).for("update");
        if (!request || request.status !== "pending") correctionError("Correction request is no longer pending.");
        if (request.requestedBy === actor.id) correctionError("You cannot approve or review your own correction. A different Administrator must review it.", 403);
        const [record] = await tx.select().from(auditLogs).where(and(
          eq(auditLogs.module, "dpr_correction_request"), eq(auditLogs.transactionId, requestId), eq(auditLogs.action, "requested"),
        ));
        if (!record) correctionError("Correction audit payload is missing; nothing was changed.");
        let result: any = { id, denied: true };
        if (data.approve) {
          if ((record.oldValues as any)?.baseHash !== correctionHash(saved)) correctionError("This proposal is stale. Decline it and ask the requester to review the latest DPR.");
          const reviewed = await review(tx, saved, (record.newValues as any).form, actor);
          if (reviewed.blocked.length) correctionError(reviewed.blocked.map((b: any) => `${b.section} #${b.rowId} / ${b.field}: ${b.message}`).join("\n"));
          result = await apply(tx, saved, reviewed, { id: request.requestedBy, fullName: request.requestedByName }, request.requestReason, actor, requestId);
        }
        await tx.update(editPermissionRequests).set({
          status: data.approve ? "used" : "denied", approvedBy: actor.id, approverName: name(actor), approverNote: reason,
          usedAt: data.approve ? new Date() : null,
        }).where(eq(editPermissionRequests.id, requestId));
        await tx.insert(auditLogs).values({
          module: "dpr_correction_request", transactionId: requestId, action: data.approve ? "approved" : "denied",
          userId: actor.id, userName: name(actor), userRole: "admin", reason,
          newValues: { dprId: id, requestId, requesterId: request.requestedBy }, stockImpact: "No financial postings.",
        });
        return result;
      });
    },
    async withdraw(id: number, requestId: number, actor: Actor) {
      checkActor(actor);
      return database.transaction(async (tx: any) => {
        await load(tx, id, true);
        const [request] = await tx.select().from(editPermissionRequests).where(and(
          eq(editPermissionRequests.id, requestId),
          eq(editPermissionRequests.recordType, "dpr_correction"),
          eq(editPermissionRequests.recordId, id),
        )).for("update");
        if (!request || request.status !== "pending") correctionError("This correction request is no longer pending.");
        if (Number(request.requestedBy) !== Number(actor.id)) correctionError("Only the requester can withdraw this pending correction.", 403);
        await tx.update(editPermissionRequests).set({ status: "withdrawn" }).where(eq(editPermissionRequests.id, requestId));
        await tx.insert(auditLogs).values({
          module: "dpr_correction_request", transactionId: requestId, action: "withdrawn",
          userId: actor.id, userName: name(actor), userRole: actor.isOwner ? "owner" : actor.isAdmin ? "admin" : "editor",
          reason: "Requester withdrew the pending correction.",
          newValues: { dprId: id, requestId, requesterId: actor.id },
          stockImpact: "No operational or financial records changed.",
        });
        return { id, requestId, withdrawn: true };
      });
    },
  };
}
