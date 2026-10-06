# PERM-02 — implementation and verification

Development only. No production query, production permission migration, or publication was performed. Signed-in evidence uses explicitly authorized temporary development users, ordinary login, and approval of their exact devices—not an authentication bypass. All four temporary users and both operational fixtures were removed after verification.

## Outcome and exceptions

The 87 sections and eight actions remain. View alone now grants section entry; administrator/owner bypasses remain. Existing route alternatives are retained, with IRN Approve added to the IRN page alternatives to implement D1. Hub tables still have one Access permission column.

Six of the nine dead View switches now gate their pages. Three remain **explicit D3 exceptions**:

- `vendor_bill_aliases.view`
- `admin_notifications_manage.view`
- `push_notifications.view`

The audit found no dedicated implemented page for these three switches. I retained them unchanged, with truthful “no implemented page” tooltips, rather than inventing functionality or silently greying them. Consequently, B3's reader-only rule has these three disclosed exceptions, and self-test 5 cannot demonstrate page denial/opening for them. This is not a claim that all nine were wired.

## Files changed for this instruction

- `client/src/lib/auth-context.tsx`: View-only entry.
- `client/src/App.tsx`: five formerly login-only page gates and IRN View alternatives.
- `client/src/pages/MastersHub.tsx`: use the Admin Hub section for hub entry; retain separate administrator-only feature checks.
- `client/src/pages/UserManagement.tsx`: generated action map/tooltips, View-only hub Access, separate Administrator choice, enabled admin-target matrix with banner.
- `shared/permissions.ts`: Labour Allocation in the Site group; Create implies Edit in newly applied templates.
- `shared/permission-actions.generated.json`: checked-in editor/audit artifact.
- `scripts/permission-audit.ts`: derive visibility reads from source, generate/check the artifact, report evidence and exceptions.
- `tests/permission-map.test.ts`: five new contract/drift tests.
- `tests/perm01MatrixUi.test.tsx`: update four legacy cases and their loading helper for View-only hub semantics.
- `reports/permission-audit.md`, `reports/permission-audit.csv`: regenerated audit.
- `reports/perm-02-progress.md`, this report, supporting evidence and screenshots.
- `.agents/memory/permission-preservation.md` and its index pointer: preserve the owner's access-preservation constraint.

Pre-existing unrelated workspace changes were left alone.

## A1: lockout list, before changes

Database verified as `sitelog_dev`. Predicate: View false and any of Create/Edit/Delete/Reports/Export/Approve true.

**Original users: zero affected user/section pairs. Full list: empty.** A2 therefore required no changes to those users. Production was not covered.

The temporary Create-only test user was deliberately constructed separately. Its `plant_heating` row 2082 received View=true for the preservation test and was removed with the temporary user.

## D2: additive access preservation

New gates on previously login-only pages required these eight original-user changes. No other permission bit changed.

| User ID | Section | Permission row | Before → after | Audit entry |
|---|---|---:|---|---:|
| 4 | masters_hub | 1591 | View false → true | 72 |
| 8 | hmp_hub | 1993 | View false → true | 73 |
| 8 | masters_hub | 1999 | View false → true | 74 |
| 8 | rmc_hub | 2001 | View false → true | 75 |
| 16 | dashboard | 2087 | New View-only row | 76 |
| 16 | hmp_hub | 2088 | New View-only row | 77 |
| 16 | masters_hub | 2089 | New View-only row | 78 |
| 16 | rmc_hub | 2090 | New View-only row | 79 |

Temporary-user preservation writes: user 17 rows 2091–2094 (dashboard, hmp_hub, masters_hub, rmc_hub; audit 80–83); user 18 rows 2095–2098 (same sections; audit 84–87). These temporary rows were subsequently toggled for the authorized tests and removed during cleanup. Existing-user grants were not revoked.

## Signed-in evidence 1–8

1. **Create-only preservation:** `01-create-only-before.jpg` shows the original Create-only test user opening Heating Sessions. `03-create-only-after.jpg` shows continued access after its additive View grant.
2. **No bits:** `02-no-bits-before.jpg` and `04-no-bits-after.jpg` show Manpower Review refused before and after.
3. **Map drift:** the test runs a fresh audit against the checked-in map, then corrupts a separate temporary copy. The valid check exits 0; the deliberately broken copy exits 1 with “Permission map drift”. The checked-in map is never corrupted.
4. **Tooltips:** actual signed-in matrix DOM: **188 tickable permission cells, 188 with non-empty tooltips**. This permission-manager screen excludes the pre-existing admin-only legacy group. The full artifact covers 208 active cells, all with tooltips; three are the disclosed D3 exceptions.
5. **Dead-switch gates:** dashboard, HMP Hub, Masters Hub, Admin Hub, RMC Hub and IRN Approve each refused entry with View=false and opened with View=true. Twelve `gate-<section>-<false|true>.jpg` screenshots record both states. Other OR grants were absent for the IRN isolation test. Three exceptions above have no page to test.
6. **Labour:** `labour-row.jpg` and `admin-matrix.jpg` show the independent Labour Allocation row. An ordinary signed-in subject's actual item-status PATCH returned **403** with Labour Create=false and **200** with it true. The temporary requirement was removed.
7. **Template create/edit:** created a new Equipment / Plant user through the actual wizard. Normal login returned 200 after its specific device approval. Equipment creation returned **201**, correction PATCH returned **200**, and the corrected name appeared in the signed-in equipment screen (`template-equipment.jpg`). These writes used the real API, not a mocked component response. Initial fixture creation omitted required meter type and returned 500; supplying the normal required field succeeded. The fixture was removed.
8. **Administrator clarity:** `wizard-role.jpg` shows Administrator separately from templates. `admin-matrix.jpg` shows the enabled admin-target Permissions dialog and explicit full-access/bypass banner.

