import { describe, it, expect } from "vitest";
import {
  isStructureTypeLabel,
  isChainageLabel,
  isChainageFromLabel,
  isChainageToLabel,
  normalizeHeaderLabel,
} from "../shared/structureImportLabels";

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

  describe("isChainageFromLabel", () => {
    it("matches 'Chainage From' variants", () => {
      expect(isChainageFromLabel("Chainage From")).toBe(true);
      expect(isChainageFromLabel("Chainage_From")).toBe(true);
      expect(isChainageFromLabel("Chainage From (Km)")).toBe(true);
      expect(isChainageFromLabel("CHAINAGE FROM")).toBe(true);
    });

    it("also matches a bare 'Chainage' row for backward compatibility", () => {
      expect(isChainageFromLabel("Chainage")).toBe(true);
      expect(isChainageFromLabel(" Chainage ")).toBe(true);
    });

    it("does not match 'Chainage To' or unrelated labels", () => {
      expect(isChainageFromLabel("Chainage To")).toBe(false);
      expect(isChainageFromLabel("Structure Type")).toBe(false);
      expect(isChainageFromLabel("BOQ Code")).toBe(false);
    });
  });

  describe("isChainageToLabel", () => {
    it("matches 'Chainage To' variants", () => {
      expect(isChainageToLabel("Chainage To")).toBe(true);
      expect(isChainageToLabel("Chainage_To")).toBe(true);
      expect(isChainageToLabel("Chainage To (Km)")).toBe(true);
      expect(isChainageToLabel("CHAINAGE TO")).toBe(true);
    });

    it("does not match 'Chainage From', bare 'Chainage', or unrelated labels", () => {
      expect(isChainageToLabel("Chainage From")).toBe(false);
      expect(isChainageToLabel("Chainage")).toBe(false);
      expect(isChainageToLabel("Structure Type")).toBe(false);
    });
  });
});
