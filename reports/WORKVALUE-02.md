# WORKVALUE-02 — Part A (read-only findings)

**Status:** Part A findings followed by Part B implementation and verification.

## Read-only boundary

All database checks used `DEV_DATABASE_URL` and confirmed `current_database() = sitelog_dev`. Each query ran in a read-only transaction and was rolled back. Production and its replica were not queried. No code, schema, records, tests, trips, receipts, stock ledger entries, bills, BOQ values, scope records, or programme bars were changed.

The database was checked on 12 November 2026. Some figures in the instruction's background do not match the current `sitelog_dev` records. I report both the supplied snapshot and the current database where that matters; the supplied snapshot cannot be reconstructed exactly from today's development records.

## 1. SOIL and WMM consumption on ALLADURG

The current project is BOQ project 2, **UPGRADATION FROM ALLADURG PWD ROAD TO PAMPAD**. Site Material Stock builds consumption from eligible submitted DPR progress and saved recipe rows. It excludes draft, deleted, cancelled, superseded, no-site-work, and `reworkNoNewMaterial` entries. It does include incidental progress in the total consumed figure, while separately recording incidental use.

### SOIL / Earth

The Soil master uses `cum loose` as its stock unit and has a loose factor of 1.2. The current `sitelog_dev` material recipes and eligible progress are:

| BOQ item | Saved recipe | Eligible submitted DPR lines in current data | Current quantity | Site-stock effect |
|---|---|---|---:|---:|
| Clearing and grubbing road (item 13) | Recipe 208: Soil / Earth, 1 CUM per BOQ unit, `is_auto=true` | 338: 2,400; 349: 2,400; 452: 1,125; 453: 825; 454: 1,125 SQM | 7,875 SQM | Counted as 7,875 compacted CUM, then converted to **9,450 cum loose** |
| Scarifying the granular surface (item 14) | Recipe 209: Soil / Earth, 1 CUM per BOQ unit, `is_auto=true` | 345: 1,406.25; 350: 1,593.75 SQM | 3,000 SQM | Counted as 3,000 compacted CUM, then converted to **3,600 cum loose** |
| Construction of earthen shoulders (item 16) | Recipe 211: Soil / Earth, 1 CUM per BOQ unit, `is_auto=true` | Billable: DPR 375: 300; DPR 381: 120. Incidental: DPR 388: 480 + 480; DPR 394: 105 + 210; DPR 395: 300 CUM | 420 billable + 1,575 incidental = 1,995 CUM | **504 cum loose billable** and **1,890 cum loose incidental** |

Thus, using the current records and current Site Material Stock rules, the saved recipes produce **15,444 cum loose consumed**: 9,450 + 3,600 + 2,394. The clearing and scarifying contributions are not actual soil use; their layer configuration is empty, but the recipe material name contains “Soil,” so the stock code treats the BOQ quantities as compacted soil and applies the 1.2 factor.

The supplied background value of **11,520.96 cum loose** is not reproducible from the current `sitelog_dev` DPRs. Those records now total 7,875 SQM of clearing, 3,000 SQM of active scarifying, and 1,995 CUM of shoulders. The older background also cites 697.5 CUM of billable shoulder work; the current records have 420 CUM billable shoulder work. The currently active Soil trips are 114 receipts totaling 68,300 CFT, approximately 1,934.04 cum. Under the current recipe calculation, lying stock bottoms at zero and the over-consumed difference would be about 13,510 cum loose.

The superseded scarifying DPR 368 (3,000 SQM) and superseded shoulder DPRs 378, 380, and 383 are excluded. DPR 15 (embankment) has no progress lines in this site's current data.

### WMM

The WMM master is ID 10; it has aliases including “WMM Material,” and its compacted weight is 2.25 × 98% = **2.205 MT per compacted CUM**. Current submitted, eligible WMM work linked to item 17 is:

