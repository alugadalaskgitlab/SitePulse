import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("BOQ project uppercase input behavior", () => {
  const source = fs.readFileSync("client/src/pages/BoqProjects.tsx", "utf8");

  it("uses CSS feedback plus blur/save normalization instead of mutating every keystroke", () => {
    for (const field of ["name", "client", "contractor"]) {
      expect(source).toContain(`onChange={e => set("${field}", e.target.value)}`);
      expect(source).toContain(`onBlur={e => uppercaseOnBlur("${field}", e.target.value)}`);
    }
    expect(source.match(/className="uppercase"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).not.toMatch(/set\("(?:name|client|contractor)",\s*e\.target\.value\.toUpperCase\(\)\)/);
  });

  it("does not uppercase the protected contract identifier", () => {
    const contractInput = source.match(
      /<Input value=\{form\.contractNo\}[\s\S]*?data-testid="input-contract-no" \/>/,
    )?.[0] ?? "";
    expect(contractInput).toContain('set("contractNo", e.target.value)');
    expect(contractInput).not.toContain("uppercase");
    expect(contractInput).not.toContain("toUpperCase");
  });
});