Permission toggle setup for the browser/API cases used authorized temporary-user database changes; the screenshots demonstrate persisted gates, not mouse-click recordings of every checkbox. Component tests separately exercise checkbox interaction and saving.

## Z1: row counts and content checksums

Users: **6 before / 6 after**, every original full-row hash identical. Permissions: **350 before / 354 after**. Row-by-row comparison found exactly the four View-only updates and four View-only insertions above. No existing row was removed or other field changed.

SHA-256 over ordered `{id, full-row-MD5}` user snapshots:

- Before and after: `b962ba99ca227698b26c75f7c2f248bad7b2e6e7cf32f14af2b970efdf3b59b9`

SHA-256 over ordered permission-row JSON:

- Before: `458a1e34ad6085011c55e7dfbfb34a022fac39c29c064cc4940b5fb5423bfd27`
- After, read directly from the database and independently matched to the baseline plus the complete row diff: `0fd994467a3459ed8d9ed939fd6ad26bbab2723ce17f10a9b1f3d2bc7aed3894`

Cleanup verification found zero temporary users, devices, or permission rows. No credentials are included in this report or evidence.

## G3: original user flags

| User | Admin | Owner | Field engineer | Permission manager |
|---|---|---|---|---|
| 1 — Administrator | yes | no | no | no |
| 2 — Sunil Kumar | yes | no | no | no |
| 3 — K V Babu | no | no | no | yes |
| 4 — Ramesh | no | no | yes | no |
| 8 — Rajesh | no | no | yes | no |
| 16 — Agent Verification | no | no | no | no |

**No development user has isOwner=true. All original flags and user rows are unchanged.** The 16 canonical bypass sites remain.

## Z2: tests

Final full-suite comparison is recorded in `test-summary.json`.

| Run | Files | Tests | Passed | Failed | Pending |
|---|---:|---:|---:|---:|---:|
| Before | 327 | 4,570 | 4,519 | 48 | 3 |
| Final | 328 | 4,575 | 4,524 | 48 | 3 |

**No new failing tests; no baseline test file is missing.** The same 48 baseline failures remain, so the full suite still exits 1—not a green-suite claim. All five added tests pass. An intermediate run exposed four old hub tests expecting the superseded seven-bit access rule; those expectations were updated, the seven-case file passed separately, and the complete suite was rerun with the results above.

Added five tests: fresh-map equality plus deliberately broken-map rejection; 87×8 keys and complete tooltip coverage; Labour appears exactly once; every template Create grant includes Edit; View-only entry with existing admin/owner bypass.

Updated four existing matrix tests: export-only hubs no longer appear accessible; Access toggling preserves inert historical aliases; partial managers cannot grant View through Edit; unowned historical grants still block saving. The helper now waits on View alone. All seven matrix UI cases passed in the focused run. No pre-existing type errors are presented as new.

## Z3: build

`npm run build` passed after the application changes. Client and server bundles were produced. The application workflow was restarted successfully; real signed-in screens and APIs were then checked.

## Z4: audit

| Verdict | Before | After |
|---|---:|---:|
| LIVE | 181 | 205 |
| DEAD | 9 | 3 |
| HIDDEN | 361 | 0 |
| CORRECTLY-OFF | 145 | 488 |

87×8 = 696 cells. Zero undeclared cells and zero unresolved recognized calls. This is source-reader evidence, not a claim that every action independently overrides other role, site, or business restrictions.

## Choices and limitations

- Kept Reports labels and clarified export behavior in tooltips rather than renaming columns across the existing matrix.
- Edit tooltips disclose delete/cancel authorization; Approve wording derives operation verbs from route evidence. IRN Create explicitly describes its approval-button role and the separate server Approve requirement.
- OR tooltips name alternative sections/actions without removing any existing alternative.
- Template updates affect new applications only; no template was reapplied to an original user. Delete/Approve/Export/Notify template grants were not changed.
- Production was not examined or migrated. Development additive grants do not make a production rollout safe automatically.
- The three D3 exceptions are retained and disclosed, not silently removed.

## Publish preview

Publication is stopped. The publishing review surface is offered in the final response; no Publish action was executed and no production/schema diff was inspected. This report does not claim an inspected production preview.