| DPR | Status / type | Quantity |
|---|---|---:|
| 399 | Submitted, billable | 196.875 CUM |
| 402 | Submitted, billable | 180 CUM |
| 409 | Submitted, billable | 67.5 CUM |
| 410 | Submitted, billable | 61.875 CUM |
| 423 | Submitted, incidental | 67.5 CUM |
| 401, 405 | Draft; excluded | 151.875 + 67.5 CUM |

Current linked submitted work is **506.25 CUM billable** and **67.5 CUM incidental**. At 2.205 MT/CUM, the billable use calculation is 1,116.28 MT, with 148.84 MT of incidental use separately identified. This differs from the instruction's earlier 871.875 CUM / 1,922 MT snapshot.

Site Material Stock takes a different path for direct-supply granular layers: it derives a material name from `layer_config`. Item 17 has `layerType=granular`, `granularSource=quarry`, but no `mixType`. That path derives the generic name “Granular Material,” which does not match the WMM master or its aliases. It then cannot convert the CUM quantity to MT without a material master and skips the WMM consumption. The current 66 WMM trips total **1,895 MT**, so the stock calculation leaves all 1,895 MT lying at site rather than showing WMM use.

DPR 413 is submitted and active but has neither a BOQ project nor a BOQ item link, so the project-scoped material and work-value queries do not include its 14.0625 CUM. Its site/date/quantity are detailed in section 6.

## 2. Material buy/use figures

The Material buy/use route computes need from the BOM for the item's working-reach share, converts it to the material's target unit, then separates use by supply source:

- Plant-mix materials: template component share of plant dispatches.
- Soil, direct granular, and concrete: submitted DPR quantity × recipe / configured material use. Incidental use is displayed separately from billable use.
- Other materials: only an explicitly project/item-linked store issue.

For the current ALLADURG reach layout, the confirmed working length is 2.6 km (Reach 1: 1.6 km; Reach 3: 1.0 km), and the confirmed no-scope length is 0.3 km. The common denominator is 2.9 km. WMM item 17's 1,631.25 CUM therefore has a working-reach need of 1,462.5 CUM, or **3,224.81 MT** at 2.205 MT/CUM.

The current code first computes balance work needs as need minus used. For site-supplied materials, it subtracts the Site Material Stock “lying at site” figure from that balance; for plant-mix materials, it subtracts non-negative “At plant now” stock. If the combined balance is negative, “Still to buy” is zero and the magnitude is “Excess.”

That explains the supplied WMM snapshot exactly: 3,226 MT need − 1,922 MT used = 1,304 MT balance work need; because the Site Material Stock row incorrectly leaves all 1,895 MT lying at site, the route calculates 1,304 − 1,895 = −591, so it reports **Still to buy 0 / Excess 591 MT**. Correcting the direct-granular stock identity is necessary for the same figures to reconcile across screens. The requested Part B rule would calculate “Still to buy” directly as need minus received (not below zero), independently of work balance.

## 3. Clearing / scarifying Soil recipe lines

Recipes 208 and 209 are saved on the BOQ items as auto-marked rows, created on 9 November 2026. The recipe table does not record who or which action created them. Their current MoRTH links are item 13 → SNL item 1 (code 2.01) and item 14 → SNL item 17 (code 2.05), both marked as manual links. Neither mapped SNL item has any material resource rows in `snl_item_materials`. Therefore the saved Soil rows cannot be attributed to those MoRTH material rows; `is_auto=true` is only the saved row's marker, not proof of its origin.

The rows do **not** pass the key-material allowlist used to build the BOM v1 demand for Material buy/use. They **do** feed Site Material Stock, which multiplies saved recipes by submitted DPRs, and Material Balance, which reads the saved item material rows directly for requirements and DPR use. This makes them a source of false Soil demand/use in those latter views.

I do not recommend deleting saved rows silently or with a data script. The safer Part B approach is to preserve the existing rows, prevent the recipe generator from adding them for clearing/scarifying, and have the relevant stock/material-balance calculations exclude these non-soil work items. That fixes the calculations without erasing the stored recipe history.

## 4. How fixed, lump-sum, structure, and counted items are shared today

