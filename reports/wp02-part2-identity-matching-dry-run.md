# WP-02 Part 2 — identity-first SNL mapping review

**Production evidence:** project ID 2, **UPGRADATION FROM ALLADURG PWD ROAD TO
PAMPAD**; read-only CSV snapshot `/tmp/wp02-prod-boq-snapshot.csv` (24 rows).
A read-only production query produced this snapshot. The dev library was also
queried read-only to associate active rows with sources. No database write,
recipe application, schema/library edit, programme edit, or ordering edit was
performed.

**Thresholds are unchanged:** mapped `>= 0.70`; review `0.50–0.69`; below
`0.50` unmapped. Deterministic rule confidence remains `0.82`; it does not
relax either fuzzy threshold.

## Six-source active dev-library inventory

| Source | Active rows |
|---|---:|
| MORTH_SDB_2019 | 836 |
| SDB_ROAD | 260 |
| SDB_STRUCTURES | 216 |
| SDB_IRRIGATION | 257 |
| SDB_GATES | 22 |
| SDB_MISCELLANEOUS | 403 |
| **Total** | **1,994** |

## Identity and resource findings

Rule mapping now requires one compatible SNL identity. It retains numeric and
variant evidence rather than stripping it during duplicate propagation:

| Family | Required identity evidence | Recipe/resource result |
|---|---|---|
| Hume pipe | diameter + NP class + row/vent arrangement | Only exact SNL pipe master may apply its equipment, labour and materials. |
| PCC/RCC | M grade and, if stated, nominal mix | Different grade/mix is review; no concrete recipe is copied. |
| DBM/BC | stated grading | Wrong/missing grading cannot inherit a bituminous recipe. |
| KM/HM stone, sign, barrier | stone/sign/beam subtype | Generic or multi-subtype text is review. |
| WMM, prime, tack, embankment, subgrade, marking, studs, rumble | unique canonical name plus unit/sector | SNL master remains authoritative when one exists; no unsupported resource norm is added. |

`applySnlMappingToRecipes` is unchanged: successful unit-compatible
deterministic mapping applies the chosen SNL master’s equipment, labour and
materials. Duplicate propagation is now limited to an exact normalized identity
signature, same classifier/unit, and an already deterministic automatic source
(rule, or unique explicit code); manual and fuzzy mappings never propagate.

## Full 24-item production evidence and dry-run disposition

“Keep” means a current manual/compatible mapping is retained for review
purposes, not rewritten. “Deterministic” means a unique compatible identity is
available under the new rules. “Review” means no mapping/recipe would be
applied. The result is a recommendation only.

| ID | BOQ evidence (abbreviated) | Current snapshot | Dry-run |
|---:|---|---|---|
| 13 | Clearing/grubbing, SQM | mapped 2.01 | Keep safe manual 2.01 |
| 14 | Scarifying granular surface, SQM | mapped 2.05 | Keep safe manual 2.05 |
| 15 | Borrow embankment, CUM | mapped 3.16 | Deterministic embankment |
| 16 | Earthen shoulders, CUM | mapped 4.20 | Keep safe manual 4.20 |
| 17 | WMM, CUM | mapped 4.14 | Deterministic 4.14 |
| 18 | Primer/SS-1, SQM | mapped 5.01 | Deterministic 5.1 |
| 19 | Tack/RS-1, SQM | mapped 5.02 | Deterministic 5.2 |
| 20 | DBM Grading-II, CUM | mapped 5.01B/BM label | Deterministic 5.04B |
| 21 | Tack coat-1, SQM | mapped 5.02 | Deterministic 5.2 |
| 22 | BC Grading-II, CUM | mapped 5.05 | Deterministic 5.8-ii |
| 23 | Structure excavation, CUM | mapped 12.1 | Keep safe manual 12.1 |
| 24 | Sand foundation fill, CUM | mapped 12.3 | **Review**: no supported deterministic tag |
| 25 | PCC 1:3:6, CUM | mapped 6.01/M10 | Deterministic 12.4 |
| 26 | M15 foundation concrete, CUM | mapped 2.4 | **Review**: cross-sector/identity conflict |
| 27 | PCC M15, CUM | mapped 6.01/M10 | **Review**: M15 ≠ M10 |
| 28 | 1000mm NP4 Hume, 1V, RMT | review; 6.02 suggestion | Deterministic `9.2-NP4-1000` |
| 29 | Ordinary KM stone, NOS | review; concrete suggestion | Deterministic 8.14-ii |
| 30 | H.M. (200m) stone, NOS | review; concrete suggestion | Deterministic 8.14-iii |
| 31 | Informatory/name board, NOS | review; sign suggestion | Deterministic 8.4 |
| 32 | 1000×900 direction/place board, NOS | review; sign suggestion | Deterministic 8.5 |
| 33 | Standard traffic sign board, NOS | review | Deterministic generic 8.4 |
| 34 | Twin-shank reflective studs, NOS | unmapped | Deterministic 8.35 |
| 35 | 2.5mm thermoplastic, SQM | mapped 8.13 | Deterministic 8.13 |
| 36 | 7.5mm three-layer rumble strips, SQM | unmapped | Deterministic 8.38 |

### Counts

| Status | Current snapshot | Conservative identity-first dry-run |
|---|---:|---:|
| Mapped | 16 | 21 |
| Needs review/unmapped | 8 | 3 |
| Total | 24 | 24 |

The measured rule path resolved 17 rows and retained four already-safe manual
identities (13, 14, 16, 23), yielding **21/24 = 87.5%** safely mapped. IDs 24,
26 and 27 remain review. There are no conditional or hypothetical counts.

The exact rule-only run (before retaining those four safe manual identities)
was 17 deterministic / 7 review. It used
`classifyBoqItemForSnl → isPrimaryRuleCandidate → ruleMatchSnl` against
`/tmp/wp02-prod-boq-snapshot.csv` and `/tmp/wp02-dev-snl.csv`, with the
read-only source association described above.

## Pampad-style in-memory safeguard fixture

There are **15 standard unambiguous** fixtures (WMM, DBM, BC, tack, prime,
embankment, subgrade, PCC M15, exact pipe, KM stone, sign, thermoplastic,
W-beam barrier, rumble and reflective studs): all resolve to one identity.
There are **four deliberate safeguards**: equal WMM methods, ungraded PCC among
M10/M15, NP4/1000 pipe without row, and generic sign among cautionary/mandatory.
All four return review/no deterministic result. This is deliberately distinct
from the production evidence above.

Focused tests cover the pipe variants, PCC safeguards, subtype matching,
identity-signature duplicate blocking and deterministic-source-only propagation.