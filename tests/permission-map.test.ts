import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import map from "../shared/permission-actions.generated.json";
import { ACTIONS, SECTION_KEYS, ROLE_TEMPLATES, applyRoleTemplate, PERMISSION_GROUPS } from "../shared/permissions";

describe("generated permission editor contract", () => {
  it("matches a fresh source audit and detects deliberately corrupted output", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "permission-map-"));
    try {
      execFileSync("node_modules/.bin/tsx", ["scripts/permission-audit.ts", "--check-map", "--no-db"], { timeout: 60000 });
      const target = path.join(dir, "map.json");
      fs.writeFileSync(target, JSON.stringify({ ...map, dashboard: { actions: [] } }));
      const broken = spawnSync("node_modules/.bin/tsx", ["scripts/permission-audit.ts", "--check-map", "--no-db"], {
        env: { ...process.env, PERMISSION_MAP_PATH: target }, timeout: 60000, encoding: "utf8",
      });
      expect(broken.status).toBe(1);
      expect(broken.stderr).toContain("Permission map drift");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 120000);

  it("retains all 87 sections and 8 actions, with a tooltip on every active cell", () => {
    expect(SECTION_KEYS).toHaveLength(87);
    expect(ACTIONS).toHaveLength(8);
    expect(Object.keys(map).sort()).toEqual([...SECTION_KEYS].sort());
    for (const section of SECTION_KEYS) {
      const entry = map[section];
      for (const action of entry.actions)
        expect((entry.tooltips as Record<string, string>)[action]?.length).toBeGreaterThan(15);
    }
  });
  it("renders labour allocation in exactly one group", () => {
    expect(PERMISSION_GROUPS.flatMap(g => g.sections).filter(s => s === "labour_management")).toHaveLength(1);
  });
  it("lets all new template creators edit their records", () => {
    for (const template of ROLE_TEMPLATES)
      for (const row of Object.values(applyRoleTemplate(template.id)))
        if (row.create) expect(row.edit).toBe(true);
  });
  it("uses View alone for entry and preserves administrator/owner bypass", () => {
    const source = fs.readFileSync("client/src/lib/auth-context.tsx", "utf8");
    const body = source.slice(source.indexOf("const sectionVisible"), source.indexOf("const canApprove"));
    expect(body).toContain("u.isAdmin || u.isOwner");
    expect(body).toContain("!!row.view");
    for (const action of ACTIONS.filter(a => a !== "view")) expect(body).not.toContain(`row.${action}`);
  });
});