There is no saved fixed-quantity override in the current `boq_items` schema. Work value and material need both call `allocateBoqQuantityToWorkingReaches`; the current `isLinear` test treats only `layerType=structure` or `non_linear` as non-linear. Embankment (`earthwork`), culvert items (`concrete`), and road furniture / safety items (`ROAD_FURNITURE`) therefore follow the same length-share path as the road items.

For ALLADURG the denominator is 2.9 km. Today the allocation is:

- Reach 1: BOQ quantity × 1.6 / 2.9.
- Reach 3: BOQ quantity × 1.0 / 2.9.
- No-scope: BOQ quantity × 0.3 / 2.9.

For example, the 500 CUM embankment item is allocated about 275.86 CUM to Reach 1, 172.41 CUM to Reach 3, and 51.72 CUM as no-scope. Counted road-furniture items and the concrete culvert items are also split by those length ratios rather than staying whole or being assigned to a selected reach.

## 5. Work value “over” and programme “under by”

Work value selects submitted, active DPR lines linked to the project and an item, ignores no-site-work and chainage-review-required lines, and assigns quantities to each reach by chainage overlap. Each quantity is multiplied by the BOQ item's saved `dpr_conversion_factor`.

The existing “over” is **per reach**, not against the full item BOQ: `max(0, reach done − reach share)`. The bill estimate caps each reach's done quantity at that reach's share, while the excess is separately calculated per reach. It does not currently aggregate all reach quantities to decide whether the whole item is above its BOQ quantity.

There is an important current data issue for the requested clearing example: item 13's BOQ unit is `Sqm`, but its saved `dpr_conversion_factor` is `0.0001`. The same-unit DPR quantity is multiplied by that factor before the comparison, so 4,800 SQM would be treated as 0.48 for Work value. The requested “Over reach share 960 sqm” calculation assumes factor 1; this mismatch needs to be resolved in Part B without silently changing the BOQ quantity or rate.

The Programme page's current “under by” check sums the bars for an item and compares that total with the full BOQ `currentQty`; it does not subtract the no-scope share. In the current development data, WMM bars total 1,631.25 CUM, equal to its full BOQ quantity. The existing bars are not being changed, but two extend past the confirmed corridor end at chainage 2.9:

- Embankment bar 932: Reach 3, 1.9–3.2.
- WMM bar 934: Reach 3, 1.9–3.2.

## 6. DPR 413 project and item link

The project link is stored in `dprs.boq_project_id`; the progress row's item link is `progress_entries.boq_item_id`. In current `sitelog_dev`, DPR 413 is a submitted, active report dated 4 October 2026 at ALLADURG PWD ROAD TO PAMPAD. Its progress entry 660 is 14.0625 CUM at chainage 0+030–0+055, with `boq_item_id` null, and the DPR header's `boq_project_id` is null.

The project and item columns already exist; no schema change is needed for the link itself. However, the existing correction plan explicitly blocks changes to the saved DPR's date, site, or BOQ project as operational identity. To allow the requested action, Part B needs an Owner-only correction path that permits a null project to be set to a project at the same site, validates that the selected WMM item belongs to that project, saves the header and progress link atomically, and records “Corrected by Owner.” The existing general correction route cannot currently do that.

## 7. Schema needed

No schema changes were made. The existing database has no dedicated fields for the requested fixed-quantity behavior or “Claimed above estimate” note. To implement those as editable, persistent item settings without overloading engineering `layer_config`, I recommend these additive `boq_items` columns:

1. `fixed_quantity boolean NULL` — `NULL` means use the default derived from the item's type; `true` / `false` records the Owner's override.
2. `fixed_quantity_reach_id integer NULL REFERENCES project_scope_segments(id)` — set when a fixed item is assigned to one reach; `NULL` means “Whole project.”
3. `claimed_above_estimate boolean NOT NULL DEFAULT false`.
4. `claimed_above_estimate_note text NULL`.

