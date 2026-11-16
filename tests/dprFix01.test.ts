import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  canRestoreDprLocalDraft,
  dprLocalDraftKey,
  hasDprLocalDraftContent,
  parseDprLocalDraft,
  removeDprLocalDrafts,
} from "../client/src/lib/dprLocalDraft";
import {
  isBituminousMixTemplate,
  isMixTemplateProportionMaterial,
  shouldShowMixTemplateProportionMaterial,
  shouldShowMixTemplateRebuildBanner,
} from "../shared/mixTemplateMaterialDisplay";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("DPR local draft recovery", () => {
  it("scopes a saved draft to both its DPR and user", () => {
    expect(dprLocalDraftKey(320, 7)).toBe("dpr_draft_320_user_7");
    expect(dprLocalDraftKey(321, 7)).not.toBe(dprLocalDraftKey(320, 7));
    expect(dprLocalDraftKey(320, 8)).not.toBe(dprLocalDraftKey(320, 7));
    expect(dprLocalDraftKey(320, null)).toBeNull();
  });

  it("does not offer an empty legacy draft or restore any submitted DPR draft", () => {
    const emptyLegacy = parseDprLocalDraft(JSON.stringify({
      header: { site: "", date: "2026-11-15", engineer: "" },
      progress: [{ activity: "", side: "", quantity: null, uom: "SQM", noSiteWork: false, personnelIds: [] }],
      equipment: [],
      labour: [],
      materials: [],
      sitePurchases: [],
    }));
    expect(emptyLegacy).not.toBeNull();
    expect(hasDprLocalDraftContent(emptyLegacy)).toBe(false);
    expect(canRestoreDprLocalDraft("draft", emptyLegacy)).toBe(false);

    const edited = parseDprLocalDraft(JSON.stringify({
      header: { site: "Alladurg", date: "2026-11-15" },
      progress: [{ activity: "WMM", quantity: 10 }],
    }));
    expect(canRestoreDprLocalDraft("draft", edited)).toBe(true);
    expect(canRestoreDprLocalDraft("submitted", edited)).toBe(false);
  });

  it("rejects malformed local data and removes legacy plus user-scoped keys for a submitted DPR", () => {
    expect(parseDprLocalDraft(JSON.stringify({
      header: {},
      progress: { activity: "not an array" },
    }))).toBeNull();
    expect(parseDprLocalDraft(JSON.stringify({
      header: { site: "Takkadpally" },
      equipment: [null],
    }))).toBeNull();

    const values = new Map([
      ["dpr_draft_320", "{}"],
      ["dpr_draft_320_user_7", "{}"],
      ["dpr_draft_320_user_8", "{}"],
      ["dpr_draft_321_user_7", "{}"],
    ]);
    const storage = {
      get length() { return values.size; },
      key(index: number) { return [...values.keys()][index] ?? null; },
      removeItem(key: string) { values.delete(key); },
    };
    removeDprLocalDrafts(storage, 320);
    expect([...values.keys()]).toEqual(["dpr_draft_321_user_7"]);
  });

  it("keeps submitted forms on server data and scopes new unsaved recovery by user", async () => {
    const [siteEdit, siteEntry, autosave] = await Promise.all([
      readSource("client/src/pages/SiteEdit.tsx"),
      readSource("client/src/pages/SiteEntry.tsx"),
      readSource("client/src/hooks/use-autosave.ts"),
    ]);
    expect(siteEdit).toContain('dpr.dprStatus === "draft" && DRAFT_KEY');
    expect(siteEdit).toContain("removeDprLocalDrafts(sessionStorage, id)");
    expect(siteEntry).toContain("site-entry-new-user_${authUser?.id ?? \"unresolved\"}");
    expect(siteEntry).toContain("shouldPersistDraft: hasDprLocalDraftContent");
    expect(autosave).toContain("shouldPersistDraft && !shouldPersistDraft(draft.data)");
  });
});

describe("mix template material choices", () => {
  it("recognizes bituminous mix type names and positive bitumen percentages", () => {
    for (const name of ["BC", "BITUMINOUS CONCRETE", "DBM", "DGBM", "SDBC", "BM", "MSS"]) {
      expect(isBituminousMixTemplate(name, 0)).toBe(true);
    }
    expect(isBituminousMixTemplate("WMM", 2)).toBe(true);
    expect(isBituminousMixTemplate("GSB", 0)).toBe(false);
  });

  it("includes Aggregate and Filler, and hides WMM / GSB for bituminous mixes", () => {
    expect(isMixTemplateProportionMaterial("Aggregate")).toBe(true);
    expect(isMixTemplateProportionMaterial("Filler")).toBe(true);
    expect(shouldShowMixTemplateProportionMaterial({
      category: "Filler", name: "Stone dust", mixType: "BC", bitumenPercent: 4.5,
    })).toBe(true);
    for (const name of ["WMM", "Wet Mix Macadam", "GSB", "Granular Sub-base"]) {
      expect(shouldShowMixTemplateProportionMaterial({
        category: "Aggregate", name, mixType: "DGBM", bitumenPercent: 0,
      })).toBe(false);
    }
    expect(shouldShowMixTemplateProportionMaterial({
      category: "Aggregate", name: "WMM", mixType: "WMM", bitumenPercent: 0,
    })).toBe(true);
    expect(shouldShowMixTemplateProportionMaterial({
      category: "Material", name: "Sand", mixType: "BC", bitumenPercent: 4,
    })).toBe(false);
  });

  it("reports a rebuild prompt only for changed templates with dispatch usage", async () => {
    const [plant, routes] = await Promise.all([
      readSource("client/src/pages/Plant.tsx"),
      readSource("server/routes.ts"),
    ]);
    expect(plant).toContain("shouldShowMixTemplateRebuildBanner(!!variables._proportionsChanged, result?.dispatchCount)");
    expect(plant).toContain("This mix design is used in {postSaveAlertTemplate.dispatchCount} past dispatches.");
    expect(routes).toContain("dispatchCount: sql<number>`COUNT(*)::int`");
    expect(routes).toContain(".where(eq(truckDispatchesTable.mixTemplateId, Number(req.params.id)))");
    expect(shouldShowMixTemplateRebuildBanner(true, "3")).toBe(true);
    expect(shouldShowMixTemplateRebuildBanner(true, 0)).toBe(false);
    expect(shouldShowMixTemplateRebuildBanner(false, 3)).toBe(false);
  });
});

describe("norm search details", () => {
  it("searches full descriptions and provides a tooltip plus an in-place expansion", async () => {
    const [storage, component] = await Promise.all([
      readSource("server/storage.ts"),
      readSource("client/src/pages/BoqItemRecipes.tsx"),
    ]);
    expect(storage).toContain("${snlItems.description} ilike ${pat}");
    expect(component).toContain("title={fullDescription}");
    expect(component).toContain("data-testid={`norm-result-more-${item.id}`}");
    expect(component).toContain("{expanded ? \"Less\" : \"More\"}");
  });
});
