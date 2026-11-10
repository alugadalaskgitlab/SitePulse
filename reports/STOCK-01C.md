# STOCK-01C — Part A findings and Part B implementation

## Scope

This is the requested read-only investigation for ALLADURG, BOQ project 2, from 15 August through 10 November 2026. Queries were run only against `sitelog_dev`, with the database name checked and each query inside a read-only transaction. Production and its replica were not queried.

Part A was read-only: no application code, schema, or records were changed, and no tests were run.

## Summary

The WMM master conversion is correct. The displayed 1,670.3 MT is 757.5 cum × 2.205 MT per compacted cum. The 909.38 cum shown by Plan vs Actual comes from a different set of DPR lines: that calculation includes two draft lines and excludes an incidental line, while Material Buy/Use includes the incidental line and excludes drafts.

The SOIL master conversion is also correct. The displayed 3,051 cum loose is 2,542.5 cum × 1.2. That 2,542.5 includes 1,627.5 cum from incidental shoulder-correction lines. Plan vs Actual excludes those lines, leaving 915 cum and 1,098 cum loose.

For negative plant balances, conversion rejects negative quantities as invalid and the API converts the balance to null. The screen renders null as an em dash.

## WMM

### BOQ item, mapping, and recipes

BOQ project 2 has item 5, “Providing WET MIX MACADAM” (BOQ item id 17), unit cum, current quantity 1,631.25. Its layer configuration is granular, direct supply from quarry, with no DPR conversion factor (the calculation therefore uses 1).

Its saved MoRTH mapping is automatic to 4.14, “Construction of median and Island above road level…”, with the note “Rule-matched tag: WMM”. That is not the BOQ work: the description specifies Wet Mix Macadam, Clause 406; the correct MoRTH clause is 4.12. The saved recipe rows below came from the incorrect 4.14 mapping:

| Saved recipe row | Material | Unit | Quantity per BOQ unit | Note |
|---|---|---:|---:|---|
| 101 | Aggregate 45–22.4mm @ 30% | cum | 0.42307556 | SNL 4.14 |
| 102 | Aggregate 22.4–2.36mm @ 40% | cum | 0.56410223 | SNL 4.14 |
| 103 | Aggregate 2.36mm–75μm @ 30% | cum | 0.42307556 | SNL 4.14 |
| 104 | Water | KL | 0.264 | SNL 4.14 |

Those saved SNL rows do not produce the current Used figure. For a direct-supply granular layer, the runtime BOM derives one WMM Material row per BOQ cum and resolves it to the WMM master. The material-use calculation then applies the WMM master’s compacted density.

The WMM master (id 10) has rolled density 2.25, field compaction 98%, loose factor 1.15, and bulk density 1.7. Its compacted value is:

`2.25 × 98% = 2.205 MT per cum`

There is also a legacy cum-to-MT conversion row with factor 2.2 and type `loose_to_compacted`. It is not used here: the complete master profile takes precedence, and that legacy conversion type is excluded from fallback conversions.

### DPR lines and calculation

| Date | DPR | Entry | Quantity | State | Incidental | Material Buy/Use | Plan vs Actual |
|---|---:|---:|---:|---|---|---|---|
| 25 Sep | 399 | 645 | 196.875 cum | Submitted | No | Included | Included |
| 26 Sep | 403 | 653 | 183.75 cum | Submitted | No | Included | Included |
| 27 Sep | 401 | 650 | 151.875 cum | Draft | No | Excluded | Included |
| 28 Sep | 402 | 652 | 180 cum | Submitted | No | Included | Included |
| 29 Sep | 405 | 654 | 67.5 cum | Draft | No | Excluded | Included |
| 30 Sep | 423 | 661 | 67.5 cum | Submitted | Yes — WMM finishing | Included | Excluded |
| 2 Oct | 409 | 658 | 67.5 cum | Submitted | No | Included | Included |
| 3 Oct | 410 | 659 | 61.875 cum | Submitted | No | Included | Included |

Material Buy/Use selects submitted, non-deleted, non-cancelled, non-superseded DPRs, but does not exclude incidental entries. Its input is therefore 757.5 cum: 690 cum of non-incidental submitted work plus 67.5 cum incidental work.

