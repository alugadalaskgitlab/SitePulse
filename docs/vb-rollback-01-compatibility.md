# Vendor Bills recovery — implementation and verification report

Updated: 2026-10-13. Reference: `75fd8e337d27`, direct parent of `4d4fba9b54fb`.

## Outcome: recovery completed within authorized scope; NOT CLEARED TO PUBLISH

Selective recovery code and the expressly authorized development-only index
alignment are implemented. Exactly one production build passed. The focused
regression gate is green, and ordinary signed-in development browser verification
is complete. Production browser testing and publication safety are not claimed.
Nothing was published. No Production schema, index or record mutation was executed.

## Exact development index alignment

Both targets were explicitly identified, locked, checked for duplicate
equipment/period groups and fingerprinted before replacement. Both had zero hire
statements and zero duplicate groups. Both retained the same statement fingerprint
after replacement. The script does not import application startup code.

For **managed development `heliumdb`** and, separately, **application development
`sitelog_dev`**, the before definition was:

```sql
CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON public.hire_statements USING btree (equipment_id, period_from, period_to) WHERE (NOT ((billing_basis = 'daily'::text) AND (vendor_bill_id IS NOT NULL)))
```

For **each target**, the committed after definition is:

```sql
CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON public.hire_statements USING btree (equipment_id, period_from, period_to)
```

The after definition matches Production's existing index, confirmed read-only.
The schema declaration also matches. No record conversion, deletion or backfill
was performed. The alignment script is not wired into startup or publishing.

## Coordinated recovery changes

- Removed the newer Vendor Bills equipment-terms and daily-trip composers and
  the daily-trip eligibility endpoint. Operational Material Trip linking remains.
- Removed confirmed Material Trip daily-attendance sourcing from Vendor Bills;
  daily calculations use DPR/ordinary equipment activity. Preserved explicitly
  reviewed trip-basis candidates and ordinary material/transport billing.
- Restored Master basis/rate/date/divisor rules for new hire groups and monthly
  availability, with calendar-month selection and active-date proration.
- Restored unconditional equipment-period and overlap rejection, retaining
  cross-source historical duplicate-billing protections.
- Restored visible bill-line/tax details and the saved hire calculation snapshot.
  Removed the newer monthly-review summaries from the active preparation,
  detail and print/export projections.
- Retained current financial permissions, vendor-identity safeguards,
  recorded-only payment evidence, and frozen multi-statement calendar readers.
  These are deliberate compatibility differences from a wholesale baseline revert.
- Saved statement terms remain usable without substituting new Master commercial
  defaults. Historical daily-trip snapshots are readable and exportable; their
  edit/recalculation path now refuses to reinterpret them under DPR-only rules.
  Payment/status endpoints were not replaced.
- No unrelated DPR, Masters, procurement, inventory or operational trip rollback.
  Shared modules were patched selectively; no repository reset or broad revert.

## Historical evidence

Read-only Production aggregates: 56 bills (38 paid, 1 approved, 1 verified,
16 draft); 8 monthly/draft hire statements, 7 linked; all 8 object snapshots,
7 working-sheet arrays; no orphan statement-to-bill links. No daily statements
or snapshots matching the checked confirmed-daily-trip pattern were found.
That pattern check is not exhaustive historical-source classification.

Isolated PGlite fixtures exercise actual storage save/reopen/edit, monthly
proration, duplicate rejection, and newer daily-trip history. The historical
fixture preserves its stored amount, recorded payment, status and snapshot,
can be projected for export, and rejects recalculation without changing its
snapshot. No production records were copied into fixtures.

This is **not** proof that actual Production bills open in the restored UI.
After the user expressly approved development authentication writes only,
ordinary development login and device approval succeeded, without password resets,
grant changes, auth bypasses or API fixtures. The live register and preparation
screen rendered, and all four saved development bills opened through the actual
detail UI and API (HTTP 200). Their totals, recorded payments and statuses matched
the register data.

