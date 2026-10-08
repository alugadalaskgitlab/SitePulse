# TRIP-LINK-02 — development verification

## Rule and scope

New links use **APPLICABLE_ARRANGEMENT_STATUSES** from
`shared/materialReceiptSummary.ts`: **approved, mobilisation_pending,
in_progress**. Its existing caller, `resolveApplicableArrangements`, decides
which arrangements can receive material receipts; the existing single-trip
API used the same three statuses. This is the appropriate existing rule for
linking a delivered trip. `AUTO_SYNC_STATUSES` is for planning allocations and
also includes on_hold; retaining planning allocations is not permission to
attach a new receipt. No status set was invented.

The shared trip-link rule calls `isArrangementOperationalAsOf` with the **trip's
own date**, using the existing effective-date history. Cancellation is inclusive.
Legacy records without history retain the existing helper's current-status
fallback; no historical date is guessed.

Existing links are not repaired, cleared or reclassified. Single-record saves
that retain their original arrangement ID keep the existing historical
exception. Existing deliberate overwrite functionality was not redesigned.
No owner trip or arrangement row changed in this batch.

## Files

- `shared/tripArrangementLink.ts`: shared date rule, option status and exclusion
  response fields.
- `server/tripArrangementLink.ts`: per-trip eligibility, visible excluded count,
  zero-eligible refusal, status-history-aware confirmation token and option data.
- `server/routes.ts`: existing single-trip validator now calls the same rule.
- `client/src/components/BulkTripArrangement.tsx`: status-labelled options,
  disabled never-valid choices, exclusions in preview, confirmation and result.
- `client/src/components/ReceiptWorkContext.tsx`: status and disabled choices
  for existing-trip correction selectors, retaining historical selections.
- `client/src/pages/SiteMaterialsReceived.tsx`: existing-trip editor uses manual
  context mode so it cannot automatically replace/clear an existing link.
- Two trip-link test files; read-only inventory and signed-in verification
  scripts; evidence in this folder; instruction attachment and relevant memory.

## Signed-in P1–P6

Ordinary account 16, normal login **200**; no permission or flag changes.
All writes below target disposable development fixtures only.

| Proof | Result | Evidence |
|---|---|---|
| P1 | Actual bulk confirmation: **200**, 1 eligible, 1 linked to approved arrangement | `P1-approved.jpg`, `responses.json` |
| P2 | Draft and cancelled-on-trip-date bulk requests: **400**, excluded count and reason, no write | `P2-refused.jpg`, `P2-refused.json`, `P2-cancelled-refused.json` |
| P3 | Actual bulk confirmation: **200**, 1 linked, 1 excluded. Oct 1 trip valid; Oct 3 trip invalid after Oct 2 cancellation | `P3-preview.jpg`, `P3-saved.jpg`, `P3-rows.jpg`, `integrity.json` |
| P4 | Current status shown. Never-valid draft disabled; historically valid cancelled arrangement remains selectable, with per-trip checks | `P4-selector.jpg`, `P4-options.json` |
| P5 | Both actual Set-roles and Materials Received edit selectors show disabled draft/cancelled choices for Oct 8. Authenticated invalid PATCH attempts return **400** | `P5-roles.jpg`, `P5-materials-received.jpg`, corresponding rejection JSON |
| P6 | Existing cancelled link remains displayed as historical and is byte-identical | `P6-preserved.jpg`, `integrity.json` |

P5 invalid requests were sent through the normal authenticated API separately
because the UI correctly prevents selecting those invalid choices. They are
not claimed as successful UI saves or mocked responses.

## Z1–Z5

- **Z1:** With fixtures present: 15 trips and 8 arrangements before/after.
  Only trips **1900000201** (P1) and **1900000203** (P3) changed; their sole
  changed column was `earthwork_arrangement_id`. Every arrangement was
  byte-identical during verification. After cleanup: original **10 trips and
  5 arrangements**, with identical full-row SHA-256 hashes before and after.
  See `integrity.json`, `cleanup.json`, `inventory-checksums.json`.
- **Z2:** Read-only development inventory: **0 invalid existing links**.
  There were **0 linked trips among 10 existing trips**. The report includes
  deleted records rather than hiding them, with deletion state identified.
  See `existing-links.json`. No repairs were made.
- **Z3:** Full suite: **4,646 passed, exact 48 baseline failures, 3 skipped**.
  No new failures, missing baseline test files, or setup failures.
  Added **15 tests**: 12 shared-rule cases (existing allowed statuses,
  non-operational statuses, effective-date boundaries, invalid/missing dates)
  and 3 transactional cases (draft refusal, mixed-date linking/preservation,
  stale status-history confirmation). Existing fixture setup now explicitly
  supplies approved status; an unordered option assertion compares sorted IDs.
- **Z4:** Build passed, exit **0**. See `build.log`.
- **Z5:** Removed fixture project/item **1900000200**, trips **1900000201–205**,
  arrangements **1900000210–212**, generated trip audits, disposable login
  sessions/devices **166–170**, and browser profile. No pre-existing business
  records were removed. Fixture IDs were reused only after verified cleanup.

## Choices and limits

- Kept historical cancelled options selectable when recorded history contains
  a valid period, rather than incorrectly filtering by today's status.
- Retained the existing HTTP 400 convention for invalid single-record input
  and used it for all-excluded bulk requests; mixed-date requests return 200
  with explicit exclusion counts.
- Created arrangements with their test status/history at insertion; never
  changed an existing arrangement's status or history. All fixtures removed.
- No changes to permissions, billing, rates, bulk material-source behavior,
  status transitions or approval workflow. VB-ARRANGE-02B was not started.
- The normal development restart ran existing startup jobs; their logs
  reported stock/ledger writes. Those jobs were not investigated, edited or
  manually run as part of this change. Trip/arrangement preservation is proven
  by the checksums above; this report does not claim unrelated startup jobs
  are read-only.
- Nothing published; no production database accessed. A genuine Publish
  preview is unavailable through the exposed controls; no settings page or
  fabricated preview is substituted for it.
