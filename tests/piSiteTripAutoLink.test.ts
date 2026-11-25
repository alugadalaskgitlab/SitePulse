import { describe, expect, it, vi } from "vitest";
import { autoLinkNewSiteTripToPi } from "../server/piSiteTripAutoLink";

const savedTrip = { id: 31, site: "Site A", material: "WMM", indentId: null, indentItemId: null };
const candidate = (indentItemId: number, indentNo = `PI-${indentItemId}`) => ({
  indentId: indentItemId + 100,
  indentItemId,
  indentNo,
  orderedQty: 100,
  deliveredQty: 0,
  balanceQty: 100,
  uom: "MT",
});
const actor = { userId: 7, userName: "Fixture operator" };

describe("PI-LINK-01 best-effort site trip auto-link", () => {
  it("links the only open site/material PI and returns its number for confirmation", async () => {
    const storage = {
      getApplicablePiForBoqItem: vi.fn(),
      getUnlinkedPiCandidatesForSiteTrip: vi.fn().mockResolvedValue([candidate(4)]),
      linkSiteMaterialTripsToPiItem: vi.fn().mockResolvedValue(undefined),
      getSiteMaterialTripById: vi.fn().mockResolvedValue({ ...savedTrip, indentId: 104, indentItemId: 4 }),
    };
    const result = await autoLinkNewSiteTripToPi({ storage, trip: savedTrip, input: {}, actor });
    expect(storage.linkSiteMaterialTripsToPiItem).toHaveBeenCalledWith(expect.objectContaining({
      indentId: 104, itemId: 4, tripIds: [31], action: "auto", actor,
    }));
    expect(result).toMatchObject({
      linkedPiIndentNo: "PI-4",
      trip: { indentItemId: 4 },
      piLinkOptions: [],
    });
  });

  it("returns a post-save choice when multiple PIs match and does not link", async () => {
    const matches = [candidate(4), candidate(5)];
    const storage = {
      getApplicablePiForBoqItem: vi.fn(),
      getUnlinkedPiCandidatesForSiteTrip: vi.fn().mockResolvedValue(matches),
      linkSiteMaterialTripsToPiItem: vi.fn(),
      getSiteMaterialTripById: vi.fn(),
    };
    const result = await autoLinkNewSiteTripToPi({ storage, trip: savedTrip, input: {}, actor });
    expect(result.piLinkOptions).toEqual(matches);
    expect(storage.linkSiteMaterialTripsToPiItem).not.toHaveBeenCalled();
    expect(result.trip).toBe(savedTrip);
  });

  it("leaves the saved trip unlinked when nothing matches", async () => {
    const storage = {
      getApplicablePiForBoqItem: vi.fn(),
      getUnlinkedPiCandidatesForSiteTrip: vi.fn().mockResolvedValue([]),
      linkSiteMaterialTripsToPiItem: vi.fn(),
    };
    await expect(autoLinkNewSiteTripToPi({ storage, trip: savedTrip, input: {}, actor }))
      .resolves.toEqual({ trip: savedTrip, piLinkOptions: [], linkedPiIndentNo: null });
  });

  it("does not fail the saved trip if lookup or automatic linking fails", async () => {
    const storage = {
      getApplicablePiForBoqItem: vi.fn(),
      getUnlinkedPiCandidatesForSiteTrip: vi.fn().mockResolvedValue([candidate(4)]),
      linkSiteMaterialTripsToPiItem: vi.fn().mockRejectedValue(new Error("PI changed")),
      getSiteMaterialTripById: vi.fn(),
    };
    await expect(autoLinkNewSiteTripToPi({ storage, trip: savedTrip, input: {}, actor }))
      .resolves.toEqual({ trip: savedTrip, piLinkOptions: [], linkedPiIndentNo: null });
  });

  it("uses a unique BOQ match before broad site/material matches", async () => {
    const boq = {
      indentId: 200,
      indentItemId: 20,
      indentNo: "PI-BOQ",
      orderedQty: 50,
      receivedQty: 0,
      balanceQty: 50,
    };
    const storage = {
      getApplicablePiForBoqItem: vi.fn().mockResolvedValue(boq),
      getUnlinkedPiCandidatesForSiteTrip: vi.fn(),
      linkSiteMaterialTripsToPiItem: vi.fn().mockResolvedValue(undefined),
      getSiteMaterialTripById: vi.fn().mockResolvedValue({ ...savedTrip, indentId: 200, indentItemId: 20 }),
    };
    const result = await autoLinkNewSiteTripToPi({
      storage,
      trip: savedTrip,
      input: { boqProjectId: 1, boqItemId: 2, material: "WMM", uom: "MT" },
      actor,
    });
    expect(storage.getUnlinkedPiCandidatesForSiteTrip).not.toHaveBeenCalled();
    expect(result.linkedPiIndentNo).toBe("PI-BOQ");
  });
});
