import { createHash } from "node:crypto";
import { createInsertSchema } from "drizzle-zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  dprs, progressEntries, equipmentLogs, labourLogs, materialLogs, sitePurchases,
  dprStructureItems, auditLogs, editPermissionRequests, equipmentMaintenanceLogs,
  cutFillConsumptions, vendorBillItems, vendorBills, equipmentMaster,
} from "../shared/schema";
import { readWorkerNames, replaceLabourWorkers } from "./labourWorkers";
import { correctionError, correctionFields, needsApproval, planDprCorrection } from "./dprCorrectionPlan";

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
    for (const change of plan.changes) {
      if (change.section === "progress" && ["quantity", "reusableQty", "materialOutcome", "boqItemId", "earthworkArrangementId"].includes(change.field)
          && [...saved.correctionCutFillLinks, ...saved.correctionCutFillSourceLinks].some(l => l.fillProgressEntryId === change.rowId || l.sourceProgressEntryId === change.rowId)) {
        plan.blocked.push({ section: "progress", rowId: change.rowId, field: change.field, message: "This quantity is linked to the cut/fill ledger. Review its allocations in that workflow before changing the credited/material quantity." });
      }
    }
    for (const [section, patches] of Object.entries(plan.patches)) {
      for (const patch of patches) {
        const { workerNames, ...values } = patch.values;
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
              if (existing) existing.newValue = row[field] ?? null;
              else plan.changes.push({ section, rowId: row.id, field, oldValue: saved[section].find((r: any) => r.id === row.id)?.[field] ?? null, newValue: row[field] ?? null, requiresApproval: needsApproval(section, field) });
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
    return { ...plan, baseHash: correctionHash(saved), revision: saved.correctionRevision, impact };
  }
  const publicReview = (r: any) => ({
    baseHash: r.baseHash, revision: r.revision, changes: r.changes,
    blocked: r.blocked, requiresApproval: r.requiresApproval, impact: r.impact,
  });
  async function apply(tx: any, saved: any, review: any, actor: Actor, reason: string, approver?: Actor, requestId?: number) {
    // Server validation can enrich progress review/source facts; carry only
    // these explicit fields beyond the authored diff.
    for (const patch of review.patches.progress) {
      const candidate = review.candidate.progress.find((p: any) => p.id === patch.id);
      for (const field of ["quantitySource", "chainageReviewStatus", "linkReviewRequired", "scopeWarningType", "scopeOverrideReason", "scopeOverrideBy", "scopeOverrideAt"]) {
        if (candidate[field] !== undefined) patch.values[field] = candidate[field];
      }
    }
    for (const [section, patches] of Object.entries(review.patches) as [string, any[]][]) {
      for (const patch of patches) {
        const { workerNames, ...values } = patch.values;
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
      userId: actor.id, userName: name(actor), userRole: actor.isAdmin ? "admin" : "editor",
      reason, oldValues: { revision: review.revision, snapshot: saved },
      newValues: { revision: review.revision + 1, snapshot: review.candidate, changes: review.changes,
        impact: review.impact, disposition: review.requiresApproval ? "separate_financial_review_required" : "no_financial_change",
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
        if (!reviewed.requiresApproval) return apply(tx, saved, reviewed, actor, reason);
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
          id: `audit-${a.id}`, requestedBy: a.userId, requestedByName: a.userName, status: "used",
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
  };
}
