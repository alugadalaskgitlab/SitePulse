# TRIP-LINK-01

Implemented without pricing, migrations, production writes or changes to
progress calculation. No owner trip was linked automatically.

## Files and matching rule

- `server/siteMaterialTripFilters.ts`: shared SQL predicates extracted from
  `bulkAssignSiteMaterialTripMaterialSource` (original `server/storage.ts`
  lines 12761–12781). Called by the existing material-source storage method
  at current line 12765 and the new arrangement operation.
- The original route is `POST /api/site-material-trips/material-source/bulk`,
  current `server/routes.ts:845`. Its request contract and write behavior stay
  unchanged.
- `server/tripArrangementLink.ts`, `shared/tripArrangementLink.ts`,
  `server/routes.ts`: site-specific arrangement options, preview and transactional
  linking with one audit per changed trip.
- `client/src/components/BulkTripArrangement.tsx`,
  `client/src/pages/SiteMaterialTrips.tsx`: explicit choice, eligible/overwrite
  counts, filter confirmation, visible absence and no-arrangement filter.
- `TripRoleEditDialog.tsx`, `ReceiptWorkContext.tsx`: reuse the existing context
  editor in manual-only mode; send only deliberately changed context fields.
- Tests, verification script, evidence and project decision notes.

Matching retains active/nondeleted records; inclusive dates; uppercase/trimmed
site/material/transporter equality; normalized vehicle equality; permitted-site
scope; and the existing unassigned-material-source predicate. **As explicitly
approved, arrangement linking includes own-source trips.** The material-source
tool still excludes them. If the existing “without a material source” filter is
selected, its existing own-source exclusion remains part of that filter.

## Choices and safeguards

- Default: only trips not yet linked. Overwrite requires a separate checkbox
  choice and confirmation showing how many other links will be replaced.
- Links already pointing to the selected arrangement are no-ops, excluded from
  the changed count and audit writes.
- Preview and write use the same selection function. A locked-row fingerprint
  rejects stale confirmation with 409 rather than changing a different set.
- No-arrangement filtering never resets other filters. The material-source tool
  is temporarily blocked while this new filter is active: its unchanged API
  does not accept this filter, so allowing it would write beyond the visible set.
- Existing-trip context editing disables entry-time auto-selection/clearing and
  does not read/display rates. Untouched context fields are omitted from PATCH.

## Evidence P1–P7

**Signed-in editing remains blocked by the designated account's existing
`site_materials.edit` permission. No permissions were altered.**

Normal sign-in: **200**. Arrangement options, preview and bulk requests:
**403**. The editable bulk/Set-roles screens therefore cannot be verified with
this account. P1–P6 are not claimed as successful signed-in acceptance.

Automated substitute evidence:

| Requirement | Verified result |
|---|---|
| P1 | Real PostgreSQL connection-local TEMP tables: preview 2, changed exactly fixture IDs 1/2, including own-source; only arrangement column changed |
| P2 | Outside-filter, deleted, outside-date and already-target-linked fixture rows remain byte-for-byte unchanged |
| P3 | Re-run preview 0; operation returns typed 409 NO_MATCHING_TRIPS |
| P4 | Explicit overwrite preview 3, overwrite count 1; audit for fixture ID 3 records 22 → 11; audit failure rolls every trip back |
| P5 | Component save sends deliberately selected BOQ/arrangement with roles, without quantity/date/site/material/receipt-number fields |
| P6 | Untouched saved BOQ/project/bar/arrangement fields omitted from PATCH; real context component never automatically changes them |
| P7 | **Live signed-in HTTP 200**, 10 unlinked rows and no linked IDs; nonexistent transporter combined with no-arrangement returns **200 []**; actual screenshots show “No arrangement linked” and the empty-result message |

P1–P6 substitute tests are isolated tests, not live owner-record changes or
successful signed-in write HTTP responses.

## Z1–Z5

- **Z1:** Existing trips **10 → 10**, changed IDs **[]**. Full-row checksum before
  and after: `90445fec9cebf345e88be82e09dcf92faef46a2fa8ff213310c9ef05b82f01a7`.
  All five existing arrangements are unchanged.
- **Z2:** All **45 bills, 172 bill items and 199 progress entries** retain identical
  counts and full-row checksums. Bill #1 total: **₹170,040 → ₹170,040**.
  No pricing/payable/progress code changed. A live bill/payable/progress-report
  comparison after a signed-in link remains unverified because editing is denied;
  database integrity checks are not presented as that acceptance flow.
- **Z3:** **4,631 passed, exact 48 baseline failures, 3 skipped.** No new failures,
  missing baseline test files or setup failures.
- **17 tests added:** 9 real-SQL bulk selection/audit/rollback/scope/validation;
  3 bulk confirmation UI; 2 manual-context no-inference/no-rate-read;
  2 Set-roles context patch preservation; 1 combined no-arrangement predicate.
  The six focused files passed all **52** tests.
- **Z4:** Build passed, exit 0.
- **Z5:** Connection-local fixture tables (`sites`, `boq_projects`,
  `earthwork_arrangements`, `site_material_trips`, `audit_logs`), temporary audit
  sequence/function/trigger disappeared on connection close. Disposable login
  sessions and newly approved verification devices were deleted by the harness.
  Chromium stopped; temporary browser profile and raw baseline-row file removed.
  Unrelated PDFs regenerated by the full suite were restored. No new operational
  fixtures or grants remain.

No publish occurred; VB-ARRANGE-02B was not started. A genuine Publish preview is
not available through the exposed controls; Publishing settings are not a preview.

Observed outside this scope: attachment requests returned 500 during the list
check; attachments were not investigated or changed.
