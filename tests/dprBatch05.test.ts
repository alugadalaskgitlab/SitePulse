/**
 * Batch 05 — Guided DPR daily workflow regression tests (spec §19).
 *
 * Pure-logic coverage of the release-blocker rules:
 *  - CTA routing (Start / Complete Today's DPR) — A, C, O, R
 *  - entry-mode persistence: viewing never changes the default — Q, R
 *  - Field Home real completeness (checklist derived from Batch 04
 *    readiness, no row-existence shortcuts) — E, F, H, J, K, M, N
 *  - draft leniency unchanged (readiness only gates Final Submit) — B, G, L
 *  - autosave suppression rule (server draft authoritative) — S
 *  - Equipment & Fleet linking helpers (reuse, no duplicates, advisory,
 *    legitimate multiple runs) — U, V, X
 */
import { describe, it, expect, beforeEach } from "vitest";

// localStorage shim for dprEntryMode (node environment)
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

import {
  bindDprEntryModeUser, getDprEntryMode, setDprEntryMode,
  roadDprHref, roadDprDraftHref,
} from "../client/src/lib/dprEntryMode";
import { guidedBlobMatches, siteEntryBlobMatches, normaliseSite } from "../client/src/lib/dprAutosaveReconcile";
import { deriveDprChecklist } from "../shared/dprFieldChecklist";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";
import { linkedUsageIds, unlinkedOpenUsages, usageToGuidedRow, duplicateUsageAdvisory } from "../shared/dprPlantLink";
import { buildGuidedEquipmentPayload } from "../shared/guidedEquipment";

beforeEach(() => { store.clear(); bindDprEntryModeUser(7); });

// ── Routing (A, C, O) ────────────────────────────────────────────────────────
describe("road DPR routing honours Guided as default", () => {
  it("A: no DPR — Start Today's Site Work opens Guided", () => {
    expect(roadDprHref("/")).toBe("/site/guided?returnTo=%2F");
  });
  it("C/O: own draft — Complete Today's DPR reopens the SAME Guided draft, never Detailed", () => {
    const href = roadDprDraftHref(123, "/");
    expect(href).toBe("/site/guided?draftId=123&returnTo=%2F");
    expect(href).not.toContain("/site/edit");
  });
  it("explicit Detailed preference still routes the draft to the Detailed editor", () => {
    setDprEntryMode("detailed");
    expect(roadDprDraftHref(123)).toBe("/site/edit/123?draft");
  });
});

// ── Entry mode (Q, R) ────────────────────────────────────────────────────────
describe("viewing a screen never changes the persistent default", () => {
  it("Q: default stays guided unless explicitly set", () => {
    expect(getDprEntryMode()).toBe("guided");
    // simulate "viewing Detailed" — nothing calls setDprEntryMode anymore,
    // so the stored preference is untouched:
    expect(store.has("sitelog.dprEntryMode.u7")).toBe(false);
    expect(getDprEntryMode()).toBe("guided");
  });
  it("R: next-day Start still opens Guided after merely viewing Detailed", () => {
    expect(roadDprHref()).toBe("/site/guided");
  });
  it("explicit action changes and persists the default per user", () => {
    setDprEntryMode("detailed");
    expect(getDprEntryMode()).toBe("detailed");
    bindDprEntryModeUser(8); // another user unaffected
    expect(getDprEntryMode()).toBe("guided");
  });
});

// ── Draft leniency (B, G) + Final Submit gating (L, M) ─────────────────────
describe("morning partials stay draft-saveable; Final Submit still gates", () => {
  it("B/N: activity + From only — readiness flags it (submit) but never strips it (draft is untouched by readiness)", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "Embankment", chainageFrom: "2+570", chainageTo: "", quantity: null }],
    });
    expect(r.ready).toBe(false);
    expect(r.mandatory.map((m) => m.message).join(" ")).toContain("quantity");
  });
  it("G/L: machine + opening only blocks Final Submit (closing required)", () => {
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "JCB", openingReading: 1234.5 }] });
    expect(r.mandatory.some((m) => m.message.includes("closing meter"))).toBe(true);
  });
  it("J: adding the closing reading resolves the pending item", () => {
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "JCB", openingReading: 1234.5, closingReading: 1241 }] });
    expect(r.mandatory).toHaveLength(0);
  });
  it("M: machine with no usage at all stays advisory-only (no false submit block)", () => {
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "Grader" }] });
    expect(r.ready).toBe(true);
    expect(r.advisories).toHaveLength(1);
  });
});

