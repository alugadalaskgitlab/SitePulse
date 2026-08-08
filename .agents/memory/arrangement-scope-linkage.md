---
name: Arrangement Applicable Scope linkage
description: Earthwork arrangements link to confirmed working reaches; register is arrangement-first; scope changes must reconcile bar allocations precisely.
---

- Arrangements carry an authoritative link to confirmed working reaches (jsonb id array); the free-text reach label and min/max chainage are display/legacy copies. Legacy free-text arrangements keep working unchanged — never migrate them.
- Only confirmed working reaches of the same project are linkable; constraints (no-scope/temporary-block/withdrawn), drafts and superseded reaches are rejected server-side.
- **Why the scope-guard exemption:** a reach-linked arrangement skips the raw-chainage "outside scope" block on create — internal no-scope intervals are clipped by the eligibility engine, so no manual reach split is needed.
- **Side-aware membership:** reach ranges carry side; bar↔reach eligibility requires corridor intersection (null side = full carriageway, matches either). A one-side reach must never allocate to the parallel opposite-side bar.
- **Precise membership rule:** allocation reconciliation must use the individual reach ranges, never the min/max envelope — non-contiguous selections have gaps the envelope would wrongly cover. Ranges are resolved from *current* segment geometry at sync time; a linked reach later superseded contributes no range, so its auto rows are stripped (manual rows never touched).
- **Trap fixed twice (reviewer-caught):** (1) operational fields sent alongside a material revision were silently dropped — apply them immediately in the same tx; (2) a scope-link change must be in the auto-sync trigger set or coverage silently goes stale.
- Register UX decision: Open always shows the arrangement first with its bar allocations as children; never jump straight into the first allocation. Stale linked reaches are visibly suffixed with their status.
- Startup column verification must list every new arrangements column or the schema-ready flag can go true against a legacy DB missing it.
