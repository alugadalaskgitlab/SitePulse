---
name: Equipment opening-reading continuity (06Q)
description: Canonical cross-source resolver for latest prior valid closing reading; tie-breaks, surface wiring rules, guards.
---

- `shared/equipmentContinuity.ts` `pickLatestClosing()` is the ONLY cross-source comparison; `storage.resolveLatestPriorClosing()` is the only DB resolver; endpoint `GET /api/equipment/:id/latest-closing?beforeDate=` (strict-before default, `inclusive=1` = on-or-before, used only by the Plant module because it has no plantUsageId linkage and a 2nd same-day entry continues from the day's earlier closing).
- Per-source same-date tie-breaks (no schema change allowed): equipment_usage → date DESC, created_at DESC NULLS LAST, id DESC; equipment_logs (joined to dprs for the date) → dprs.date DESC, equipment_logs.id DESC (logs have NO timestamp column — serial id is insert order).
- Cross-source same-date: mirrored pair (log.plantUsageId === usage.id, i.e. the DPR closed that plant record) is ONE event; otherwise higher closing wins (meter monotonicity — no shared clock exists across sources); exact tie → plant_usage.
- DPR-side candidates only from live submitted DPRs: isDeleted=false, isSuperseded=false, dprStatus != 'draft'. Null closing skipped; ZERO is a valid closing (never filter `> 0`).
- **Why:** DPR equipment logs are NOT mirrored into equipment_usage (verified: DPR persistence inserts only equipmentLogs); both tables independently hold closings, so a single-table "previous reading" misses history.
- **How to apply:** any new entry surface must go through `client/src/lib/equipmentContinuity.ts` fetchLatestPriorClosing; priority = same-day open Plant Usage linkage first (where plantUsageId is representable), resolver second; never overwrite a manually typed opening (blank-check at write time); stale guard = re-check row's equipmentId (and row index where applicable) when the async response lands.
- SiteEdit: only rows added in the edit session (`isNew`, client-only flag stripped from payload) auto-resolve; stored rows are NEVER recalculated on load; changing equipment on an existing row with a stored opening requires window.confirm. SiteEdit's classic payload has no plantUsageId → open-usage linkage not applicable there.
- Plant page gotcha: `userModifiedOpening` was historically set only by the opening-DIESEL input; the opening METER input must set it too or async prefill overwrites typed readings.
- Diesel previousBalance endpoint/logic is untouched by all of this — meter continuity and diesel carry-forward are separate systems.
