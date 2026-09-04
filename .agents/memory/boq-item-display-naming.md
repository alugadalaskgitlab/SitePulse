---
name: BOQ Item Display Naming
description: Operational BOQ labels require trusted mapping provenance; otherwise preserve the lightly cleaned imported description.
---

Rule: The shared BOQ naming helper is the single source of truth. Priority is: distinct manual `displayName` override → canonical SNL label only for manually confirmed or deterministic/exact mappings → lightly cleaned imported description. Fuzzy automatic suggestions and legacy generated short names are never trusted as canonical labels.

**Why:** Fuzzy mappings and classifier-generated names made operational screens look confidently canonical even when the mapping was only a suggestion; aggressive fallback shortening also damaged road-work abbreviations.

**How to apply:**
- Never re-implement short-name logic locally; import from shared.
- Operational screens and exports (DPR, programme, demand, reports, pickers, reviews) must all use the shared helper.
- BOQ management screens (BoqProjectDetail, BoqItemReview, import wizard) keep the full description.
- When passing reduced item objects, preserve `displayName`, `canonicalDisplayName`, and the imported description; dropping provenance-derived canonical data silently changes labels.
- Fallback cleanup may collapse whitespace and capitalize the first meaningful character, but must preserve abbreviations such as RCC, PCC, NP4, DBM, BC, WMM, GSB, and M15.
- Generic auto-classification must not manufacture `displayName`; confirming a reviewed SNL mapping must mark its provenance as manual.
- Historic DPR `activity` text is untouched; programme/bar linkage matches on IDs, never on activity text.
- Regression tests: `tests/boqItemDisplayName.test.ts` (helper rules + source scans).
