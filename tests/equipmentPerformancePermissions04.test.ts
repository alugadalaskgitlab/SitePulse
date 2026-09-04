import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";
import { assertCreate, assertEdit, assertViewEither } from "../server/auth-routes";
import { applyRoleTemplate, emptyMatrix, PERMISSION_GROUPS, SECTION_KEYS, SECTION_LABELS } from "../shared/permissions";

function responseRecorder() {
  const state = { status: 200, body: undefined as unknown };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

describe("EQUIP-04 report-only permission", () => {
  it("allows the new view grant without granting equipment transaction creation or editing", () => {
    const permissions = emptyMatrix();
    permissions.equipment_performance_report.view = true;
    const request = {
      authUser: { id: 42, isAdmin: false, isOwner: false },
      authPermissions: permissions,
    } as unknown as Request;

    const view = responseRecorder();
    expect(assertViewEither(request, view.response, "equipment_performance_report", "plant_equipment")).toBe(true);
    expect(view.state.status).toBe(200);

    const create = responseRecorder();
    expect(assertCreate(request, create.response, "plant_equipment")).toBe(false);
    expect(create.state.status).toBe(403);

    const edit = responseRecorder();
    expect(assertEdit(request, edit.response, "plant_equipment")).toBe(false);
    expect(edit.state.status).toBe(403);
  });

  it("retains report access for existing plant_equipment viewers through the compatibility gate", () => {
    const permissions = emptyMatrix();
    permissions.plant_equipment.view = true;
    const request = {
      authUser: { id: 43, isAdmin: false, isOwner: false },
      authPermissions: permissions,
    } as unknown as Request;
    const result = responseRecorder();
    expect(assertViewEither(request, result.response, "equipment_performance_report", "plant_equipment")).toBe(true);
  });

  it("registers the report key as view-only in normal role templates and the admin group", () => {
    expect(SECTION_KEYS).toContain("equipment_performance_report");
    expect(SECTION_LABELS.equipment_performance_report).toContain("View Report");
    expect(PERMISSION_GROUPS.find((group) => group.id === "hmp_reports")?.sections)
      .toContain("equipment_performance_report");
    for (const role of ["project_manager", "equipment_plant", "viewer"]) {
      const permission = applyRoleTemplate(role).equipment_performance_report;
      expect(permission.view, role).toBe(true);
      expect(permission.view_reports, role).toBe(true);
      expect(permission.create, role).toBe(false);
      expect(permission.edit, role).toBe(false);
    }
  });

  it("keeps client and server report gates compatible while usage mutations remain plant_equipment-only", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    const routes = readFileSync("server/routes.ts", "utf8");
    const usagePage = readFileSync("client/src/pages/PlantEquipmentUsage.tsx", "utf8");
    const storage = readFileSync("server/storage.ts", "utf8");
    expect(app).toContain('gatedEither(EquipmentPerformanceReport, "equipment_performance_report", "plant_equipment")');
    expect(routes).toContain('assertViewEither(req, res, "equipment_performance_report", "plant_equipment")');
    expect(usagePage).toContain('sectionCan("plant_equipment", "create")');
    expect(usagePage).toContain('sectionCan("plant_equipment", "edit")');
    expect(storage).toContain("isNull(equipmentUsage.dprId)");
    expect(storage).toContain("unrestricted");
    expect(storage).toContain("linkedUsageIdSet.has(usage.id)");
  });
});