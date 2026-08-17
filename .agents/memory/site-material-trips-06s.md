---
name: Site Material Trips 06S seam
description: Procurement match resolver + unloadedAt/yard tracking for site material trips; explicit-stores-only GRN rule
---

**Rules:**
- GSB/WMM/aggregates/soil NEVER touch Stores (no GRN/stock/issue). Site Material Trip is the receipt of record; `unloadedAt` ("stretch" default when null / "yard" + yardLabel) is a permanent physical fact — DPR consumption never rewrites it, and reconciliation reports the stretch/yard split informationally only (no consumption allocation between buckets; there is no movement ledger).
- Procurement route is now a DELIBERATE choice: `plant_materials.procurement_route` has no default (schema + startup DROP DEFAULT), Material Master form blocks save without a choice, and every GRN-producing path (`submitPurchaserAction`, `recordDelivery`) requires an explicit `"stores"` route — null route yields a routeWarning, never a GRN.
- `getApplicablePiForBoqItem` (storage) + `GET /api/procurement/applicable-pi` is the only PI-match seam: explicit chain material_requirements.sourceBoqItemId → purchaseIndents.requirementId → items; open statuses only; item route in (material, bulk_plant); 0→null, >1→ambiguous (never guess), 1→ordered/received/balance (received = non-cancelled linked trips + bulk_receipt txns; Store GRNs excluded).
- `isHlcProcurementResponsible()` in shared/materialReceiptSummary.ts decides whether the PI lookup runs at all: agency types = fully_outsourced_composite / client_supplied / reused_excavated; daily override other_agency→agency, hlc→HLC; no arrangement / not_decided → HLC by default.

**Why:** a defaulted "stores" route silently turned bulk road materials into Store inventory; the resolver must never fuzzy-match or auto-create PIs.
**How to apply:** any new receipt entry point must send unloadedAt/yardLabel and attach PI ids only on a single unambiguous match; any new GRN path must check for explicit "stores".
