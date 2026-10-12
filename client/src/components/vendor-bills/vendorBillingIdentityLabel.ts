export interface VendorBillingIdentity {
  id: number;
  name: string;
  businessName?: string | null;
}

/** Presentation only: never use this label as a vendor request or financial key. */
export function vendorBillingIdentityLabel(
  canonicalName: string,
  identities: readonly VendorBillingIdentity[] = [],
): string {
  const matches = identities.filter(identity =>
    identity.name.trim().toUpperCase() === canonicalName.trim().toUpperCase());
  // A name alone cannot resolve duplicate Master identities safely.
  if (matches.length !== 1) return canonicalName;
  return matches[0].businessName?.trim() || matches[0].name;
}