Plan vs Actual excludes incidental entries but does not filter by DPR status. Its input is 909.375 cum: 690 cum of non-incidental submitted work plus 219.375 cum in the two draft DPRs. This is displayed as 909.38 cum.

The current Used result is:

`757.5 × 2.205 = 1,670.2875 MT`, displayed as **1,670.3 MT**

Using the Plan vs Actual quantity instead gives:

`909.375 × 2.205 = 2,005.171875 MT`, approximately **2,005.2 MT**

The difference is a mismatch in which DPR lines the two screens count, not a wrong WMM density conversion.

## SOIL

### BOQ items, mappings, and recipes

| BOQ item | BOQ item id | Unit and current quantity | Layer configuration | Saved MoRTH mapping |
|---|---:|---|---|---|
| 3 — Forming Embankment with material | 15 | cum · 500 | Earthwork | 3.16 |
| 4 — Construction of earthen shoulders | 16 | cum · 1,305 | Earthwork | 4.20 |

Neither item has a DPR conversion factor, so the calculation uses 1. The saved `boq_item_materials` rows are one SOIL requirement per BOQ cum: row 210 for embankment and row 211 for shoulders, both `Soil / Earth`, cum, quantity 1, wastage 0%.

The mapped SNL source rows are:

| BOQ item | SNL resource rows | Why they do not set the current Used amount |
|---|---|---|
| Embankment, 3.16 | Cost of water, 0.24 KL per cum; compensation for earth, 1 cum per cum | No embankment DPR line exists in the date range. Runtime earthwork derives one Soil / Earth cum row per BOQ cum. |
| Earthen shoulders, 4.20 | Borrow Material / Earth, 1 cum per cum; water, 0.06 KL per cum | Runtime earthwork derives one Soil / Earth cum row per BOQ cum. The Used quantity is converted using the SOIL master. |

The SOIL master (id 18) has rolled density 1.8, field compaction 95%, loose factor 1.2, and bulk density 1.6. For these earthwork rows, the relevant conversion is compacted cum × loose factor 1.2.

### DPR lines and calculation

| Date | DPR | Entry | Quantity | State | Incidental | Material Buy/Use | Plan vs Actual |
|---|---:|---:|---:|---|---|---|---|
| 16 Sep | 375 | 613 | 300 cum | Submitted | No | Included | Included |
| 17 Sep | 378 | 618 | 105 cum | Submitted, superseded | No | Excluded | Excluded |
| 17 Sep | 379 | 619 | 105 cum | Submitted, superseded | No | Excluded | Excluded |
| 17 Sep | 392 | 636 | 105 cum | Submitted | No | Included | Included |
| 18 Sep | 380 | 621 | 390 cum | Submitted, superseded | No | Excluded | Excluded |
| 18 Sep | 391 | 635 | 390 cum | Submitted | No | Included | Included |
| 19 Sep | 381 | 623 | 120 cum | Submitted | No | Included | Included |
| 20 Sep | 388 | 631 | 480 cum | Submitted | Yes — shoulder correction to line and level | Included | Excluded |
| 20 Sep | 388 | 632 | 480 cum | Submitted | Yes — shoulder correction to line and level | Included | Excluded |
| 21 Sep | 383 | 625 | 52.5 cum | Submitted, superseded | No | Excluded | Excluded |
| 21 Sep | 389 | 633 | 52.5 cum | Submitted | Yes | Included | Excluded |
| 22 Sep | 394 | 637 | 105 cum | Submitted | Yes — shoulder correction to line and level | Included | Excluded |
| 22 Sep | 394 | 638 | 210 cum | Submitted | Yes — shoulder correction to line and level | Included | Excluded |
| 23 Sep | 395 | 639 | 300 cum | Submitted | Yes — shoulder correction to line and level | Included | Excluded |

There are no embankment DPR lines in the range. The four non-incidental, current shoulder lines total 915 cum. The Material Buy/Use route also counts six incidental shoulder-correction entries totalling 1,627.5 cum. It excludes superseded rows but does not filter incidentals:

