// Defaults such as category/unit do not make a manual editor row meaningful.
// Preserve other entered metadata and every source-backed row, even at zero value.
export function isTrulyBlankManualBillRow(item: {
  source?: string | null; description?: string | null; qty?: number; rate?: number;
  amount?: number; date?: string | null; equipmentId?: number | null;
  leadDistance?: number | null; suppliedTo?: string | null; transporter?: string | null;
  siteName?: string | null; sourceId?: unknown; sourceType?: string | null;
  vehicleNumber?: string | null; receiptNumber?: string | null;
  vendorName?: string | null; physicalQuantity?: number; physicalUnit?: string | null;
}) {
  return item.source === "manual" && !item.description?.trim()
    && !item.qty && !item.rate && !item.amount && !item.date?.trim()
    && !item.equipmentId && !item.leadDistance && !item.suppliedTo?.trim()
    && !item.transporter?.trim() && !item.siteName?.trim() && item.sourceId == null
    && !item.sourceType && !item.vehicleNumber?.trim() && !item.receiptNumber?.trim()
    && !item.vendorName?.trim() && !item.physicalQuantity && !item.physicalUnit?.trim();
}