All four development bills have zero hire statements. Therefore frozen
hire-statement compatibility is established by the isolated database/output tests,
not by a live Production or development hire-statement browser inspection.

Before/after fingerprints were unchanged for vendor bills, bill items, hire
statements/exceptions, permissions, equipment masters and material trips.
The account password and privilege flags were also unchanged. No bill was saved.
The only authorized writes were normal development sessions/login auditing and
approval of the specifically identified pending verification devices.
The reproducible harness is `scripts/vb-recovery-browser.mjs`; it explicitly
checks the application development database identity and never connects to
Production. Screenshots and aggregate proof were inspected in
`/tmp/vb-recovery-browser-proof/`; they contain no exported credentials.

## Verification

- Latest focused 20-file run: **276 passed, 0 failed, 0 skipped**.
- The earlier nine failing cases were reproduced in an unchanged starting-revision
  checkout. Corrected test fixtures: identity-query ordering, transaction alias
  reads, missing PDF projection dependencies, and restored period-edit expectations.
  Itemized-persistence and calendar-segmentation unit fixtures now isolate their
  duplicate-guard dependencies explicitly; actual cross-source guard rejection
  remains tested against PGlite in the recovery suite. Application guards were
  not disabled or weakened.
- After final output edits: **31/31 passed** across recovery, monthly-selection,
  saved-output and activity-calendar suites.
- Recovery fixtures cover DPR sourcing, no trip-derived daily attendance,
  reviewed trip basis, save/reopen/edit, duplicate protection, Master monthly
  proration, Master basis validation and historical snapshot/payment preservation.
- Typecheck is not clean: 500 diagnostics were reported across the repository.
  No clean-typecheck claim or complete baseline attribution is made.
- `git diff --check`: passed.
- **Exactly one `npm run build`: passed** for client and server. Only documentation
  and memory updates initially followed it; the 2026-10-13 continuation changes
  only tests, a verification harness and this report, not application code.
  No second build was run.
  Large-chunk/Browserslist warnings remain.
- No full-suite or live authenticated export verification claim is made.
  The real export route callback and authorization cases pass in the isolated
  focused tests; this account's export grants were not expanded for browser tests.

## Startup and publication blockers

**Later startup-safety review:** see [vb-recovery-startup-safety.md](vb-recovery-startup-safety.md).
It supersedes the startup/publication findings below: actual publishing SQL is
empty, automatic legacy initialization was removed, and read-only startup was
verified. The follow-up also resolves the automatic reminder's subscription
cleanup and the three focused equipment-test failures; see its full-suite
qualification before treating this as an application-wide release gate.
The following paragraphs retain the original recovery verification history.

Normal startup invokes schema ensures and data backfills, including uppercase
business text, material density, arrangement allocations, site IDs and permissions.
It has not been established that all would be no-ops. Under the no-backfill and
no-record-change instruction, the workflow was **not restarted**. No startup
bypass or unrelated migration refactor was introduced.

On the 2026-10-13 continuation the existing application workflow was already
running with the restored source. No restart was performed by this continuation,
and no startup bypass was added. Normal signed-in browser verification may write
development sessions, device approval and login-audit records. The user approved
that narrow exception and browser checks completed. No bill, operational, role,
password or Production changes were authorized or performed by verification.

Managed development and Production expose the same 141 public table names and
identical public index definitions. A column-definition comparison also identified
different textual defaults on three stock numeric columns: development `0`
versus Production `'0'::numeric`, with matching numeric precision/scale.
No change to those defaults is proposed or authorized.

**Production SQL:** the recovery's hire-index change requires no Production DDL,
because Production already has the target index. However, a complete publish
migration preview and no-write startup have not been verified; zero Production SQL
for an actual publication cannot be promised. Do not publish. Any proposed
Production schema/index change must stop for explicit approval.

No follow-up tasks were created. Recovery implementation and verification within
the authorized scope are complete; publication remains a separate, unapproved
action subject to the restrictions above.
