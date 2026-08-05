---
name: Shoulder Dependency Sequencing + Gantt Month Lines
description: Shoulder BOQ items staged by actual construction layer; planner override column; darkened Gantt month boundary lines.
---

## Shoulder sub-classification
- `shared/workTypeRecipes.ts`: `isShoulderDesc()`, `classifyShoulderLayer()` (ShoulderClass = earth|gsb|wmm|dbm|bc|paved|unclassified), `SHOULDER_DEPENDENCY_NOTES`.
- **Regex precedence matters**: named layers (bc → dbm → wmm → gsb) BEFORE earth, earth BEFORE the generic paved/`shoulder…complete` catch. **Why:** BOQ descriptions end in "…complete as per drawings" — "earthen shoulders … complete" must be earth, not paved; "DBM in paved shoulder" must be dbm.
- Unclassifiable shoulders are NEVER silently defaulted to earthwork — they go to `unclassifiedItems` with `SHOULDER_REVIEW_REASON` and get `needsReview=true`.

## Staging
- `shared/programmeSequencer.ts`: `SHOULDER_STAGE` = earth 3, gsb 4, wmm 5, dbm 7.5, bc 8.5, paved 8.5. Fractional stages are safe — the pav loop groups by distinct stage value (numeric sort), so 7.5 starts after stage-7 + lag.
- Shoulder branch sits at the TOP of `classifyItem` (skips `effectivePWT === "structure"`); precedence: persisted `shoulderLayerClass` → description classifier → review.

## Planner override (remembered on regen)
- `boq_items.shoulder_layer_class` column; idempotent startup DDL lives in `ensureBoqDprConversionFactor()`; must also be in `storage.getBoqItems` explicit select (BoqItemWithCategory breaks tsc otherwise).
- Audited `PATCH /api/boq/items/:id/shoulder-class`; clears `needsReview` only when the item is actually a shoulder description. UI: "Shoulder Layer" dropdown in BoqItemReview.

## Gotchas learned
- **Python heredoc edit scripts mangle `\b` in regex literals into backspace chars (0x08)** — use raw strings (r'''…''') whenever writing regexes via python replacement scripts.
- `tests/programmeBarLinkage030A.test.ts` out-of-range-chainage test is date-boundary flaky (fails around certain calendar days, reproduces on clean baseline).
- Gantt month lines: header cells and body absolute divs both border-box at colW multiples — thickening both to `border-r-2` keeps pixel alignment at every zoom.
