import { describe, it, expect } from "vitest";
import { isStructureTypeLabel, isChainageLabel, normalizeHeaderLabel } from "../shared/structureImportLabels";

describe("structureImportLabels", () => {
  describe("normalizeHeaderLabel", () => {
    it("lowercases and strips non-alphanumeric characters", () => {
      expect(normalizeHeaderLabel("Chainage (Km)")).toBe("chainagekm");
      expect(normalizeHeaderLabel("Structure_Type")).toBe("structuretype");
      expect(normalizeHeaderLabel("  Chainage  ")).toBe("chainage");
    });
  });

  describe("isChainageLabel", () => {
    it("matches the exact legacy labels", () => {
      expect(isChainageLabel("Chainage")).toBe(true);
      expect(isChainageLabel("Chainage Km")).toBe(true);
      expect(isChainageLabel("chainage_km")).toBe(true);
      expect(isChainageLabel("Chainage From")).toBe(true);
    });

    it("matches variant phrasing that previously broke the strict regex", () => {
      expect(isChainageLabel("Chainage (Km)")).toBe(true);
      expect(isChainageLabel("Chainage in Km")).toBe(true);
      expect(isChainageLabel("CHAINAGE(KM)")).toBe(true);
      expect(isChainageLabel("Chainage:")).toBe(true);
      expect(isChainageLabel(" Chainage ")).toBe(true);
    });

    it("does not match unrelated labels", () => {
      expect(isChainageLabel("Structure Type")).toBe(false);
      expect(isChainageLabel("BOQ Code")).toBe(false);
      expect(isChainageLabel("")).toBe(false);
    });
  });

  describe("isStructureTypeLabel", () => {
    it("matches the exact legacy label and variant phrasing", () => {
      expect(isStructureTypeLabel("Structure Type")).toBe(true);
      expect(isStructureTypeLabel("Structure_Type")).toBe(true);
      expect(isStructureTypeLabel("Structure Type:")).toBe(true);
      expect(isStructureTypeLabel("STRUCTURE TYPE (e.g. culvert)")).toBe(true);
    });

    it("does not match unrelated labels", () => {
      expect(isStructureTypeLabel("Chainage")).toBe(false);
      expect(isStructureTypeLabel("BOQ Code")).toBe(false);
    });
  });
});
