import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  auditLogs,
  boqItems,
  boqProjects,
  dprs,
  progressEntries,
  projectScopeSegments,
} from "../shared/schema";
import {
  calculateDprLayerAssignments,
  summarizeDprLayerAssignments,
  type DprLayerAssignmentOptions,
  type DprLayerAssignmentSource,
  type DprLayerReach,
} from "../shared/dprLayerAssignment";

type Actor = { id: number; isOwner?: boolean; fullName?: string | null; username?: string | null };

const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};

function validateOptions(input: any): DprLayerAssignmentOptions & { groupName: string } {
  if (!input || !Array.isArray(input.itemIds) || input.itemIds.length < 1 || input.itemIds.length > 100) {
    fail("Select one or more BOQ items for this layer group.");
  }
  const itemIds = input.itemIds.map(Number);
  if (itemIds.some((id: number) => !Number.isSafeInteger(id) || id <= 0) || new Set(itemIds).size !== itemIds.length) {
    fail("The BOQ item selection is invalid.");
  }
  const layerCount = Number(input.layerCount);
  if (!Number.isSafeInteger(layerCount) || layerCount < 1 || layerCount > 100) {
    fail("Enter a valid number of layers.");
  }
  const compactedThicknessMm = Number(input.compactedThicknessMm);
  if (!Number.isFinite(compactedThicknessMm) || compactedThicknessMm <= 0 || compactedThicknessMm > 5000) {
    fail("Enter a valid compacted thickness in millimetres.");
  }
  const groupName = typeof input.groupName === "string" ? input.groupName.trim() : "";
  if (!groupName || groupName.length > 100) fail("Enter a layer group name.");
  return { itemIds, layerCount, compactedThicknessMm, groupName, roadLengthKm: null };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function actorName(actor: Actor): string {
  return String(actor.fullName || actor.username || `User ${actor.id}`).trim();
}

export const requireDprLayerAssignmentOwner: RequestHandler = (req, res, next) => {
  if (req.authUser?.isOwner !== true) {
    return res.status(403).json({ message: "Only the Owner can use the DPR layer assignment tool." });
  }
  next();
};

export function dprLayerAssignmentService(database: any) {
  async function load(executor: any, projectId: number, requestedItemIds?: number[]) {
    const [project] = await executor.select({
      id: boqProjects.id,
      name: boqProjects.name,
      roadLengthKm: boqProjects.roadLengthKm,
    }).from(boqProjects).where(eq(boqProjects.id, projectId)).limit(1);
    if (!project) fail("BOQ project not found.", 404);

    const items = await executor.select({
      id: boqItems.id,
      itemCode: boqItems.itemCode,
      itemName: boqItems.itemName,
      description: boqItems.description,
      unit: boqItems.unit,
      categoryId: boqItems.categoryId,
    }).from(boqItems).where(eq(boqItems.boqProjectId, projectId)).orderBy(asc(boqItems.sortOrder), asc(boqItems.id));
    const itemById = new Map(items.map((item: any) => [Number(item.id), item]));
    const itemIds: number[] = requestedItemIds ?? items.map((item: any) => Number(item.id));
    if (requestedItemIds && itemIds.some((id) => !itemById.has(Number(id)))) {
      fail("Every selected BOQ item must belong to this project.");
    }

    const reachesRaw = await executor.select({
      id: projectScopeSegments.id,
      label: projectScopeSegments.label,
      chainageFrom: projectScopeSegments.chainageFrom,
      chainageTo: projectScopeSegments.chainageTo,
      side: projectScopeSegments.side,
      applicability: projectScopeSegments.applicability,
      itemIds: projectScopeSegments.itemIds,
    }).from(projectScopeSegments).where(and(
      eq(projectScopeSegments.boqProjectId, projectId),
      eq(projectScopeSegments.segmentType, "working_reach"),
      eq(projectScopeSegments.status, "confirmed"),
    )).orderBy(asc(projectScopeSegments.chainageFrom), asc(projectScopeSegments.id));
    const reaches: DprLayerReach[] = reachesRaw.map((reach: any) => ({
      ...reach,
      chainageFrom: Number(reach.chainageFrom),
      chainageTo: Number(reach.chainageTo),
    }));

    const rows: DprLayerAssignmentSource[] = itemIds.length
      ? await executor.select({
          progressId: progressEntries.id,
          dprId: dprs.id,
          dprDate: dprs.date,
          dprStatus: dprs.dprStatus,
          dprIsDeleted: dprs.isDeleted,
          dprIsCancelled: dprs.isCancelled,
          dprIsSuperseded: dprs.isSuperseded,
          isDeleted: dprs.isDeleted,
          isCancelled: dprs.isCancelled,
          isSuperseded: dprs.isSuperseded,
          boqItemId: progressEntries.boqItemId,
          itemName: boqItems.itemName,
          itemUnit: boqItems.unit,
          activity: progressEntries.activity,
          side: progressEntries.side,
          chainageFrom: progressEntries.chainageFrom,
          chainageTo: progressEntries.chainageTo,
          chainageFromKm: progressEntries.chainageFromKm,
          chainageToKm: progressEntries.chainageToKm,
          length: progressEntries.length,
          width: progressEntries.width,
          thickness: progressEntries.thickness,
          quantity: progressEntries.quantity,
          uom: progressEntries.uom,
          layerNo: progressEntries.layerNo,
          noSiteWork: progressEntries.noSiteWork,
        }).from(progressEntries)
          .innerJoin(dprs, eq(dprs.id, progressEntries.dprId))
          .innerJoin(boqItems, eq(boqItems.id, progressEntries.boqItemId))
          .where(and(
            eq(dprs.boqProjectId, projectId),
            eq(boqItems.boqProjectId, projectId),
            inArray(progressEntries.boqItemId, itemIds),
            or(eq(dprs.dprStatus, "submitted"), eq(dprs.dprStatus, "draft")),
            or(eq(dprs.isDeleted, false), isNull(dprs.isDeleted)),
            or(eq(dprs.isCancelled, false), isNull(dprs.isCancelled)),
            or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
          )).orderBy(asc(dprs.date), asc(dprs.id), asc(progressEntries.id))
      : [];

    return { project, items, itemById, itemIds, rows, reaches };
  }

  function makePreview(data: Awaited<ReturnType<typeof load>>, rawOptions: any) {
    const options = validateOptions(rawOptions);
    const source = {
      project: data.project,
      items: data.items.filter((item: any) => options.itemIds.includes(Number(item.id))),
      rows: data.rows,
      reaches: data.reaches,
      groupName: options.groupName,
      itemIds: options.itemIds,
      layerCount: options.layerCount,
      compactedThicknessMm: options.compactedThicknessMm,
    };
    const previewToken = fingerprint(source);
    const assignmentOptions: DprLayerAssignmentOptions = {
      itemIds: options.itemIds,
      layerCount: options.layerCount,
      compactedThicknessMm: options.compactedThicknessMm,
      roadLengthKm: data.project.roadLengthKm == null ? null : Number(data.project.roadLengthKm),
    };
    const rows = calculateDprLayerAssignments(data.rows, assignmentOptions);
    return {
      previewToken,
      groupName: options.groupName,
      project: data.project,
      items: data.items.filter((item: any) => options.itemIds.includes(Number(item.id))),
      rows,
      reaches: data.reaches,
      summary: summarizeDprLayerAssignments(rows, data.reaches, assignmentOptions),
      settings: {
        itemIds: options.itemIds,
        layerCount: options.layerCount,
        compactedThicknessMm: options.compactedThicknessMm,
      },
    };
  }

  return {
    async get(projectId: number) {
      return load(database, projectId, []);
    },

    async preview(projectId: number, rawOptions: any) {
      const options = validateOptions(rawOptions);
      return makePreview(await load(database, projectId, options.itemIds), rawOptions);
    },

    async apply(projectId: number, input: any, actor: Actor) {
      if (actor?.isOwner !== true) fail("Only the Owner can assign DPR layers.", 403);
      if (typeof input?.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 2000) {
        fail("Enter a reason of 10–2000 characters.", 400);
      }
      if (input?.confirm !== true) fail("Confirm the layer assignment before applying it.", 400);
      if (typeof input?.previewToken !== "string" || !input.previewToken) fail("Open the preview again before applying.", 400);

      const rawOptions = input.options;
      const options = validateOptions(rawOptions);
      return database.transaction(async (tx: any) => {
        await tx.select({ id: boqProjects.id }).from(boqProjects)
          .where(eq(boqProjects.id, projectId)).for("update");
        const data = await load(tx, projectId, options.itemIds);
        const preview = makePreview(data, rawOptions);
        if (preview.previewToken !== input.previewToken) {
          fail("DPR or project data changed since preview — open the review again.", 409);
        }

        const eligible = preview.rows.filter((row: any) => row.counted);
        const submittedUpdates = input.updates;
        if (!Array.isArray(submittedUpdates) || submittedUpdates.length !== eligible.length) {
          fail("The layer choices do not match the reviewed lines. Open the preview again.", 409);
        }
        const updateById = new Map<number, any>();
        for (const update of submittedUpdates) {
          const id = Number(update?.progressId);
          if (!Number.isSafeInteger(id) || updateById.has(id)) fail("A layer choice is invalid or duplicated.");
          updateById.set(id, update);
        }
        const eligibleIds = new Set(eligible.map((row: any) => Number(row.progressId)));
        if (updateById.size !== eligibleIds.size || Array.from(updateById.keys()).some((id) => !eligibleIds.has(id))) {
          fail("Only the submitted lines shown in the preview can be changed.");
        }

        let updatedCount = 0;
        for (const row of eligible) {
          const choice = updateById.get(Number(row.progressId));
          const layerNo = Number(choice.layerNo);
          if (!Number.isSafeInteger(layerNo) || layerNo <= 0) fail(`DPR #${row.dprId}, line #${row.progressId}: enter a positive whole-number layer.`);
          if (typeof choice.correctUom !== "boolean") fail(`DPR #${row.dprId}, line #${row.progressId}: confirm whether to correct the unit.`);
          const item = data.itemById.get(Number(row.boqItemId));
          if (!item) fail(`DPR #${row.dprId}, line #${row.progressId}: its linked BOQ item is missing.`, 409);
          const nextUom = choice.correctUom ? String((item as any).unit) : row.uom;
          const values: Record<string, unknown> = {};
          if (Number(row.layerNo ?? 0) !== layerNo) values.layerNo = layerNo;
          if (choice.correctUom && String(row.uom ?? "").trim().toUpperCase() !== String((item as any).unit).trim().toUpperCase()) {
            values.uom = nextUom;
          }
          if (!Object.keys(values).length) continue;

          const [updated] = await tx.update(progressEntries).set(values).where(and(
            eq(progressEntries.id, row.progressId),
            sql`${progressEntries.layerNo} IS NOT DISTINCT FROM ${row.layerNo}`,
            sql`${progressEntries.uom} IS NOT DISTINCT FROM ${row.uom}`,
          )).returning({ id: progressEntries.id, layerNo: progressEntries.layerNo, uom: progressEntries.uom });
          if (!updated) fail(`DPR #${row.dprId}, line #${row.progressId} changed during Apply. No changes were saved; open the review again.`, 409);

          await tx.insert(auditLogs).values({
            module: "dpr",
            transactionId: Number(row.dprId),
            action: "layer_assignment_applied",
            userId: actor.id,
            userName: actorName(actor),
            userRole: "owner",
            reason: `Owner – assign layers tool: ${input.reason.trim()}`,
            oldValues: { progressId: Number(row.progressId), layerNo: row.layerNo ?? null, uom: row.uom ?? null },
            newValues: { progressId: Number(row.progressId), layerNo: updated.layerNo ?? null, uom: updated.uom ?? null },
            stockImpact: "Layer number and unit label only; quantity and other DPR facts were not changed.",
          });
          updatedCount++;
        }
        return { updatedCount, message: `${updatedCount} lines updated` };
      });
    },
  };
}