// ── Field Home real completeness (E, F, H, I, K) ────────────────────────────
describe("deriveDprChecklist — real completeness, not row existence", () => {
  const draft = (over: any = {}) => ({
    workType: "road",
    progress: [{ activity: "Embankment", chainageFrom: "2+570", chainageTo: "", quantity: null }],
    equipment: [{ machine: "JCB", openingReading: 1234.5, closingReading: null }],
    labour: [], materials: [],
    ...over,
  });
  it("E/H: rows existing does NOT mark sections done; per-row detail shown", () => {
    const c = deriveDprChecklist(draft(), false);
    const eq = c.items.find((i) => i.id === "c1")!;
    const act = c.items.find((i) => i.id === "c4")!;
    expect(eq.state).toBe("pending");
    expect(eq.sub).toContain("JCB — closing meter reading required");
    expect(act.state).toBe("pending");
    expect(act.details.join(" ")).toContain("Embankment");
    expect(c.openEquipment).toBe(1);
    expect(c.openActivities).toBe(1);
  });
  it("F/J: completing closing values resolves the pending items", () => {
    const c = deriveDprChecklist(draft({
      progress: [{ activity: "Embankment", chainageFrom: "2+570", chainageTo: "2+660", quantity: 120 }],
      equipment: [{ machine: "JCB", openingReading: 1234.5, closingReading: 1241 }],
    }), false);
    expect(c.items.find((i) => i.id === "c1")!.state).toBe("done");
    expect(c.items.find((i) => i.id === "c4")!.state).toBe("done");
    expect(c.openEquipment).toBe(0);
  });
  it("K: startTime without endTime behaves like an open meter pair", () => {
    const c = deriveDprChecklist(draft({ equipment: [{ machine: "Roller", startTime: "08:00", endTime: "" }] }), false);
    expect(c.items.find((i) => i.id === "c1")!.sub).toContain("end time");
  });
  it("blank placeholder rows never warn", () => {
    const c = deriveDprChecklist(draft({
      progress: [{ activity: "", quantity: null }],
      equipment: [{ machine: "" }],
      labour: [{ category: "", count: null, task: "", contractor: "" }],
    }), false);
    expect(c.items.find((i) => i.id === "c1")!.sub).toBe("No equipment recorded yet");
    expect(c.items.find((i) => i.id === "c4")!.sub).toBe("No activities recorded yet");
    expect(c.items.find((i) => i.id === "c2")!.details).toHaveLength(0);
  });
  it("numeric strings from pg are handled (quantity '120' counts as entered)", () => {
    const c = deriveDprChecklist(draft({
      progress: [{ activity: "GSB", chainageFrom: "0+000", chainageTo: "0+100", quantity: "120" as any }],
      equipment: [],
    }), false);
    expect(c.items.find((i) => i.id === "c4")!.state).toBe("done");
  });
});

// ── Autosave suppression rule (S) ────────────────────────────────────────────
describe("stale new-DPR autosave suppression — safely-established contexts only", () => {
  const ctx = { draftId: 55, site: "Takkadpally", date: "2026-08-10" };
  it("guided blob with the same draftId matches", () => {
    expect(guidedBlobMatches({ draftId: 55 }, ctx)).toBe(true);
  });
  it("guided blob for the same site+date matches even without draftId", () => {
    expect(guidedBlobMatches({ siteName: "takkadpally ", date: "2026-08-10" }, ctx)).toBe(true);
  });
  it("different site, date, or draft never matches (no global deletion)", () => {
    expect(guidedBlobMatches({ draftId: 56 }, ctx)).toBe(false);
    expect(guidedBlobMatches({ siteName: "Takkadpally", date: "2026-08-09" }, ctx)).toBe(false);
    expect(guidedBlobMatches({ siteName: "Other Site", date: "2026-08-10" }, ctx)).toBe(false);
    expect(guidedBlobMatches(null, ctx)).toBe(false);
    expect(guidedBlobMatches({}, ctx)).toBe(false);
  });
  it("site-entry blob matches only on same site+date in its header", () => {
    expect(siteEntryBlobMatches({ header: { site: "Takkadpally", date: "2026-08-10" } }, ctx)).toBe(true);
    expect(siteEntryBlobMatches({ header: { site: "Takkadpally", date: "2026-08-11" } }, ctx)).toBe(false);
    expect(siteEntryBlobMatches({}, ctx)).toBe(false);
  });
  it("site normalisation strips edited-by suffixes", () => {
    expect(normaliseSite("Takkadpally – Edited by Babu")).toBe("takkadpally");
  });
});

