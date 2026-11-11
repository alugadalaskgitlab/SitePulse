import { describe, expect, it } from "vitest";
import {
  buildRateCardTidyGroups,
  buildUnlinkedRateCardGroups,
  planRateCardTidyOperations,
  type RateCardTidyCard,
} from "@shared/vendorRateCardTidy";
import {
  applyRateCardTidyPlan,
  rateCardTidyVersion,
  type RateCardTidyRepository,
} from "../server/vendorRateCardTidy";

const linkedCard = (overrides: Partial<RateCardTidyCard> & Pick<RateCardTidyCard, "id" | "itemKey" | "rate">): RateCardTidyCard => ({
  id: overrides.id,
  vendorName: overrides.vendorName ?? "GANGARAM NARSIMULU",
  vendorId: overrides.vendorId === undefined ? 2 : overrides.vendorId,
  category: overrides.category ?? "material",
  itemKey: overrides.itemKey,
  itemLabel: overrides.itemLabel ?? "20 MM",
  unit: overrides.unit ?? "MT",
  rate: overrides.rate,
  notes: overrides.notes ?? null,
  leadDistanceKm: overrides.leadDistanceKm ?? null,
  payloadMt: overrides.payloadMt ?? null,
  ratePerKm: overrides.ratePerKm ?? null,
  updatedAt: overrides.updatedAt ?? "2026-11-01T00:00:00.000Z",
});

describe("vendor rate-card tidy planning", () => {
  const vendors = [{ id: 2, name: "GANGARAM NARSIMULU", isActive: true }];

  it("plans same-rate copies automatically but leaves unlinked rows out of the vendor group", () => {
    const cards = [
      linkedCard({ id: 4, itemKey: "MAT_20MM_MT", rate: 390 }),
      linkedCard({ id: 94, vendorName: "GANGARAM NARSIMULU", itemKey: "MAT_20_MM_MT", rate: 390 }),
      linkedCard({ id: 200, vendorId: null, vendorName: "GANGARAM NARSIMULU", itemKey: "MAT_20MM_MT", rate: 390 }),
    ];
    const groups = buildRateCardTidyGroups(cards, vendors);
    expect(groups).toHaveLength(1);
    expect(groups[0].sameRate).toBe(true);
    expect(groups[0].rows.map(row => row.id)).toEqual([4, 94]);
    expect(planRateCardTidyOperations(groups, [])).toMatchObject([
      { keepCardId: 4, rate: 390, choice: "same_rate_merge", rows: [{ id: 4 }, { id: 94 }] },
    ]);
    expect(buildUnlinkedRateCardGroups(cards)).toHaveLength(1);
  });

  it("requires an explicit conflict choice, or allows Decide later to leave the group untouched", () => {
    const groups = buildRateCardTidyGroups([
      linkedCard({ id: 4, itemKey: "MAT_20MM_MT", rate: 390 }),
      linkedCard({ id: 94, itemKey: "MAT_20_MM_MT", rate: 600 }),
    ], vendors);
    expect(groups[0].sameRate).toBe(false);
    expect(() => planRateCardTidyOperations(groups, [])).toThrow(/Choose a rate or Decide later/);
    expect(planRateCardTidyOperations(groups, [{ key: groups[0].key, action: "defer" }])).toEqual([]);
    expect(planRateCardTidyOperations(groups, [{ key: groups[0].key, action: "keep", keepCardId: 94 }]))
      .toMatchObject([{ keepCardId: 94, rate: 600, choice: "selected_rate" }]);
    expect(planRateCardTidyOperations(groups, [{ key: groups[0].key, action: "custom", rate: 725 }]))
      .toMatchObject([{ rate: 725, choice: "custom_rate" }]);
  });

  it("applies only planned merges, preserves setup metadata, and audits each changed or removed row", async () => {
    const cards = [
      linkedCard({ id: 4, vendorName: "G SANGANNA", itemKey: "EQ_TIPPER_TRIP", category: "transport", itemLabel: "WMM", unit: "TRIP", rate: 5000 }),
      linkedCard({ id: 15, vendorName: "G SANGANNA", itemKey: "EQ_TIPPER_TRIP", category: "transport", itemLabel: "WMM", unit: "TRIP", rate: 5000, leadDistanceKm: 8, ratePerKm: 125, notes: "transport note" }),
      linkedCard({ id: 30, vendorName: "G SANGANNA", itemKey: "MAT_SOIL_TRIP", category: "material", itemLabel: "SOIL", unit: "TRIPS", rate: 800 }),
      linkedCard({ id: 31, vendorName: "G SANGANNA", itemKey: "MAT_SOIL_TRIP", category: "material", itemLabel: "SOIL", unit: "TRIPS", rate: 1450 }),
    ];
    const snapshot = { cards: cards.map(card => ({ ...card })), vendors: [{ id: 2, name: "G SANGANNA", isActive: true }] };
    const audits: any[] = [];
    const repository: RateCardTidyRepository = {
      loadSnapshotForUpdate: async () => snapshot,
      updateCard: async (id, patch) => {
        const target = snapshot.cards.find(card => card.id === id)!;
        Object.assign(target, patch);
        return { ...target };
      },
      deleteCard: async id => {
        const index = snapshot.cards.findIndex(card => card.id === id);
        const [deleted] = snapshot.cards.splice(index, 1);
        return { ...deleted };
      },
      addAudit: async audit => { audits.push(audit); },
    };
    const beforeVersion = rateCardTidyVersion(snapshot);
    const groups = buildRateCardTidyGroups(snapshot.cards, snapshot.vendors);
    const soilConflict = groups.find(group => !group.sameRate)!;
    const result = await applyRateCardTidyPlan(repository, {
      previewVersion: beforeVersion,
      reason: "Keep reviewed supplier rates",
      decisions: [{ key: soilConflict.key, action: "defer" }],
    }, { id: 7, fullName: "Owner Test" });

    expect(result).toEqual({ mergedRows: 1, mergedGroups: 1, changedRates: 0, deferredConflicts: 1 });
    expect(snapshot.cards.find(card => card.id === 15)).toMatchObject({
      vendorName: "G SANGANNA", vendorId: 2, leadDistanceKm: 8, ratePerKm: 125, notes: "transport note",
    });
    expect(snapshot.cards.filter(card => card.id === 30 || card.id === 31)).toHaveLength(2);
    expect(audits).toHaveLength(1);
    expect(audits.map(audit => audit.transactionId)).toEqual([4]);
    expect(audits.every(audit => audit.reason === "Keep reviewed supplier rates")).toBe(true);
    expect(audits.every(audit => (audit.newValues as any).keptRow?.id === 15)).toBe(true);
  });

  it("rejects a stale preview before making any write", async () => {
    const snapshot = {
      cards: [linkedCard({ id: 4, itemKey: "MAT_SAND_CFT", rate: 90 })],
      vendors,
    };
    let writes = 0;
    const repository: RateCardTidyRepository = {
      loadSnapshotForUpdate: async () => snapshot,
      updateCard: async () => { writes++; throw new Error("Unexpected write"); },
      deleteCard: async () => { writes++; throw new Error("Unexpected write"); },
      addAudit: async () => { writes++; },
    };
    await expect(applyRateCardTidyPlan(repository, {
      previewVersion: "old-preview",
      reason: "Reviewed rates",
      decisions: [],
    }, { id: 7, fullName: "Owner Test" })).rejects.toThrow(/changed after preview/);
    expect(writes).toBe(0);
  });
});
