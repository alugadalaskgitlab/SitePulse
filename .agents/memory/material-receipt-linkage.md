---
name: Material Receipt ↔ Arrangement ↔ DPR linkage (06E)
description: How bulk material receipts (site_material_trips) link to earthwork arrangements and DPR activities; seam file, no-FK design, no-proration rule, conservative matching.
---

## Seam
`shared/materialReceiptSummary.ts` is the ONLY place for arrangement applicability, Required-Today resolution, Received aggregation, comparison math, and receipt match classification. UI (`client/src/components/ActivityReceiptStrip.tsx`, used in GuidedDpr Step 3 + read-only in SiteEntry/SiteEdit) and routes must call it, never re-derive.

## Rules (user-approved, load-bearing)
- **No proration, ever:** a multi-day programme bar's plannedQty is context only ("whole bar, not per day"). Required Today priority: arrangement bar allocation → day-specific programme qty (none exists in SitePulse today) → BOM resolver → "Not determined". `resolveRequiredToday` deliberately has no bar-total/day-count inputs so proration cannot be expressed.
- **No DB FKs by design:** the four linkage columns on `site_material_trips` (boq_project_id, boq_item_id, programme_bar_id, earthwork_arrangement_id) are plain nullable integers; `validateTripLinkage` in routes does app-level existence/consistency checks. **Why:** historical rows + cross-module coupling; publish diff must never see FK churn. Columns are also in `ensureSiteMaterialTripsLinkageColumns` (startup ensure) — keep schema.ts, the ensure, and both DBs in lockstep.
- **Conservative matching:** stable IDs → "linked"; same site+date+exact material only → "suggested" (user must click); never fuzzy auto-link on supplier/material text. Cancelled/deleted trips excluded everywhere.
- **Mixed UoMs never summed**; comparison lines render only when all bases match (`COMPARISON_BASES_DIFFER` otherwise).
- **PATCH relink guard:** linkage PATCH validates the MERGED record and returns 409 if a non-null linkage field would change to a different value — unlink first.
- **arrangementType relevance:** reused_excavated → no receipt prompt; client_supplied → context badge, not an HLC payable; Record Receipt reuses the existing site-material-trip endpoint (no DPR duplicate).
- Multi-item arrangements have boqItemId NULL + jsonb `boqItemAllocations`; `getEarthworkArrangementsForItem` must include them (JS filter), or they silently vanish from the strip.

## Known future gap (reported, not built)
Vendor billing tie-in: arrangements store agencyName as free text (no vendor master FK); `getVendorBillAutoItems` matches supplier text only.