// ── Site-scoped discovery authorization ─────────────────────────────────────
import { siteMatchesPermitted, getBaseSiteName } from "../shared/siteName";
describe("open-usage discovery site authorization (same helper as DPR routes)", () => {
  const permitted = ["Takkadpally", "FDR KK ROAD"];
  it("a restricted user may request only permitted sites", () => {
    expect(siteMatchesPermitted("Takkadpally", permitted)).toBe(true);
    expect(siteMatchesPermitted("DTPL-BASAVAKALYAN", permitted)).toBe(false);
  });
  it("edited/copy site-label variants resolve to the base site", () => {
    expect(siteMatchesPermitted("Takkadpally – Edited by Admin – 2026-08-10 09:00:00", permitted)).toBe(true);
    expect(getBaseSiteName("FDR KK ROAD – Edited by Manager – 2026-01-16 20:33:54")).toBe("FDR KK ROAD");
    expect(siteMatchesPermitted("DTPL-RAJESHWAR – Edited by Admin – 2026-03-06 06:02:19", permitted)).toBe(false);
  });
});

// ── Equipment & Fleet linkage (U, V, W, X) ──────────────────────────────────
describe("Guided reuse of the Detailed plant-linking mechanism", () => {
  const usage = {
    id: 900, equipmentId: 4, entryType: "time_meter",
    openingReading: 1234.5, startTime: "07:30", operator: "Ravi", task: "Excavation",
  };
  const nameOf = (id: number) => (id === 4 ? "JCB" : undefined);

  it("U: an open usage becomes a linked Guided row, copying only real fields", () => {
    const row = usageToGuidedRow(usage as any, "JCB");
    expect(row.machine).toBe("JCB");
    expect(row.operator).toBe("Ravi");
    expect(row.passthrough.plantUsageId).toBe(900);
    expect(row.passthrough.equipmentId).toBe(4);
    expect(row.passthrough.openingReading).toBe(1234.5);
    expect("closingReading" in row.passthrough).toBe(false); // nothing fabricated
    // and the payload round-trips the link for server-side closePlantUsage:
    expect(buildGuidedEquipmentPayload(row).plantUsageId).toBe(900);
  });
  it("V/W: a linked usage stops being offered again (no duplicate link/usage)", () => {
    const row = usageToGuidedRow(usage as any, "JCB");
    expect(linkedUsageIds([row]).has(900)).toBe(true);
    expect(unlinkedOpenUsages([usage as any], [row])).toHaveLength(0);
    expect(unlinkedOpenUsages([usage as any], [])).toHaveLength(1);
  });
  it("duplicate advisory fires for a manually-typed matching machine, not a linked row", () => {
    const manual = { machine: "jcb", passthrough: {} };
    expect(duplicateUsageAdvisory(manual, [usage as any], nameOf)).toContain("already recorded");
    const linked = usageToGuidedRow(usage as any, "JCB");
    expect(duplicateUsageAdvisory(linked, [usage as any], nameOf)).toBeNull();
  });
  it("X: a different machine or second legitimate run is never flagged/blocked", () => {
    expect(duplicateUsageAdvisory({ machine: "Roller", passthrough: {} }, [usage as any], nameOf)).toBeNull();
    // second run of the same machine: first row linked, second row typed —
    // advisory only (readiness never hard-blocks on duplication):
    const r = evaluateDprSubmitReadiness({
      equipment: [
        { machine: "JCB", openingReading: 1234.5, closingReading: 1241 },
        { machine: "JCB", openingReading: 1300, closingReading: 1305 },
      ],
    });
    expect(r.ready).toBe(true);
  });
});
