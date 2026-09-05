---
name: BOQ Item Display Naming
description: User-facing BOQ labels come only from the BOQ row; SNL/SDB naming is restricted to internal calculations and classification.
---

Rule: The shared BOQ naming helper is the single source of truth. User-facing priority is: saved `displayName` → BOQ `itemName` → BOQ `description`. Canonical/SNL/SDB labels must never rename BOQ items in selectors, DPRs, programmes, or reports.

**Why:** Development and production can assign different meanings to the same numeric SNL catalogue IDs. Letting mapping labels override BOQ names caused unrelated labels such as DBM and “Extra over item” to appear for valid BOQ rows.

**How to apply:**
- Never re-implement short-name logic locally; import from shared.
- Operational screens and exports (DPR, programme, demand, reports, pickers, reviews) must all use the shared helper.
- Preserve saved BOQ label casing and terminology; only collapse surrounding/repeated whitespace for display.
- SNL fields remain available to planning, sequencing, recipes, duration, equipment/labour norms, material calculations, and internal classification.
- Full BOQ descriptions may remain as secondary detail/tooltips, but the primary visible item identity uses the shared helper.
- Historic DPR `activity` text is untouched; programme/bar linkage matches on IDs, never on activity text.
- Regression tests: `tests/boqItemDisplayName.test.ts` (helper rules + source scans).
