# DEV-ACCT-02

## Changed files

- `scripts/dev-verification-grants.mjs`: guarded, transactional, idempotent
  restoration of the approved permissions.
- `scripts/permission03b1-signin.mjs`: calls that restoration from the existing
  development account-maintenance procedure.
- `scripts/dev-acct02-verify.mjs`: normal sign-in, disposable fixtures, real
  browser saves, status collection and cleanup.
- `reports/dev-verification-account.md`: authoritative grants and sign-in rules.
- Development verification memory, uploaded instruction, and this evidence folder.

No application guard, route, section key, template, label, schema, bypass,
account flag, site grant, or password was changed.

## Exact grant list

| Section | Actions | What it unlocks |
|---|---|---|
| `site_materials` | view/create/edit | Material Trips, bulk links, Set roles |
| `work_programme` | view/edit | Execution Arrangements register and rate saves |
| `work_programme_review` | view/edit | Arrangement/planning review and evidence |
| `planning_masters` | view | Planning reference data |
| `vendor_bills` | view/create/edit | Bill screens and their legacy single-section API guards |
| `vendor_bills_raise` | view/create/edit | Alternative bill creation/edit gates |
| `vendor_bills_view` | view | Bill-screen navigation |
| `master_parties` | view | Existing vendor choices used by Set roles/billing |

Derived from the actual guards: `App.tsx` bill and Execution Arrangements routes;
`VendorBills.tsx` action gates; `routes.ts` arrangement GET/POST/PATCH and bill
create/edit routes; and `vendor-master.ts`'s `master_parties` view guard.
No vendor data was changed.

Existing unrelated view-only grants were retained. No approve rights were added.
Delete, Export and Notify remain false on **every** section.

## P1–P6

- **P1:** Before writes, `SELECT current_database()` returned **sitelog_dev**.
  Only `DEV_DATABASE_URL` was used.
- **P2:** Updated rows **2076, 2077**; inserted rows **2429, 2430, 2431, 2432,
  2435**. Every row belongs to user **16**. Full before/after values and the
  seven row-level diffs are in `permissions.json`.
- **P3:** Ordinary login **200**. Execution Arrangements GET **200**. Disposable
  arrangement POST **201**. In the actual signed-in editor, changed its
  600-CFT trip rate from **₹1,200 to ₹1,250**, clicked Save Draft, and received
  PATCH **200**. Stored `trip_rates` confirmed ₹1,250.
  Screenshots: `rate-edit.jpg`, `rate-saved.jpg`.
- **P4:** In the signed-in Material Trips screen, filtered by active site,
  Soil, current date and unique fixture vehicle. Confirmed **1 eligible trip**;
  bulk POST **200**. Opened Set/Change roles and clicked Save roles;
  PATCH **200**. The fixture retained **600 CFT**, its date and receipt number,
  with its explicit arrangement link persisted. Screenshots: `bulk-confirm.jpg`,
  `bulk-saved.jpg`, `roles-edit.jpg`, `roles-saved.jpg`.
- **P5:** `isAdmin=false`, `isOwner=false`, `isFieldEngineer=false`,
  `canManagePermissions=false` before and after.
- **P6:** Zero permission rows for user 16 with Delete, Export or Notify enabled.

These were normal authenticated API/browser writes, not mocked responses.
`responses.json`, `saved-rate.json` and `trip-proof.json` record the results.

## Z1–Z4

- Users **6 → 6**. Grant restoration itself changed no user row. Normal sign-in
  subsequently updated only user 16's `last_login_at`; no password was reset.
- Permission rows **366 → 371**. Only user 16's seven listed rows changed.
- All real users and all their permission rows remain byte-identical, verified
  by full-row SHA-256 checksums. Before/after checksums are in `permissions.json`
  and `final-integrity.json`.
- Full suite: **4,631 passed, exact 48 baseline failures, 3 skipped**. No new
  failures, missing baseline files or setup failures. No test cases added;
  separate maintenance checks proved wrong-database refusal before writes and
  an idempotent rerun with zero changed rows. See `tests.json`,
  `maintenance-checks.json` and `build.log`.
- Build passed, exit **0**.
- Disposable project/BOQ item/trip ID **1900000000**, arrangements
  **11, 12, 44, 45, 46** created across verification attempts,
  their audit records, login sessions and newly approved verification devices
  were removed. Explicit remaining-fixture counts are all **zero**.
  Chromium was stopped and its temporary profile removed. Pre-existing test
  records were not deleted. Shared serial sequences were not rewound.

## Durability and limits

`node scripts/dev-verification-grants.mjs` restores these grants. The existing
account-maintenance script also calls it. It refuses the wrong database,
missing/unexpected account identity, or privileged flags; it does not create a
duplicate account or become an automatic app-startup hook. After a database
reset, restore the existing verification account before restoring its grants.

No publishing or production access occurred. A genuine Publish preview is not
available through the exposed controls; it is not replaced with a settings
screen or fabricated preview. VB-ARRANGE-02B was not started.
