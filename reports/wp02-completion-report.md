# WP-02 Completion Report

## 1. Part 1 — first-time Work Programme editing

### Result

Free schedule editing is restored when:

- the programme baseline has not been explicitly published; and
- the affected bar has no submitted/current DPR progress; and
- the affected bar has no programme outcome event.

The same start date, end date, duration, and automatic/fixed-duration changes
remain protected by Schedule Revision after baseline publication or after
execution evidence exists.

This policy is enforced on the server for direct bar edits, bar creation, bulk
creation, normal and structure auto-sequencing, structure import, split-by-side,
bar deletion, and structure-bar cleanup. Read-only previews remain available.

A minimal **Publish Baseline** action was added to Work Programme. It is
one-time, permission-checked, audited, and unavailable for an empty programme.
This is not a Draft/Baseline/Revision lifecycle implementation.

### Test evidence

- An unpublished, evidence-free bar accepts direct date/duration changes.
- An unpublished bar with DPR progress is rejected with
  `SCHEDULE_REVISION_REQUIRED`.
- An unpublished bar with an outcome event is rejected with the same response.
- A published programme rejects direct schedule edits and schedule-changing
  transform routes.
- Evidence-free structure/location bars expose direct date, duration, and
  automatic/fixed controls; protected rows retain Revise Schedule.
- A second Publish Baseline request is rejected.
- Publishing an empty programme is rejected.

These cases are covered by route and UI regression tests. The final repository
test run passed 134 files and 2,719 tests.

No existing development project was marked as published during verification.
The post-publication behavior was verified with isolated route fixtures.

## 2. Part 2 — deterministic mapping by default

### SNL/SDB sources found

| Source | Active development rows |
|---|---:|
| MORTH_SDB_2019 | 836 |
| SDB_ROAD | 260 |
| SDB_STRUCTURES | 216 |
| SDB_IRRIGATION | 257 |
| SDB_GATES | 22 |
| SDB_MISCELLANEOUS | 403 |
| **Total** | **1,994** |

### Deterministic rules

Identity-first matching now covers:

- WMM, DBM grading, BC grading, prime coat, and tack coat;
- embankment and subgrade;
- PCC/RCC with grade and nominal-mix safeguards;
- Hume pipes with diameter, NP class, and row/vent arrangement;
- ordinary kilometre stones and hectometre stones;
- informatory, direction, cautionary, and mandatory signs;
- thermoplastic marking, reflective studs, rumble strips, and crash barriers.

Primary-work precedence prevents incidental mentions such as WMM substrate,
concrete sign foundations, or RCC pipe material from overriding the actual BOQ
item family.

When equivalent identities exist in multiple libraries, explicit source/code
and canonical-specificity precedence selects the authoritative road identity.
Different pipe sizes/classes, concrete grades, bituminous gradings, and
road-asset subtypes cannot inherit each other's mappings through duplicate
propagation.

The selected SNL item remains authoritative for equipment, labour, and material
recipe rows. No unsupported resource norms were invented.

The fuzzy thresholds were not changed:

- mapped: `>= 0.70`;
- review: `0.50–0.69`;
- deterministic rule confidence: `0.82`.

### ALLADURG-to-PAMPAD production snapshot — read-only dry run

| Result | Current live snapshot | Identity-first dry run |
|---|---:|---:|
| Mapped | 16 | 21 |
| Review/unmapped | 8 | 3 |
| Total | 24 | 24 |

The measured result is **21/24 = 87.5%** safely mapped. IDs 24, 26, and 27
remain for review because they lack a safe deterministic identity or contain a
grade/sector conflict.

Examples:

- WMM resolves to 4.14.
- DBM Grading-II resolves to 5.04B.
- BC Grading-II resolves to 5.8-ii.
- 1000mm NP4, 1V Hume pipe resolves to the WP-01 identity
  `9.2-NP4-1000`.
- Ordinary and H.M. stones resolve to distinct identities.
- Reflective studs, thermoplastic marking, and rumble strips resolve to their
  specific road identities.

The Pampad-style safeguard fixture contains 15 ordinary unambiguous items; all
15 map deterministically. Four deliberately ambiguous controls—duplicate WMM
methods, PCC without a grade, pipe without row arrangement, and a generic
multi-candidate sign—remain in review.

Production was queried read-only. No ALLADURG mapping or recipe was applied.
The live production counts were rechecked after implementation and remain
16 mapped, 6 needs-review, and 2 unmapped.

The detailed item-by-item evidence is in
`reports/wp02-part2-identity-matching-dry-run.md`.

## 3. Part 3 — Bill-first grouping and ordering

### Before

- BOQ Project Detail was already Bill-first and source-row-first.
- BOQ Item/Mapping Review received ordered API rows but displayed one flat
  table.
- Work Programme Gantt and Monthly views grouped primarily by operational work
  category, which could merge items from different Bills.

### After

A shared display-only hierarchy now orders:

1. imported Bill;
2. source/section inside the Bill;
3. category source order;
4. original Excel row;
5. stored source order;
6. natural item code as a final fallback.

It is used by BOQ Item Review, Mapping Review, Work Programme Gantt, and Monthly
Plan. Legacy projects without imported Bill metadata retain their previous
operational-category fallback.

Pampad-style regression fixtures verify that item numbers restarting at 1 in
each Bill do not interleave. No stored item number, description, quantity,
rate, category, or programme record was changed.

## 4. Approved schema change

```sql
ALTER TABLE boq_projects
ADD COLUMN IF NOT EXISTS programme_baseline_published_at timestamp;
```

The additive nullable column was applied to:

- the application development database; and
- the managed Publish-comparison development database.

Production was not altered directly. It remains pending the normal Replit
Publish migration.

## 5. Other observation not changed

Application startup still reports the pre-existing Diesel/LDO ledger
reconciliation shortage (`INSUFFICIENT_PLANT_STOCK`). The web server continues
to start and serve normally. This is unrelated to WP-02 and was not modified.

No other follow-up feature, lifecycle screen, schema change, or unrelated fix
was started.

## 6. Live-data confirmation

- No ALLADURG classifications, mappings, recipes, BOQ values, or programme bars
  were changed.
- No baseline was published for ALLADURG or any existing project.
- No production DDL was executed.
- WP-01 Bill hierarchy, unified classifier, and MoRTH pipe identities remain in
  place.

## Final validation

- Focused integrated checks: 106 tests passed.
- Full test suite: 134 files, 2,719 tests passed.
- Production build: passed.
- Diff whitespace check: passed.
- Application workflow: restarted and running.
- Preview: rendered successfully.