---
name: DPR Batch 04 — UOM consistency & submit readiness
description: Conversion-factor contract, measurement display rules, submit-readiness mandatory/advisory contract, Guided equipment passthrough pattern
---

## Conversion factor contract
- Stored DPR progress quantities remain physical, never BOQ credit. Resolve physical source → saved contractual BOQ unit exactly once; do not blindly multiply a saved factor. Same-unit credit is identity and known dimensional conversions are authoritative. Never rewrite historical physical measurements to repair a configuration error.
- `shared/dprGeometry.ts` Batch 04 section (`resolveDprConversionFactor`, `boqProgressQty`, `formatDprDimensions`, `dprMeasurementSummary`, `formatDprMeasurement`) is the ONLY measurement/display seam. Summary (SiteDashboard), Detail (DprDetails), and exports must all use it — no local L×W×T string building (`0 × 1.5 × 0` bug came from `p.length || 0` substitution).
- Geometry-backed rows persist the profile’s physical UOM (Ha/acre BOQ items persist SQM). The BOQ UOM belongs only to converted credit; legacy row UOM must not relabel physical quantity.
- Every actuals consumer must carry the same source evidence (row kind, UOM, quantity source, geometry and override provenance). Partial metadata can change interpretation between reports. Unresolved conversion must be surfaced as incomplete rather than silently treated as complete zero.
- Advisory conversion warnings must not suppress valid credit or prevent completion. Unresolved conversion is a separate state that preserves visible physical evidence. **Why:** treating all warnings as invalid drops legitimate same-unit quantities; filtering invalid evidence before building warnings hides unresolved history.
- **Why:** comparing 350 SQM directly with a 1.468 Ha balance produced false over-balance warnings and displayed 350 as Ha; the correct BOQ credit is 0.035 Ha.
- **Rule:** derive conversion semantics from contractual units and physical-source provenance, never numeric record IDs. **Why:** IDs do not establish semantic identity across databases.
- **Rule:** Unknown actual credit must remain unknown in balances, productivity, running totals, and completion decisions. Period incompleteness is chronological: future unresolved evidence must not invalidate earlier totals. Saved contractual unit wins over a stale canonical alias during factor-only edits.
  **Why:** Correct API conversion alone did not protect downstream consumers that treated nullable actuals as zero or partial totals as complete.
  **How to apply:** Audit every consumer when widening actuals to nullable; retain valid advisory-warning credit and preserve independent saved planned quantities.

## Submit readiness contract
- `shared/dprSubmitReadiness.ts` is the single validator, consumed identically by Guided DPR, SiteEntry, SiteEdit, AND server (POST /api/dprs non-draft + POST /:id/submit → 422 `DPR_NOT_READY` with `{mandatory, advisories}`). Drafts are never gated.
- **Why:** false-positive submit blocking is a release blocker. Mandatory = only unambiguous half-completed rows (opening w/o closing, start w/o end time, selected activity w/o qty, half chainage pair, labour category w/o positive count, material w/o qty). Everything ambiguous = advisory: machine with no usage evidence, missing material UOM, side.
- Water-tanker exception: `waterQuantity` counts as usage evidence and exempts the trip-pair rule.
- UI: one consolidated `DprReadinessDialog` (client/src/components) — advisory-only allows "Submit anyway"; SiteEntry must render it in BOTH showPreview and main branches (known trap).

## Guided equipment passthrough
- Guided edits only machine/vehicleNo/operator/task; `shared/guidedEquipment.ts` split/build helpers round-trip every other field via a `passthrough` bag (id/dprId stripped). New rows fabricate NO ""/null fields.
- **Why:** Guided payload previously hard-coded other fields to ""/null, silently wiping Detailed-editor data; Guided also sent `materials: []`/`sitePurchases: []` which the child-row-replacement update deleted — now passed back via `unmanagedSectionsRef`.
- Historical Guided-wiped equipment fields are irrecoverable (no backfill possible).