`(915 + 1,627.5) × 1.2 = 3,051 cum loose`

Plan vs Actual excludes the incidental rows:

`915 × 1.2 = 1,098 cum loose`

The discrepancy is caused by the material-use DPR filter counting incidental rows that the progress calculation explicitly excludes.

## Why negative plant stock displays as an em dash

`materialPlanQuantity()` returns null for any negative quantity before attempting unit conversion (`shared/bomPlanActual.ts`). When the plant-stock loop receives that null conversion, it marks the stock row incomplete (`server/routes.ts`), which makes `atPlantNow` null; the remaining-to-buy calculation then also receives a null balance. The table’s quantity formatter renders null as an em dash (`client/src/components/MaterialsBuyAndWorkDone.tsx`). The negative balance is therefore suppressed by the conversion guard rather than displayed as a negative number.

## Part B — Consistent DPR selection, incidental use, and negative plant stock

### Changes

- Added a shared eligibility contract: a DPR counts only when it is `submitted` and `isDeleted`, `isCancelled`, and `isSuperseded` are all false.
- Applied the same eligibility checks to Plan vs Actual, Material Buy/Use, and site stock consumption. Plan vs Actual continues to exclude incidental progress; Material Buy/Use and site stock include incidental quantities in material consumption.
- Material-use rows now show an “of which incidental” subtotal. It is also present in the site stock table and Material Buy/Use exports.
- Direct-supply granular site stock now uses the layer’s single canonical material line and its own master values, rather than stale saved SNL fractions. Earthwork retains its saved recipe behavior.
- Plant balances may be negative after unit conversion. The display keeps the negative value and shows “Used more than received — check receipts or mix template”. Negative stock contributes zero available stock to Still to buy.
- No schema or database records were changed. No data script was run. No production or production-replica data was queried.

### ALLADURG before and after

For WMM, the submitted, non-incidental DPR quantity is 690 cum; there are 219.375 cum in drafts and 67.5 cum incidental. For SOIL, the non-incidental submitted shoulder quantity is 915 cum; incidental shoulder entries total 1,627.5 cum, while the listed superseded entries total 652.5 cum.

| Screen / material | Before | After |
|---|---:|---:|
| Plan vs Actual — WMM work done | 909.38 cum (included 219.375 cum in drafts) | **690.00 cum** |
| Plan vs Actual — SOIL work done | 915 cum | **915 cum** |
| Material Buy/Use — WMM Used | 1,670.3 MT | **1,670.3 MT**, including **148.84 MT incidental** |
| Material Buy/Use — SOIL Used | 3,051 cum loose | **3,051 cum loose**, including **1,953 cum incidental** |
| Site stock — WMM | No comparable WMM total: the prior calculation used saved norm fractions and included draft rows | **1,670.288 MT**, including **148.838 MT incidental** |
| Site stock — SOIL consumed | 3,834 cum loose (included 652.5 cum of superseded DPR entries) | **3,051 cum loose**, including **1,953 cum incidental** |

The Material Buy/Use totals stay the same because that endpoint already selected submitted, non-deleted, non-cancelled, non-superseded DPRs and counted incidental entries. Site stock and Plan vs Actual were the screens whose DPR selection or material-source handling differed.

The WMM after value is `757.5 cum × 2.205 MT/cum = 1,670.2875 MT`. Its incidental subtotal is `67.5 cum × 2.205 = 148.8375 MT`. SOIL is `(915 + 1,627.5) cum × 1.2 = 3,051 cum loose`; its incidental subtotal is `1,627.5 × 1.2 = 1,953 cum loose`.

### Verification

- Focused tests: **5 files passed, 57 tests passed** (`stock01PartB`, Material Buy/Use UI, site stock density, site stock display, and DPR batch tests).
- Production build: **passed**.
- TypeScript check: still reports **457 project-wide diagnostics** and is not green; none are in the code sections changed for this batch.
- The signed plant-stock display was covered by a UI test with a negative balance and the exact warning; the still-to-buy test confirms negative stock is counted as zero.
