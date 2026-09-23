import { describe, expect, it } from "vitest";
import {
  computeItemEntries,
  progressReportEntryMatchesSite,
  progressReportSiteOptions,
  sortForDisplay,
  type ReportBoqItem,
  type ReportEntry,
} from "../shared/progressReport";

const item: ReportBoqItem = {
  id: 1,
  description: "Dense bituminous macadam",
  unit: "Cum",
  boqQty: 1000,
  dprMeasurementMethod: "CUM_LWT",
};

function row(entryId: number, site: string, date: string, chainage: number, quantity: number): ReportEntry {
  return {
    kind: "progress",
    entryId,
    dprId: entryId,
    dprDate: date,
    site,
    boqItemId: 1,
    chainageFromKm: chainage,
    chainageToKm: chainage + 0.1,
    quantity,
    uom: "Cum",
  };
}

describe("PR-01 site normalization and shared display sorting", () => {
  const raw = [
    row(1, "Site Alpha – Edited by Admin – 2026-09-01 10:00:00", "2026-09-03", 3, 30),
    row(2, "SITE ALPHA - Copy by Engineer - 2026-09-02 11:00:00", "2026-09-01", 1, 10),
    row(3, "Site Beta", "2026-09-02", 2, 20),
    row(4, "Site Beta – Edited by Manager – 2026-09-03 12:00:00", "2026-09-04", 4, 40),
  ];
  const computed = computeItemEntries(raw, item);

  it("deduplicates multiply-edited site options and matches every legacy suffix", () => {
    expect(progressReportSiteOptions(raw)).toEqual(["Site Alpha", "Site Beta"]);
    expect(raw.filter((entry) => progressReportEntryMatchesSite(entry, "Site Alpha")).map((entry) => entry.entryId)).toEqual([1, 2]);
  });

  it("keeps site blocks contiguous and reverses blocks plus chainage within each block", () => {
    const asc = sortForDisplay(computed, "chainage_date", "asc", true);
    const desc = sortForDisplay(computed, "chainage_date", "desc", true);
    expect(asc.map((entry) => entry.entryId)).toEqual([2, 1, 3, 4]);
    expect(desc.map((entry) => entry.entryId)).toEqual([4, 3, 1, 2]);
  });

  it("reverses site blocks plus dates while preserving chronological cumulatives", () => {
    const before = new Map(computed.map((entry) => [entry.entryId, entry.runningCumulative]));
    const asc = sortForDisplay(computed, "date_chainage", "asc", true);
    const desc = sortForDisplay(computed, "date_chainage", "desc", true);
    expect(asc.map((entry) => entry.entryId)).toEqual([2, 1, 3, 4]);
    expect(desc.map((entry) => entry.entryId)).toEqual([4, 3, 1, 2]);
    for (const entry of [...asc, ...desc]) {
      expect(entry.runningCumulative).toBe(before.get(entry.entryId));
    }
  });

  it("does not mutate source entries or rewrite raw site provenance", () => {
    sortForDisplay(computed, "chainage_date", "desc", true);
    expect(computed[0].site).toBe("SITE ALPHA - Copy by Engineer - 2026-09-02 11:00:00");
    expect(raw[0].site).toContain("Edited by Admin");
  });
});