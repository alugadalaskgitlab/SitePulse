import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canLegacySection, DEFAULT_ROLE_TICKS, FEATURES, type FeatureAccessState } from "@shared/featureAccess";
import { emptyMatrix, SECTION_DESCRIPTIONS, applyRoleTemplate, PERMISSION_GROUPS } from "@shared/permissions";

describe("Fund planner permission", () => {
  it("defaults to Owner only and does not inherit broad Work programme grants", () => {
    const empty = emptyMatrix();
    expect(empty.fund_planner).toEqual(expect.objectContaining({ view: false, edit: false }));
    expect(SECTION_DESCRIPTIONS.fund_planner).toBe("Bill value, material cost and margin planning");
    expect(PERMISSION_GROUPS.find(group => group.sections.includes("fund_planner"))?.label).toBe("Work programme");
    expect(Object.values(DEFAULT_ROLE_TICKS).every(ticks => !ticks.fund_planner?.view && !ticks.fund_planner?.edit)).toBe(true);
    expect(applyRoleTemplate("project_manager").fund_planner.view).toBe(false);

    const programmeViewer = { work_programme: { ...empty.work_programme, view: true } };
    expect(canLegacySection(
      { isActive: true, isAdmin: false },
      { ...empty, ...programmeViewer },
      "fund_planner",
      "view",
      { rolesConfigured: false, legacyPermissions: { ...empty, ...programmeViewer } },
      "/work-program/2",
    )).toBe(false);
    expect(canLegacySection(
      { isActive: true, isAdmin: true },
      empty,
      "fund_planner",
      "view",
      { rolesConfigured: false, legacyPermissions: empty },
      "/work-program/2",
    )).toBe(false);
    expect(canLegacySection(
      { isActive: true, isOwner: true },
      empty,
      "fund_planner",
      "view",
      { rolesConfigured: true, legacyPermissions: empty },
      "/work-program/2",
    )).toBe(true);
  });

  it("uses explicit role and personal view/edit ticks when role access is configured", () => {
    const roleState: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [7],
      roleTicks: { 7: { work_programme: { view: true, edit: true } } },
      legacyPermissions: emptyMatrix(),
    };
    const user = { isActive: true, isAdmin: false };
    expect(canLegacySection(user, emptyMatrix(), "fund_planner", "view", roleState, "/work-program/2")).toBe(false);

    roleState.roleTicks[7].fund_planner = { view: true, edit: false };
    expect(canLegacySection(user, emptyMatrix(), "fund_planner", "view", roleState, "/work-program/2")).toBe(true);
    expect(canLegacySection(user, emptyMatrix(), "fund_planner", "edit", roleState, "/work-program/2")).toBe(false);

    roleState.personalChanges = { fund_planner: { view: false, edit: true } };
    expect(canLegacySection(user, emptyMatrix(), "fund_planner", "view", roleState, "/work-program/2")).toBe(false);
    expect(canLegacySection(user, emptyMatrix(), "fund_planner", "edit", roleState, "/work-program/2")).toBe(true);
    expect(FEATURES.find(feature => feature.id === "fund_planner")).toMatchObject({
      label: "Fund planner",
      description: "Bill value, material cost and margin planning",
      actions: ["view", "edit"],
    });
  });

  it("gates the tab and fund-plan APIs with the separate permission", () => {
    const page = readFileSync("client/src/pages/WorkProgramme.tsx", "utf8");
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(page).toContain('sectionVisible("fund_planner") && <TabsTrigger value="fund-planner"');
    expect(page).toContain('canSave={sectionCan("fund_planner", "edit")}');
    expect(routes).toContain('assertView(req, res, "fund_planner")');
    expect(routes).toContain('assertEdit(req, res, "fund_planner")');
  });
});
