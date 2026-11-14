import { describe, expect, it } from "vitest";
import { can, DEFAULT_ROLE_TICKS, featureForPath } from "../shared/featureAccess";
import fs from "node:fs";
import path from "node:path";

describe("Names tidy-up permission", () => {
  it("is Owner-only by default and remains separately grantable after roles are configured", () => {
    const admin = { isActive: true, isAdmin: true };
    expect(can(admin, "names_tidy_up", "view", { rolesConfigured: false })).toBe(false);
    expect(can({ isActive: true, isOwner: true }, "names_tidy_up", "edit", { rolesConfigured: false })).toBe(true);
    expect(can(admin, "names_tidy_up", "view", {
      rolesConfigured: true, userRoles: [7], roleTicks: { 7: { names_tidy_up: { view: true } } },
    })).toBe(true);
  });

  it("maps the page and API route to its dedicated feature", () => {
    expect(featureForPath("/admin/settings/names-tidy-up")).toEqual(["names_tidy_up"]);
    expect(featureForPath("/api/admin/names-tidy-up/preview")).toEqual(["names_tidy_up"]);
    expect(Object.values(DEFAULT_ROLE_TICKS).every(ticks => !ticks["names_tidy_up.view"] && !ticks["names_tidy_up.edit"])).toBe(true);
    const routes = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");
    expect(routes).toContain('action: "name_changed"');
    expect(routes).toContain("oldValues,");
    expect(routes).toContain("newValues,");
  });
});
