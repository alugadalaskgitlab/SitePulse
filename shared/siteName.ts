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

/** True when `dprSite`'s base name matches any of the permitted site names. */
export function siteMatchesPermitted(dprSite: string, permittedSiteNames: string[]): boolean {
  const base = getBaseSiteName(dprSite);
  return permittedSiteNames.some((name) => getBaseSiteName(name) === base);
}
