import { describe, expect, it } from "vitest";
import { prepareTripMasterSelection } from "./tripMasterSelection";

const vendor = { id: 13, name: "Saravana", businessName: "SARAVANA METAL INDUSTRIES", isActive: true };
const tx = {
  select: () => ({
    from: () => ({
      where: async () => [vendor],
    }),
  }),
};
const selection = { equipmentId: null, actor: { id: 7, fullName: "Reviewer" } };

describe("trip Vendor Master alias links", () => {
  it("accepts an explicitly selected vendor when the recorded trip name is its alias", async () => {
    await expect(prepareTripMasterSelection(
      tx,
      { supplier: "Earthcon Construction", supplierVendorId: 13 },
      selection,
      undefined,
      async name => name === "EARTHCON CONSTRUCTION"
        ? ["EARTHCON CONSTRUCTION", "SARAVANA"]
        : [],
    )).resolves.toBeUndefined();
  });

  it("still rejects an explicitly selected vendor when the recorded name is unrelated", async () => {
    await expect(prepareTripMasterSelection(
      tx,
      { supplier: "Unrelated Transport", supplierVendorId: 13 },
      selection,
      undefined,
      async () => ["UNRELATED TRANSPORT"],
    )).rejects.toMatchObject({ status: 400 });
  });
});
