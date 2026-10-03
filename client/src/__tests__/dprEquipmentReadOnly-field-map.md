# DPR-VIEW-01 read-only field placement

Only approved Part 1 is implemented. The existing Industrial Audit Ledger
language (existing display/body fonts, slate-tinted surfaces, restrained amber,
red for high consumption, green only for measured/within tolerance) is retained.
No global restyle, edit-screen behavior, schema or stored calculations change.

| Existing fact | Compact summary | Expanded / printed audit |
| --- | --- | --- |
| Machine, registration, owner/vendor, hire badge, operator | Machine column | Entry/hire type, machine-day index |
| Full daily status and reason | Non-Working status plus reason | Full status and saved reason, including Working |
| Task | Work column | Work assignments |
| BOQ attribution | Existing resolveEquipmentBoqHours slices, names and hours | All segment times/items and legacy grouped assignments; assigned, unassigned and machine-day totals |
| General / Not linked | Work column, with incidental warning only for task with no resolved attribution and not General | Full assignments |
| Opening/closing meter or odometer | Usage expression where applicable | Saved readings retained independently |
| Start/end clock and clock duration | Usage expression for time-based rows | Both times and separate clock duration |
| Trips and one-way distance | Trip usage expression with existing historical distance | Raw trip count/distance |
| Saved hours and saved distance | Builder historical runtime | Both saved quantities independently, plus differing calculated preview |
| Calculated preview basis / warning | Warning in Notes | Usage basis, differing calculated quantity |
| Diesel issued | Diesel column | Issued quantity |
| Opening/closing tank and confirmation | Tank summary and confirmation check | Both values and physical-balance state |
| Saved expected and fuel-summary expected | — | Both values separately |
| Issued minus saved expected | — | Separate difference; totals retain the same definition |
| Saved and current norm | Helper's chosen norm | Both norms separately; vehicle rates displayed reciprocally in km/L |
| Canonical actual efficiency | Preferred measured figure when available | Available canonical provenance |
| Snapshot consumed and consumed-minus-expected variance | Measured fallback uses existing snapshot | Both existing snapshot facts independently |
| Breakdown/stoppage description and duration | One summary per stoppage in Notes | Full stop times, duration, responsibility, repair/payment scope, vendor debit flag and remarks |
| Stop selected/saved attachment | — | Existing viewer eligibility and attachment interaction; selected filenames and print audit filename retained |
| Linked maintenance | — | Matched and unmatched rows, status, own times/duration, description and differing responsibility |
| Diesel source | Concise source; direct-purchase station, bill and amount where applicable | Source, station, bill and amount (including zero) |
| Lifecycle and Send onward | Exact SiteReport subtree supplied as slot | Excluded from print, no control copied into audit |
| Repeated readings/fuel/assignment explanations | — | Consolidated single bottom legend, including clock-based assignment validation and gaps/partial assignments |

The adapter passes `historicalUsage.runtime`, `historicalUsage.efficiencyUnit`,
`fuel.actualConsumed`, `norm.value`, saved norm, saved issued fuel and confirmation
to the shared helper. Exposing `historicalUsage` is additive; its construction
and historical precedence are unchanged.

Below 640px the same table DOM stacks into cards in the approved six-field
order, with no duplicate renderer. Print uses a CSS-controlled audit div, forced
expanded regardless of screen state. Existing wrapping/page-fragmentation rules
remain scoped to Equipment Log; lifecycle is always hidden.

Evidence limitation: the initial actual `/site/report/409` capture showed the
unauthenticated application splash and HTTP 401, not authenticated DPR content.
Saved `.agents/outputs/dpr-view-01/initial-unauthenticated-access-boundary.jpg` is access-boundary evidence only. The
existing isolated fixture server was not running. No workflow was started,
no auth bypass was introduced and no production record was changed.

Subsequent isolated-fixture verification mounted both actual pages with the
same mockup-derived DPR409 fixture and HEAD-extracted before sources. Browser,
phone and actual paginated PDF evidence and limitations are indexed at
`.agents/outputs/dpr-view-01/README.md`. These are not signed-in customer records.