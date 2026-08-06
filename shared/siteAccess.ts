/**
 * Pre-Deployment Access Instruction — authoritative site-access semantics.
 *
 * The single pure resolver behind storage.getUserPermittedSiteIds(). The old
 * rule "zero user_site_access rows ⇒ all sites" was an unsafe default: a
 * non-admin user with no explicit records must have access to NO sites.
 * Company-wide access is always an explicit recorded grant.
 *
 * Return contract (unchanged shape so every downstream consumer keeps working):
 *   null  → unrestricted (admin/owner, or an explicit all-sites grant)
 *   []    → NO site access (deny-all; downstream already treats [] as deny)
 *   [ids] → exactly these sites
 */

export interface SiteAccessUserLike {
  isAdmin?: boolean | null;
  isOwner?: boolean | null;
  /** Explicit recorded company-wide grant (users.all_sites_access). */
  allSitesAccess?: boolean | null;
  /** False while guided user-creation has not finished permissions + access. */
  setupComplete?: boolean | null;
  isActive?: boolean | null;
}

export function resolvePermittedSiteIds(
  user: SiteAccessUserLike | null | undefined,
  accessRowSiteIds: number[],
): number[] | null {
  // Unknown user — deny everything rather than defaulting open.
  if (!user) return [];
  // Admin/Owner retain the existing authorised company-wide behaviour.
  if (user.isAdmin || user.isOwner) return null;
  // Setup-incomplete users are denied ALL site-scoped data, even if some
  // access rows were saved before the setup failed part-way.
  if (user.setupComplete === false) return [];
  // Explicit recorded all-sites grant.
  if (user.allSitesAccess) return null;
  // Explicit selected sites.
  if (accessRowSiteIds.length > 0) return Array.from(new Set(accessRowSiteIds));
  // Zero rows + no grant ⇒ no sites. Never null.
  return [];
}
