# SOIL-VALUE-01 — Part A read-only findings

## Scope and database

This report covers Part A only. All database reads were made against
`sitelog_dev`; `current_database()` was checked before each query. No
production database or replica was queried. No records or code were changed.

## 1. How incidental work affects material use today

BOQ work progress and material use follow different rules:

- **Plan vs Actual** (`getPlanVsActual`) counts submitted, active DPRs, but
  filters out progress rows marked Incidental and rows marked No Site Work.
  Incidental quantities do not receive BOQ credit.
- **Material buy/use** (`/api/boq/projects/:id/material-buy-use`) selects
  submitted DPR rows and aggregates the full recipe-linked quantity, including
  incidental rows. It also calculates an “of which incidental” subtotal. The
  subtotal is part of “Used”, not an additional amount. There is no “rework,
  no new material” flag today, so an incidental correction line consumes
  material just like other work.
- **Site Material Stock** (`/api/site-material-stock`) also derives consumption
  from submitted DPR quantities × the applicable recipe, including incidental
  rows, and labels their share separately. Soil is converted to loose cubic
  metres; direct-supply WMM is converted to tonnes using the WMM master.
- **Material Balance** (`/api/reports/material-balance`) likewise includes
  submitted DPR-linked recipe use without filtering out incidental rows.

On ALLADURG project 2, the development records show:

| BOQ item | Submitted non-incidental | Submitted incidental | Total counted for material use |
|---|---:|---:|---:|
| Earthen shoulders, item 4 | 915 Cum compacted | 1,627.5 Cum compacted | 2,542.5 Cum compacted |
| WMM, item 5 | 690 Cum | 67.5 Cum | 757.5 Cum |

All six shoulder rows in DPRs 388, 389, 394 and 395 are marked Incidental in
this copy. DPR 423’s 67.5 Cum WMM finishing row is also marked Incidental.
These submitted rows are active and not superseded.

The SOIL master is set to rolled density 1.8, field compaction 95%, loose
factor 1.2. Therefore current material use includes
`2,542.5 × 1.2 = 3,051 cum loose`. Excluding the incidental rows would leave
`915 × 1.2 = 1,098 cum loose`.

The WMM master is set to density 2.25 MT/Cum and field compaction 98%, giving
2.205 MT per Cum. Current material use includes
`757.5 × 2.205 = 1,670.29 MT` (about 1,670.3 MT). The 67.5 Cum incidental
row contributes 148.84 MT; without it, 690 Cum contributes 1,521.45 MT.

## 2. Submitted-DPR corrections

For progress rows, these fields require approval under the correction plan:
length, width, thickness, quantity, UOM, BOQ item link, programme-bar link,
material outcome, reusable quantity, arrangement link, length/UOM override
reason, No Site Work, Incidental, executed-by, side, and layer/lift number.
Changing chainage can also derive a new length and quantity, which the review
marks as approval-required when those derived values change.

For changes that otherwise require approval, the Owner’s direct-save exception
only covers geometry-derived length/quantity changes. An explicit thickness,
side, or BOQ-item change does not qualify; it follows the
different-Administrator approval flow. Chainage fields themselves are not in
the approval-required list, so a chainage-only correction that produces only
derived geometry changes can qualify for the Owner exception.

Submitted correction forms must retain the same rows and persisted row
identities. A row-count change is blocked with “Submitted evidence cannot be
added or removed through correction”; therefore the current correction path
cannot split a line or add another line. Splitting needs a dedicated operation
that creates the second progress row and records the change.

The development copy has no `edit_permission_requests` row with ID 9 or
correction request for DPR 403, and no applied correction audit for that DPR.
Thus the reported “DPR 403 correction #9” is not present in this copy for
read-only verification.

## 3. How current material need is calculated

Material buy/use expands every BOQ item included in planning. `calculateBomDemand`
uses the sum of an item’s programme-bar planned quantities, capped at the
item’s `current_qty`; if the item has no bars, it uses the full `current_qty`.
The material-buy/use calculation does not directly clip demand to the confirmed
working-reach records.

For this project, confirmed scope is Reach 1 (0+000–1+600), Reach 2 is
no-scope (1+600–1+900), and Reach 3 is 1+900–2+900. The current bars for both
items still total their entire BOQ quantity:

- Soil item 4: 720 Cum on Reach 1 + 585 Cum on a Reach 3 bar ending at 3+200 =
  1,305 Cum, the full current BOQ quantity. The Reach 3 bar extends 300 m
  beyond the confirmed reach end.
- WMM item 5: 900 Cum + 731.25 Cum = 1,631.25 Cum, the full current BOQ
  quantity; its Reach 3 bar also ends at 3+200.

So the current bars—not the confirmed working-reach total—make material-buy/use
need equal the full BOQ for these items. The Material Balance report explicitly
builds requirements from the full `current_qty`, independent of programme bars.

The project’s `road_length_km` is 3.2, with project chainage 0+000–3+200. It is
shown in BOQ project screens and is returned as BOM metadata. Auto-sequencing
prefers the project’s chainage end minus start (also 3.2 here), falling back to
`road_length_km` when explicit bounds are absent; that length is used to set
default fronts and sequence stretches. Work Programme stretch quantities also
use the road length as their proportional denominator. The material need
calculation itself does not use `road_length_km`.

## 4. Soil stock and “lying at site”

Soil appears on the **Site Material Stock** screen, which reports Ordered,
Delivered, Consumed, and Lying at site. Its “Consumed” is theoretical:
submitted DPR quantity × material recipe, not a physical issue or measurement.
Soil is displayed in loose cubic metres and CFT.

This development copy has 114 active ALLADURG soil trips totalling 68,300 CFT,
or about 1,934.04 cum loose. With all currently counted use, the SOIL row is
about 3,051 cum loose consumed. The existing calculation sets Lying at site to
`max(0, Delivered − Consumed)`, so it shows zero and an over-consumed warning;
it never shows a negative lying balance.

If the 1,627.5 Cum shoulder rework were excluded from new material use, soil
use based on the current 915 Cum non-incidental shoulder records would be
1,098 cum loose, leaving about 836.04 cum loose. This differs from the
background estimate of 1,005 Cum compacted / 1,206 cum loose: the current
submitted, non-incidental DPR lines for item 4 total 915 Cum. No records were
changed to reconcile that difference. Excluding the separate WMM rework row
would reduce WMM material use by about 148.84 MT.

The site-stock delivery query reads site trips for the selected site and date
range; all 114 soil trips in this copy are active. The lying figure is derived
from the resulting delivery total and DPR-based consumption.

## 5. Schema needed for Part B

One additive nullable column is needed for the per-progress-line rework choice:

- `progress_entries.rework_no_new_material boolean NULL`; treat `NULL` as
  “not marked rework” for existing rows.

No other schema change appears necessary for the requested correction, split,
withdrawal, or history behavior: progress rows already have stable row
identity, and the existing `edit_permission_requests` and `audit_logs` can
record requests and correction history. No migration was applied. Any approved
development schema change must be applied only to the two development
databases, not production.

**Part A complete. Stopped here pending the Owner’s “continue”.**
