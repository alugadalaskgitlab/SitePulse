---
name: Site-access security model
description: Deny-by-default site access, explicit all-sites grant, guided user creation, per-user guided-DPR preference
---

# Site-access security (pre-deployment fix, Aug 2026)

**Rule:** `shared/siteAccess.ts` `resolvePermittedSiteIds()` is the only site-access brain. Zero `user_site_access` rows = NO sites (`[]`), never "all sites". Company-wide access requires the explicit `users.all_sites_access` grant, or isAdmin/isOwner (both return `null` = unrestricted). Setup-incomplete users (`users.setup_complete=false`) are denied everything, even with saved rows/grants.

**Why:** the legacy "zero rows ⇒ all sites" default silently gave new/unconfigured non-admin users full company data.

**How to apply:**
- Never reintroduce a null fallback for zero rows; downstream consumers already treat `[]` as deny-all and `null` as unrestricted.
- New columns are ensured at startup (`storage.ensureUserAccessColumns`), so prod gets them automatically on first deploy boot.
- Guided creation: POST /api/auth/users accepts roleTemplate/permissions/siteAccess; partial failure → account marked setup-incomplete; POST /:id/complete-setup retries the SAME user (uniqueness checks make duplicates impossible).
- Escalation guards: non-admin actors (incl. permission managers) can never edit admin/owner users, change privileged flags (isAdmin/canManagePermissions/permissionManagerScope), create admins, or hand out site scope beyond their own (`checkSiteScopeAllowed`); partial managers' granted matrices are capped to their own (`coerceAndCapMatrix`).
- Audit endpoint GET /api/auth/users/site-access-audit lists non-admin users with zero rows + no grant (surfaces in UserManagement banner).

# Guided DPR default

- Guided is default for ALL DPR-authorised users; preference is per-user localStorage key `sitelog.dprEntryMode.u<id>`, bound via `bindDprEntryModeUser()` in auth-context (one-time legacy device-wide key migration).
- Classic→Guided draft switch: GuidedDpr accepts `?draftId=`; the SiteEdit "Guided DPR" button only shows for guided-compatible drafts (no materials/site purchases/structure items/meter readings/personnel links) — otherwise a Guided save would silently drop those sections.
- SiteEntry's internal "guided mobile layout" defaultGuided is now hard false; /site/guided is the guided experience.
