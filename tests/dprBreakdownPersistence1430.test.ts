import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createDprRequestSchema } from "../shared/schema";
import { buildGuidedEquipmentPayload, splitGuidedEquipmentRow } from "../shared/guidedEquipment";

const storage = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");
const routes = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
const plantUsage = fs.readFileSync(path.resolve("client/src/pages/PlantEquipmentUsage.tsx"), "utf8");
const siteEdit = fs.readFileSync(path.resolve("client/src/pages/SiteEdit.tsx"), "utf8");
const siteEntry = fs.readFileSync(path.resolve("client/src/pages/SiteEntry.tsx"), "utf8");
const guided = fs.readFileSync(path.resolve("client/src/pages/GuidedDpr.tsx"), "utf8");

describe("Task #1430 DPR breakdown persistence wiring", () => {
  it("accepts the explicit equipment identity and breakdown maintenance identity", () => {
    const parsed = createDprRequestSchema.parse({
      date: "2026-01-01", site: "Site", engineer: "Engineer",
      equipment: [{
        machine: "Roller", persistedId: 81, plantUsageId: 42,
        breakdowns: [{ clientKey: "b-1", maintenanceLogId: 91, fromTime: "09:00", toTime: "10:30", description: "Hydraulic leak" }],
      }],
    });
    expect(parsed.equipment?.[0]).toMatchObject({ persistedId: 81, breakdowns: [{ maintenanceLogId: 91 }] });
  });

  it("uses one shared transactional reconciliation path for create, replacements, clones and versions", () => {
    expect(storage).toContain("private async reconcileDprBreakdownsTx");
    expect((storage.match(/reconcileDprBreakdownsTx\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(storage).toContain('eq(equipmentMaintenanceLogs.sourceType, "dpr_log")');
    expect(storage).toContain("oldUsageCounts.get(usageId) === 1 && newUsageCounts.get(usageId) === 1");
    expect(storage).toContain("const explicit = hasExplicitId ? oldById.get(explicitId) : undefined");
  });

  it("updates canonical identified stoppages, stages multiple new ones, and cancels removed links", () => {
    expect(storage).toContain("candidateById.get(maintenanceLogId)");
    expect(storage).toContain("await tx.update(equipmentMaintenanceLogs).set(values)");
    expect(storage).toContain("await tx.insert(equipmentMaintenanceLogs).values(staged.map(x => x.values)).returning()");
    expect(storage).toContain('cancellationReason: "Removed from DPR equipment stoppages"');
  });

  it("carries validated uploaded attachment metadata and attaches it idempotently", () => {
    const parsed = createDprRequestSchema.parse({
      date: "2026-01-01", site: "Site", engineer: "Engineer",
      equipment: [{ machine: "Roller", breakdowns: [{
        clientKey: "b-1", description: "Leak", fromTime: "09:00", toTime: "10:00",
        attachment: { fileName: "leak.jpg", objectPath: "/objects/leak.jpg", mimeType: "image/jpeg", fileSize: 12 },
      }] }],
    });
    expect(parsed.equipment?.[0].breakdowns?.[0].attachment?.objectPath).toBe("/objects/leak.jpg");
    expect(storage).toContain('eq(attachments.moduleType, "equipment_breakdown")');
    expect(storage).toContain("eq(attachments.objectPath, attachment.objectPath)");
  });

  it("reconciles removed Plant Usage stoppages through cancellation and scopes linked maintenance by source site", () => {
    expect(plantUsage).toContain("Removed from Plant Equipment Usage stoppages");
    expect(plantUsage).toContain('`/api/maintenance/logs/${existing.id}/cancel`');
    expect(routes).toContain("async function assertMaintenanceSourceAccess");
    expect(routes).toContain('log?.sourceType === "dpr_log"');
    expect(routes).toContain('log?.sourceType === "plant_usage"');
    expect(routes).toContain("You do not have access to this maintenance record's source site");
  });

  it("resolves a DPR-linked log through equipment_logs and sends version-save metadata", () => {
    expect(routes).toContain(".from(equipmentLogs)");
    expect(routes).toContain(".innerJoin(dprsTable, eq(equipmentLogs.dprId, dprsTable.id))");
    expect(routes).toContain(".where(eq(equipmentLogs.id, Number(log.sourceRecordId)))");
    expect(siteEdit).toContain("data: { ...data, equipment: await prepareBreakdownAttachments(data.equipment ?? []) }");
  });

  it("caches a successful upload by client key before a potentially ambiguous request retry", () => {
    for (const source of [siteEntry, siteEdit, guided, plantUsage]) {
      expect(source).toContain("candidate.clientKey === breakdown.clientKey");
      expect(source).toContain("attachment, file: undefined");
    }
    expect(routes).toContain("attachment.objectPath === parsed.objectPath");
  });

  it("authorizes maintenance parts, attachments, health and counts through one source scope", () => {
    expect(storage).toContain("async getMaintenancePart(partId: number)");
    expect(routes).toContain("part.maintenanceLogId, true");
    expect(routes).toContain('moduleType === "equipment_breakdown"');
    expect(routes).toContain('attachment.moduleType === "equipment_breakdown"');
    expect(routes).toContain("assertMaintenanceRecordAccess(req, res, linkedRecordId, true)");
    expect(routes).toContain("assertMaintenanceRecordAccess(req, res, parsed.linkedRecordId, true)");
    expect(routes).toContain("assertMaintenanceRecordAccess(req, res, attachment.linkedRecordId, true)");
    const attachmentMutations = routes.slice(
      routes.indexOf('app.post("/api/attachments"'),
      routes.indexOf("// ============================================", routes.indexOf('app.delete("/api/attachments/:id"')),
    );
    expect(attachmentMutations).toContain('assertCreateOrEdit(req, res, "plant_equipment")');
    expect(attachmentMutations).toContain('assertEdit(req, res, "plant_equipment")');
    expect(routes).toContain("getEquipmentHealthSummary(await visibleMaintenanceLogIds(req))");
    expect(routes).toContain("getOpenBreakdownCount(await visibleMaintenanceLogIds(req))");
    expect(storage).toContain("visibleMaintenanceLogIds.length === 0");
    const attachmentReads = routes.slice(
      routes.indexOf('app.get("/api/attachments"'),
      routes.indexOf('app.post("/api/attachments"'),
    );
    expect(attachmentReads.split("if (!req.authUser) return res.status(401)").length - 1).toBe(2);
  });

  it("excludes cancelled or deleted stoppages from Fleet health and open counts", () => {
    const healthStart = storage.indexOf("async getEquipmentHealthSummary");
    const countStart = storage.indexOf("async getOpenBreakdownCount");
    const healthSource = storage.slice(healthStart, countStart);
    const countSource = storage.slice(countStart, storage.indexOf("// ─", countStart));
    for (const source of [healthSource, countSource]) {
      expect(source).toContain("eq(equipmentMaintenanceLogs.isCancelled, false)");
      expect(source).toContain("eq(equipmentMaintenanceLogs.isDeleted, false)");
    }
  });

  it("preserves identities and stoppages through Guided payload round-tripping", () => {
    const row = splitGuidedEquipmentRow({
      id: 81, machine: "Roller", vehicleNo: "KA01", operator: "A", task: "Roll",
      breakdowns: [{ clientKey: "b-1", maintenanceLogId: 91 }],
    });
    expect(buildGuidedEquipmentPayload(row)).toMatchObject({
      persistedId: 81, breakdowns: [{ maintenanceLogId: 91 }],
    });
  });
});