These would be additive only and would need to be applied to both development databases after approval. The DPR project and progress-item links, BOQ item name, and spray-coat rate already have existing columns/settings; they do not require new columns.

**Part A complete; Part B follows below.**

## Part B — implementation and verification

### Schema and data boundary

Added only the four approved `boq_items` columns:

| Column | Type | Null/default | Purpose |
|---|---|---|---|
| `fixed_quantity` | boolean | nullable; `NULL` uses the item-type default | Owner override for length sharing |
| `fixed_quantity_reach_id` | integer | nullable; references `project_scope_segments.id`, `ON DELETE SET NULL` | Optional fixed-item reach |
| `claimed_above_estimate` | boolean | not null, default `false` | Separate above-estimate claim marker |
| `claimed_above_estimate_note` | text | nullable | Owner's explanation |

The same additive columns and foreign key are present in `sitelog_dev` and the Publish-facing development database (`heliumdb`). Both were checked read-only by database name and `information_schema`. Production and its replica were not queried. No application records were edited; no trips, DPRs, progress rows, receipts, stock ledger rows, bills, BOQ quantities/rates, scope records, or programme bars were changed. Recipe rows were preserved.

### Material use, stock, and buy/use

The same submitted-DPR eligibility rule is used for material use: submitted; not deleted, cancelled, or superseded; and not marked No Site Work. Null legacy status flags count as false. Draft DPRs are excluded. Rework is excluded from material use; incidental quantities are included in use and broken out separately. Clearing and scarifying keep their saved Soil recipe rows, but the recipe generator no longer adds/replaces those rows, and stock/material-balance requirements and use exclude those false Soil lines.

Direct-supply granular identification now uses the item's explicit material-master identity when present, then its own item name/description (for example, **Providing WET MIX MACADAM** resolves to the WMM master), rather than the generic “Granular Material” label. No WMM project mapping row or direct material foreign key was present in the current development records; no mapping or recipe record was created. For the existing item, the item's own WMM wording is the source of identity.

On the current 13 November `sitelog_dev` data, the previous site-stock code would count clearing, scarifying, and shoulder recipe quantities as Soil:

| Material | Before, same current records | After |
|---|---:|---:|
| Soil used | 19,701.00 cum loose, including 16,650.00 false use from clearing/scarifying | 3,051.00 cum loose: 1,098.00 billable + 1,953.00 incidental |
| Soil received | 1,934.04 cum loose | 1,934.04 cum loose |
| Soil lying / used more than received | 0 lying; 17,766.96 used more than received | 0 lying; **1,116.96 used more than received** |
| WMM used | 0 MT matched to the WMM master; 1,895 MT left lying | **1,670.29 MT**: 1,521.45 billable + 148.84 incidental |
| WMM received / lying | 1,895 MT / 1,895 MT | 1,895 MT / **224.71 MT** |

The 13 November figures differ from Part A's 12 November snapshot because the development-copy DPR records changed between the read-only Part A query and this implementation check. Part B did not edit those records.

The current Material buy/use calculations use the same 2.9 km corridor denominator and 2.6 km of confirmed working reaches:

| Material | Working need | Used | Received | Balance work need | Still to buy | Excess |
|---|---:|---:|---:|---:|---:|---:|
| Soil, cum loose | 2,004.00 | 3,051.00 | 1,934.04 | 0.00 | **69.96** | 0.00 |
| WMM, MT | 3,224.81 | 1,670.29 | 1,895.00 | 1,554.53 | **1,329.81** | 0.00 |

Soil need is 1,170 CUM of earthen shoulders plus the full 500 CUM embankment quantity, converted at 1.2 loose factor. WMM need is 1,462.5 CUM × 2.205 MT/CUM. “Still to buy” is need minus received, floored at zero; “Balance work need” is need minus billable and incidental use, floored at zero; site excess is received minus need, only when positive. Site Material Stock and Material Balance show negative stock as “Used more than received: …” rather than hiding it or showing negative lying stock.

Store issues count only when linked to the project and BOQ item. The project/item material report and the site-stock calculation apply the same rework exclusion and incidental-use split.

