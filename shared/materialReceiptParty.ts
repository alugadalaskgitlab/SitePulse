export type MaterialReceiptPartyFields = {
  partyId?: number | null;
  isPlantCommon?: number | boolean | null;
};

/**
 * Contractor/other-party stock is not an HLC purchase. If HLC cannot be
 * resolved, fail closed and keep the existing HLC receipt workflow.
 */
export function isPartyNonPurchaseReceipt(
  receipt: MaterialReceiptPartyFields,
  hlcPartyId: number | null | undefined,
): boolean {
  if (hlcPartyId == null || receipt.partyId == null) return false;
  if (receipt.isPlantCommon === true || Number(receipt.isPlantCommon) === 1) return false;
  return Number(receipt.partyId) !== Number(hlcPartyId);
}
