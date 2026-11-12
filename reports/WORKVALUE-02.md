# WORKVALUE-02 — Part A (read-only findings)

**Status:** Part A only. No implementation or data changes have been made.

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

**Part A complete. I stopped before implementation.**
