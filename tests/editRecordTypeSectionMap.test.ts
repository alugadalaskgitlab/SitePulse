import { describe, it, expect } from "vitest";
import { EDIT_RECORD_TYPE_SECTION, SECTION_KEYS, emptyMatrix } from "../shared/permissions";
import { EDIT_PERMISSION_RECORD_TYPES } from "../shared/schema";

describe("EDIT_RECORD_TYPE_SECTION mapping", () => {
  it("covers every edit-permission record type", () => {
    for (const rt of EDIT_PERMISSION_RECORD_TYPES) {
      expect(EDIT_RECORD_TYPE_SECTION[rt], `missing mapping for record type "${rt}"`).toBeTruthy();
    }
  });

  it("maps only to valid Permission Panel section keys", () => {
    const valid = new Set<string>(SECTION_KEYS);
    for (const [rt, section] of Object.entries(EDIT_RECORD_TYPE_SECTION)) {
      expect(valid.has(section), `record type "${rt}" maps to unknown section "${section}"`).toBe(true);
    }
  });

  it("has no mappings for unknown record types (client typos)", () => {
    const known = new Set<string>(EDIT_PERMISSION_RECORD_TYPES);
    for (const rt of Object.keys(EDIT_RECORD_TYPE_SECTION)) {
      expect(known.has(rt), `mapping key "${rt}" is not a known record type`).toBe(true);
    }
  });

  it("maps record types to the sections their server edit routes enforce", () => {
    // These pairs mirror the assertEdit(section) guards on each record type's
    // direct-edit route in server/routes.ts — if a pair changes here, the
    // route guard must change in lockstep (and vice versa).
    expect(EDIT_RECORD_TYPE_SECTION.dpr).toBe("site_dprs");
    expect(EDIT_RECORD_TYPE_SECTION.plant_shift_log).toBe("plant_shift_logs");
    expect(EDIT_RECORD_TYPE_SECTION.heating_session).toBe("plant_heating");
    expect(EDIT_RECORD_TYPE_SECTION.material_receipt).toBe("plant_materials");
    expect(EDIT_RECORD_TYPE_SECTION.site_material_trip).toBe("site_materials");
    expect(EDIT_RECORD_TYPE_SECTION.site_purchase).toBe("report_site_purchases");
    expect(EDIT_RECORD_TYPE_SECTION.store_grn).toBe("stores_inventory");
    expect(EDIT_RECORD_TYPE_SECTION.diesel_requirement).toBe("site_diesel");
    expect(EDIT_RECORD_TYPE_SECTION.purchase_indent).toBe("site_procurement");
    expect(EDIT_RECORD_TYPE_SECTION.truck_dispatch).toBe("plant_production");
    expect(EDIT_RECORD_TYPE_SECTION.equipment_usage).toBe("plant_equipment");
  });
});

describe("server assertEdit honours panel edit permission for non-admins", () => {
  it("grants edit to a non-admin with the section edit right, denies without", async () => {
    const { assertEdit } = await import("../server/auth-routes");
    const mkRes = () => {
      const r: any = { statusCode: 0, body: null };
      r.status = (c: number) => { r.statusCode = c; return r; };
      r.json = (b: any) => { r.body = b; return r; };
      return r;
    };

    const perms = emptyMatrix();
    perms.site_dprs.edit = true;

    // Non-admin manager WITH site_dprs.edit → allowed
    const okRes = mkRes();
    expect(assertEdit(
      { authUser: { isAdmin: false, isOwner: false }, authPermissions: perms } as any,
      okRes, "site_dprs",
    )).toBe(true);

    // Same user, section without edit right → 403
    const noRes = mkRes();
    expect(assertEdit(
      { authUser: { isAdmin: false, isOwner: false }, authPermissions: perms } as any,
      noRes, "report_site_purchases",
    )).toBe(false);
    expect(noRes.statusCode).toBe(403);
  });
});
