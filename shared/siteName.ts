/**
 * Base-site-name normalisation — single source of truth for client AND server.
 *
 * When a DPR is edited or copied, its `site` string gets a provenance suffix,
 * e.g. "TAKKADPALLY-SIRUR – Edited by Manager – 2026-06-07 07:00:21" or
 * "SITE – Copy by Admin – ...". Any comparison of a DPR's site against a
 * configured site name (site-access checks, dashboard filters, exports) must
 * compare BASE names, or suffixed reports silently disappear for
 * site-restricted users while admins still see them.
 */
export function getBaseSiteName(site: string): string {
  if (!site) return site;
  // Strip " – Edited by ..." / " - Copy by ..." (any dash variant or colon).
  let result = site.replace(/\s*[-–—:]\s*(Edited by|Copy by)\s+.*/i, "").trim();
  // Fallback: suffix without a dash separator.
  result = result.replace(/\s+(Edited by|Copy by)\s+.*/i, "").trim();
  return result || site;
}

/**
 * Normalized key for exact site comparisons. Site names are business labels,
 * so differences in case or repeated whitespace are not distinct sites; the
 * comparison remains exact after normalization (never a prefix match).
 */
export function normalizeSiteName(site: string): string {
  return getBaseSiteName(site).trim().replace(/\s+/g, " ").toUpperCase();
}

/** True when `dprSite`'s base name matches any of the permitted site names. */
export function siteMatchesPermitted(dprSite: string, permittedSiteNames: string[]): boolean {
  const base = normalizeSiteName(dprSite);
  return permittedSiteNames.some((name) => normalizeSiteName(name) === base);
}

/** Vendor-bill lines retain a display prefix ("SITE:" / "SITE*:"). */
export function vendorBillItemMatchesSite(itemSite: string | null | undefined, siteName: string): boolean {
  if (!itemSite) return false;
  const unprefixed = itemSite.replace(/^SITE\*?\s*:\s*/i, "").trim();
  return siteMatchesPermitted(unprefixed, [siteName]);
}

export function vendorBillVisibleToSites(
  bill: { siteId?: number | null; items?: { siteName?: string | null }[] | null },
  permittedSiteNames: string[],
  siteNameById: ReadonlyMap<number, string>,
): boolean {
  if (bill.siteId != null) {
    return siteMatchesPermitted(siteNameById.get(bill.siteId) || "", permittedSiteNames);
  }
  const items = bill.items || [];
  return items.length > 0 && items.every(item =>
    permittedSiteNames.some(site => vendorBillItemMatchesSite(item.siteName, site)));
}

type VendorBillSourceItem = {
  source?: string | null;
  date?: string | null;
  category?: string | null;
  description?: string | null;
  siteName?: string | null;
};

/** Existing generated evidence is trusted only while its saved provenance is unchanged. */
export function untrustedVendorBillAutoItems(
  submitted: VendorBillSourceItem[],
  existing: VendorBillSourceItem[] = [],
): VendorBillSourceItem[] {
  const same = (left: string | null | undefined, right: string | null | undefined) =>
    String(left || "").trim().replace(/\s+/g, " ").toUpperCase() ===
    String(right || "").trim().replace(/\s+/g, " ").toUpperCase();
  return submitted.filter(item => {
    const source = String(item.source || "").toLowerCase();
    if (source !== "auto" && !source.startsWith("auto:")) return false;
    return !existing.some(saved =>
      same(saved.source, item.source) &&
      same(saved.date, item.date) &&
      same(saved.category, item.category) &&
      same(saved.description, item.description) &&
      same(saved.siteName, item.siteName));
  });
}

export function vendorBillUpdateSiteId(
  payloadHasSiteId: boolean,
  proposedSiteId: number | null | undefined,
  existingSiteId: number | null | undefined,
): number | null | undefined {
  return payloadHasSiteId ? proposedSiteId : existingSiteId;
}

export function vendorBillAutoSourceFromCandidate(candidate: {
  sourceId?: number | string | null;
  sourceType?: string | null;
}): string | null {
  if (candidate.sourceId == null || String(candidate.sourceId) === "") return null;
  const id = String(candidate.sourceId).toLowerCase();
  return candidate.sourceType === "site_material_trip_material"
    ? `auto:site_material_trip_material:${id}`
    : `auto:${id}`;
}
