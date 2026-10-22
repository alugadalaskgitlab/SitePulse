export type VendorIdentityDisplayInput = {
  recordedName?: string | null;
  vendorId?: number | null;
  linkedVendorName?: string | null;
};

/**
 * Resolve a vendor label for display only. The recorded value is never changed.
 * A stale/missing master lookup falls back to the saved text rather than
 * inventing a name or hiding the record.
 */
export function vendorIdentityDisplayName({
  recordedName,
  vendorId,
  linkedVendorName,
}: VendorIdentityDisplayInput): string {
  if (vendorId != null && linkedVendorName?.trim()) return linkedVendorName.trim();
  return recordedName?.trim() || "";
}

