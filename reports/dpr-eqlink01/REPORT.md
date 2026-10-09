# DPR-EQLINK-01 — diagnostic patch; live acceptance blocked

## Result

Implemented D1 only: both existing equipment conflict checks retain their error
class, code and HTTP 409, but now name the equipment, DPR date, attempted
equipment-log ID and usage ID. The mismatch message names both dates.
Both route handlers include structured `details`. Existing DPR error handling
displays the server message; actual signed-in rendering remains unverified.

No detach feature, closure optimization, reference repair, usage mutation,
startup routine or permission change was implemented. This patch makes the
failure diagnosable; it does **not** unblock the owner's published save.

## A and B findings

See `INVESTIGATION.md` for the earlier code investigation reported before
feature work. A chainage-only submitted update re-inserts equipment logs and
enters the locking/closure loop. Some closed links are no-ops, while open or
owned links have real closure/ownership effects. A proven-unchanged mutation
optimization remains a proposal, not approved implementation. It cannot skip
the missing-reference check.

The supplied production identifier contains placeholder ID/date text and the
site TAKKADPALLY-SIRUR. No precise production row, deletion event or restoration
candidate is established. No production database connection was requested or
used. Production data was not queried or changed.

The usage deletion path lacks an equipment-log reference guard and the link
has no foreign key; that is a possible mechanism, **not a proven incident cause**.
Restoration confidence for the owner's record remains undetermined.

The development audit found **zero** dangling links. Fixture DPR 261, log 539,
site 26 deliberately referenced absent usage 2147483001. It is artificial and
has no historical original to restore; this proves nothing about production
restorability. All three fixture rows were removed.

Important identity caveat: in replacement/version transactions the reported
log ID can be an attempted insertion rolled back with the conflict, rather than
the persisted source log ID. Equipment name, date, DPR ID and usage ID provide
additional context; never use the attempted log ID alone for a repair.

## P1–P8

| Proof | Outcome |
|---|---|
| P1 | Focused runtime fixture throws the existing conflict with row details. Authenticated HTTP/browser reproduction blocked before saving: ordinary login 200; GET /api/dprs/261 returned 403, section site_dprs, action view. No 409 screenshot claimed. |
| P2 | Runtime spy confirms a usage lock is executed for unchanged linked facts before missing-reference rejection; source test confirms unconditional submitted-update finalizer call. Full chainage-only HTTP save not reached. |
| P3 | Artificial missing-reference fixture has no original usage; actual incident restoration remains unknown. |
| P4–P6 | Not applicable: no detach endpoint/UI exists and no link was cleared. |
| P7 | Runtime tests cover valid closed no-op and valid open normal closure. Signed-in save unverified. |
| P8 | Runtime test verifies mismatch message and payload contain both dates and row identity. Browser screenshot blocked by the same account permission. |

No bypass, privilege escalation or grant restoration was attempted to overcome
the 403. DEV-ACCT-02's current permissions do not include the needed DPR View.

## Z1–Z5

- Before/after counts and content digests cover every development table.
  Equipment logs, usage, DPRs, progress, diesel, hire, stock and permission
  tables match after fixture cleanup. Only ordinary login-related users,
  devices and sessions changed; the authentication code updates lastLoginAt.
  See `before.json`, `after.json`, `authenticated.json`.
- Read-only audit and count: `dangling-audit.json`, zero rows.
- Full suite: **4,788 passed, 52 failed, 3 skipped, 351 files**. All historical
  48 failure identities remain. Four additional failures also reproduce on
  unmodified pre-patch HEAD in an isolated source snapshot; none concerns the
  new diagnostic behavior. The isolated four-file run also has a fifth failure,
  so it must not be described as a clean baseline. No baseline files omitted.
  See `regression-summary.json`, `full-suite.json`, `baseline-four.json`.
  Extra failures involve legacy diesel attachment authorization assertions,
  removed startup cleanup assertions, maintenance-scope assertions and generated
  permission-map drift. These parked areas were not changed.
- Added five tests in `tests/dprEqLink01.test.ts`: missing-link rejection and
  lock/details; date-mismatch identity; healthy closed no-op; healthy open
  closure; submitted-update/409 transport contract. All five pass.
  No detach authorization tests are claimed because no detach feature exists.
- `npm run build` passed. Application restarted and serves normally. The generic
  unauthenticated screenshot is not evidence for signed-in error rendering.
- Removed fixture site 26, DPR 261 and equipment log 539. No equipment usage,
  diesel or hire fixture rows were created. Removed verification devices 222
  and 223 and their sessions; retained the legitimate last-login timestamp.
  No user was created and existing account flags/grants were unchanged.

## Decisions, preview, delivery

Chose a diagnostics-only patch, not an unproven detach or unauthorized
optimization. Stopped signed-in acceptance at the existing permission guard.
No publication or production writes. Genuine read-only Publish preview is
saved in `publish-preview.json`.

Git commit/push outcome is recorded in the final delivery message. Previous
push attempts failed because GitHub rejected configured authentication.
This is a partial, blocked delivery—not a completed recovery of the owner's DPR.
