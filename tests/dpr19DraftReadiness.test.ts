import { describe, expect, it } from "vitest";
import { evaluateSavedDraftReadiness } from "../shared/dprDraftReadiness";
import { evaluateSectionReadiness as sharedSectionReadiness } from "../shared/dprSectionReadiness";
import { evaluateSectionReadiness as clientSectionReadiness } from "../client/src/lib/dprSectionReadiness";
import { withCutFillReadinessContext as sharedCutFill } from "../shared/cutFillReadiness";
import { withCutFillReadinessContext as clientCutFill } from "../client/src/lib/cutFillLedger";

const excavation = { id: 11, boqProjectId: 4, description: "ROADWAY EXCAVATION", unit: "CUM" };
const ordinary = { id: 12, boqProjectId: 4, description: "Bituminous concrete", unit: "MT" };
const items = new Map([excavation, ordinary].map(item => [item.id, item]));
const projects = new Map([[4, { id: 4, siteName: "Road Site" }]]);
const draft = (overrides: Record<string, any> = {}) => ({
  site: "Road Site", boqProjectId: 4, workType: "road",
  progress: [{ entryKey: "cut", boqItemId: 11, activity: "Excavation", quantity: 100 }],
  equipment: [], labour: [], materials: [], ...overrides,
});

describe("DPR-19 saved draft list adapter", () => {
  it("uses exactly the client section/cut-fill helpers on saved rows", () => {
    const saved = draft({ equipment: [{ machine: "Roller", openingReading: 25 }] });
    expect(sharedCutFill(saved.progress, [...items.values()])).toEqual(clientCutFill(saved.progress, [...items.values()]));
    expect(sharedSectionReadiness(saved, [...items.values()])).toEqual(clientSectionReadiness(saved, [...items.values()]));
    const result = evaluateSavedDraftReadiness(saved, items, projects);
    expect(result.state).toBe("blocked");
    expect(result.mandatory.map(issue => issue.message)).toEqual(
      clientSectionReadiness(saved, [...items.values()]).mandatory.map(issue => issue.message),
    );
    expect(result.mandatory.some(issue => issue.section === "activities" && /fully reusable|partly reusable/i.test(issue.message))).toBe(true);
    expect(result.mandatory.some(issue => /closing meter/i.test(issue.message))).toBe(true);
  });

  it("never calls an unresolved or foreign BOQ item ready", () => {
    const completed = [{ ...draft().progress[0], materialOutcome: "fully_reusable", reusableQty: 100 }];
    expect(evaluateSavedDraftReadiness(draft({ boqProjectId: null, progress: completed }), items, projects).state).toBe("unavailable");
    expect(evaluateSavedDraftReadiness(draft({ progress: completed }), new Map(), projects).state).toBe("unavailable");
    expect(evaluateSavedDraftReadiness(draft({ progress: completed }), new Map([[11, { ...excavation, boqProjectId: 5 }]]), projects).state).toBe("unavailable");
    expect(evaluateSavedDraftReadiness(draft({ progress: completed }), items, new Map()).state).toBe("unavailable");
    expect(evaluateSavedDraftReadiness(draft({ progress: completed, site: "Elsewhere" }), items, projects).state).toBe("unavailable");
  });

  it("keeps advisory-only drafts ready and accepts complete excavation outcomes", () => {
    const completed = [{ ...draft().progress[0], materialOutcome: "fully_reusable", reusableQty: 100 }];
    const advisory = evaluateSavedDraftReadiness(draft({ progress: completed, equipment: [{ machine: "Roller" }] }), items, projects);
    expect(advisory.state).toBe("ready");
    expect(advisory.mandatory).toEqual([]);
    expect(advisory.advisories).toHaveLength(1);
    expect(evaluateSavedDraftReadiness(draft({ progress: completed }), items, projects)).toEqual({
      state: "ready", mandatory: [], advisories: [],
    });
  });
});