### Fixed quantities, value, and programme coverage

`NULL` fixed-quantity values preserve type-based defaults. Lump-sum items, counted units, structures, culverts, road furniture/safety, and the ALLADURG embankment item remain whole by default; an Owner can override this in the BOQ item editor and optionally assign a reach. The 500 CUM embankment is assigned to “Whole project” by default. Linear items use working-reach length shares over the full 2.9 km corridor, including the 0.3 km no-scope segment in the denominator but excluding that segment from working need. Item-specific reaches only receive their applicable share.

“Over reach share” is informational. “Over BOQ” is computed against total item progress and the full BOQ quantity; the bill estimate is capped at the full quantity, with excess value shown separately as “Above BOQ — needs variation.” The Owner's “Claimed above estimate” flag and note are separate from that calculation.

Current Work Value figures:

| Reach | Earned/bill estimate | Value of balance work |
|---|---:|---:|
| Reach 1 | ₹32,01,275.40 | ₹81,29,134.20 |
| Reach 3 | ₹8,726.40 | ₹70,23,132.00 |
| Whole project | ₹0.00 | ₹5,93,984.48 |

Specific checks: Reach 1 shoulders are 915 CUM against a 720 CUM share, so they show 195 CUM “Over reach share,” but not “Over BOQ” (total shoulder progress is below 1,305 CUM). Clearing has 4,800 SQM in Reach 1 against a 3,840 SQM share (960 SQM over that reach share); active in-scope clearing totals 7,425 SQM against the full 6,960 SQM BOQ, so 465 SQM is “Over BOQ” and ₹1,878.60 is above the estimate. WMM's billable Work Value is 690 CUM; incidental 67.5 CUM remains visible but earns no work value.

Programme “under by” compares bars with the item's working-reach quantity, while fixed items compare with their full quantity. Programme bars were not modified. The existing road bars 930–939 and structure bars 953–957 and 959 extend to chainage 3+200, beyond the confirmed corridor end at 2+900; in particular, embankment bar 932 and WMM bar 934 remain unchanged for the Owner to review.

### Owner correction and remaining screen-only values

The Owner correction flow can assign an empty submitted DPR project to a same-site BOQ project and link its progress item in the same reviewed correction. The correction is recorded as “Corrected by Owner.” The development integration test covers the same-site project and item together, and separately verifies Owner correction of incidental/rework flags and the BOQ link without changing stock ledger rows. DPR 413 itself remains unlinked and was not edited; current Work Value totals exclude its 14.0625 CUM until an Owner applies the screen correction.

No Owner-screen data edits were made in this code-only batch. In particular, BOQ item code 10's saved `item_name` remains “Providing and laying bituminous,” not “30 mm bituminous concrete”; tack coat 1's saved layer setting remains 0.25 kg/sqm while the BOQ description states 0.275 kg/sqm. These are still available for the Owner to change through the BOQ/material editing screens; the BOQ description itself was not changed.

### Verification

- Focused tests: **8 files passed, 76 tests passed** (`soilValueWorkingReach`, `workValueMaterialRules`, `dprCorrections.integration`, `workValueTable`, `materialsBuyAndWorkDone`, `workProgrammeRevision06W`, `boqProjectEdit`, and `materialBalanceReport`).
- `npm run build`: **passed**.
- Development startup after the changes: **ready**, with read-only schema readiness `ready: true`.
- The separate project-wide TypeScript check is not clean: it reports 463 diagnostics across the repository. It reports no diagnostics in the new working-reach/material-eligibility helpers or the Part B route block; unrelated diagnostics remain elsewhere.
- The configured full-suite workflow's earlier run (before the final Part B edits) ended with 449 files passed, 2 skipped, and 7 failed; 5,703 tests passed, 3 skipped, and 13 failed. The visible failures included `siteMaterialTripsMaterialSourceUi.test.ts`, three `unscheduledReportCredit.test.ts` cases, and `vendorBillVb15Server.test.ts`. The full suite was not rerun after the final focused verification.

