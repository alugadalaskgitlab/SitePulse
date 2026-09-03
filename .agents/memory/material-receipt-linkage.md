---
name: Material Receipt ↔ Arrangement ↔ DPR linkage (06E)
description: How bulk material receipts (site_material_trips) link to earthwork arrangements and DPR activities; seam file, no-FK design, no-proration rule, conservative matching.
---

## Seam
`shared/materialReceiptSummary.ts` is the ONLY place for arrangement applicability, Required-Today resolution, Received aggregation, comparison math, and receipt match classification. UI (`client/src/components/ActivityReceiptStrip.tsx`, used in GuidedDpr Step 3 + read-only in SiteEntry/SiteEdit) and routes must call it, never re-derive.

## Rules (user-approved, load-bearing)
- **No proration, ever:** DPR "Required today" comes only from the selected active arrangement's explicit planned daily output, converted to the BOQ UOM. Missing/unsupported output is "Not determined"; bar allocation, programme, BOM, and remaining-days estimates are never fallbacks.
  **Why:** The target must be an explicit daily commitment, not an invented share of a bar or demand total.
  **How to apply:** Vendor and HLC in-house arrangements follow the same rule; unsupported mass↔volume conversion remains Not determined.
- **No DB FKs by design:** the four linkage columns on `site_material_trips` (boq_project_id, boq_item_id, programme_bar_id, earthwork_arrangement_id) are plain nullable integers; `validateTripLinkage` in routes does app-level existence/consistency checks. **Why:** historical rows + cross-module coupling; publish diff must never see FK churn. Columns are also in `ensureSiteMaterialTripsLinkageColumns` (startup ensure) — keep schema.ts, the ensure, and both DBs in lockstep.
- **Conservative matching:** exact arrangement ID, then exact programme-bar + BOQ-item IDs → "linked"; material text alone is never authoritative. Cancelled/deleted trips are excluded everywhere.
- **Mixed receipt UoMs are never summed.** A single-basis CFT value may be converted to/from CUM with the standard volume factor for receipt comparisons; MT or loose/compacted conversion still requires explicit material evidence.
  **Why:** Receipt rows carry only a UOM and do not mark CFT as loose volume; the shared UOM utility already defines CFT↔CUM as the same physical volume. Mass and compaction factors remain material-specific.
  **How to apply:** Keep conversion in the shared receipt-comparison seam, convert displayed receipt/balance quantities onto the arrangement/required basis, and leave mixed UOMs or unsupported pairs non-comparable.
- **PATCH relink guard:** linkage PATCH validates the MERGED record and returns 409 if a non-null linkage field would change to a different value — unlink first.
- **arrangementType relevance:** reused_excavated → no receipt prompt; client_supplied → context badge, not an HLC payable; Record Receipt reuses the existing site-material-trip endpoint (no DPR duplicate).
- Multi-item arrangements have boqItemId NULL + jsonb `boqItemAllocations`; `getEarthworkArrangementsForItem` must include them (JS filter), or they silently vanish from the strip.

## Known future gap (reported, not built)
Vendor billing tie-in: arrangements store agencyName as free text (no vendor master FK); `getVendorBillAutoItems` matches supplier text only.

**06E-F standalone form:** `client/src/components/ReceiptWorkContext.tsx` is the standalone-form UI seam (optional Work Context section + read-only `TripWorkContextSummary` + readable arrangement/bar labels). Trap: `getAllMaterialsReceived` remaps trip rows to a reduced shape — any new trip column shown in the materials-received view must be explicitly added to that map or it arrives `undefined` and the UI silently hides it.

## Reused-excavation source boundary
Reused-excavation may drive operational/no-receipt semantics only with an explicit, distinct source excavation BOQ item from the same project. Source-side context is read-only and must never persist the destination fill arrangement.

**Why:** Legacy missing-source or self-linked arrangements are historical facts, but treating them as valid would suppress receipt evidence without a traceable cut-to-fill source.

**How to apply:** Keep invalid historical IDs stored, but show an arrangement as current only while approved, mobilisation_pending, or in_progress. Exclude all other states from applicability/prefill and never infer or auto-repair the intended source or fill item.
