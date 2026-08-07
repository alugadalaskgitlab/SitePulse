---
name: BOQ Item Display Naming
description: Operational screens show short BOQ item names via shared helper; full descriptions only on BOQ-management screens.
---

Rule: `shared/boqItemName.ts` is the single source of truth for BOQ item labels. `boqItemDisplayName(item)` priority: saved `displayName` override → `shortItemName(itemName || description)` → raw fallback. `client/src/lib/itemName.ts` just re-exports it; server auto-classify uses the same shared `shortItemName`.

**Why:** Four divergent local short-name copies (SiteEntry, GuidedDpr, BillItemPicker, server routes) caused inconsistent labels, and DPR activity used to store the full description uppercase — Aug 2026 consolidation removed all local copies.

**How to apply:**
- Never re-implement short-name logic locally; import from shared.
- Operational screens (DPR forms/details, pickers, programme, demand, reviews) = short name primary, full description only as tooltip/secondary.
- BOQ management screens (BoqProjectDetail, BoqItemReview, import wizard) keep the full description.
- When passing reduced item objects (maps/rows) to `boqItemDisplayName`, include `displayName` and `itemName` — dropping them silently ignores saved overrides (this bit DprDetails once).
- Historic DPR `activity` text is untouched; programme/bar linkage matches on IDs, never on activity text.
- Regression tests: `tests/boqItemDisplayName.test.ts` (helper rules + source scans).