**No publish was performed.**

## Pre-publish check

### Full-suite comparison

The first full run on the Part B code had **13 failing tests across 7 files**. Five were in `siteMaterialTripsMaterialSourceUi.test.ts`; its source-text checks still searched the old single-page implementation after TRIP-ROLE-02 moved the review tools into `SiteMaterialTripReviewTools.tsx`. One assertion also exposed a real gap: a zero or invalid server update count could still be presented as a successful material-source backfill.

I fixed the count handling so only a safe positive integer no larger than the preview count is reported as success. I updated the five page-split assertions to check the separate tool and its current safeguards. The focused UI test then passed **10/10**.

| Failure group | Before this check | After fixes | Attribution / disposition |
|---|---:|---:|---|
| Previously known failures | 7 | 7 | Older failures, listed below |
| DPR 314 correction | 1 | 1 | Older; reproduced on a source snapshot before WORKVALUE-02 |
| Material trip UI checks | 5 | 0 | TRIP-ROLE-02 page split; assertions now target the extracted page, and the zero/invalid-count behavior was fixed |
| WORKVALUE-02 / HOTFIX-01 | 0 | 0 | No failing tests attributed to either batch |
| **Total** | **13** | **8** |  |

The final `npm test` run reported **451 passed, 2 skipped, 6 failing files; 5,713 passed, 3 skipped, 8 failed tests** (459 files, 5,724 tests). The remaining failures are:

| Test file / failing test | Batch attribution | Error observed |
|---|---|---|
| `arrangementProcurementCorrection.test.ts` — “Material mapping required” wording | Older; known failure | Static source assertion does not find the expected literal in the page file |
| `materialReceiptReversal06mD.test.ts` — converted receipt reversal | Older; known failure | `Cannot convert Kg to Liters without a configured material density.` |
| `purchase-indent-pi01.test.ts` — incompatible units rollback | Older; known failure | `Cannot convert CUM to MT without a configured material density.` |
| `unscheduledReportCredit.test.ts` — persisted null-link total | Older; known failure | Expected total 6 and date `2026-08-05`; received total 0 and null date |
| `unscheduledReportCredit.test.ts` — matching SQM units | Older; known failure | Expected 4,800; received 0 |
| `unscheduledReportCredit.test.ts` — unresolved credit | Older; known failure | Expected null total; received 0 |
| `vendorBillVb15Server.test.ts` — linked mirror suppression | Older; known failure | `Cannot read properties of undefined (reading 'isCancelled')` |
| `dpr314Correction.test.ts` — hydrated SiteEdit rows | Older, not WORKVALUE-02 | `DPR314_CORRECTION: Unexpected correction fields`; the same failure reproduced from the pre-WORKVALUE-02 source snapshot `b4021a62` |

The TRIP-ROLE-02 UI test changes were limited to updating the stale source-location assertions for the extracted review-tool page; the count-validation assertion now checks the corrected behavior. No WORKVALUE-02 or HOTFIX-01 test failure remained to fix. Expected error logs from tests that intentionally render broken routes/chunks were not test failures.

### Schema delta

Compared with the last published source snapshot (`216a30f3`), `shared/schema.ts` contains only these schema additions:

- `boq_items.fixed_quantity` — nullable boolean.
- `boq_items.fixed_quantity_reach_id` — nullable integer and one foreign key to `project_scope_segments.id` (`ON DELETE SET NULL`).
- `boq_items.claimed_above_estimate` — non-null boolean, default `false`.
- `boq_items.claimed_above_estimate_note` — nullable text.

There are no table or column drops, renames, or other schema edits in that source delta. This confirms the code-defined migration is additive only. I did not query production or its replica, open a production-backed migration preview, or publish.

### Build and startup

- `npm run build`: **passed**. The build emitted the existing Browserslist-age and large-chunk warnings.
- After the code fix, the development app restarted successfully and reported read-only startup readiness `ready: true`.
- **No publish was performed.**
