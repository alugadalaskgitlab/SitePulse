# VB-ARRANGE-02B

## Delivered scope

Arrangement declarations explicitly select full service / transport only and
per trip / per cum / per MT / per km. No basis is inferred from either rate
store. The arrangement screen displays the declaration alongside the rates.
Per-trip matching is exact quantity + recorded UOM. Per-cum pricing converts
CFT using division by 35.3147. MT, km, missing declarations and missing sizes
remain visibly unpriced with a reason.

The owner-confirmed conflict rule is implemented: a same-party landed-material
row remains visible and unpriced, naming both its included delivery and the
transport-only arrangement. No second haulage row is added.

Read all four required precedents before implementation:

1. `transportPricingSchema` and hire-statement frozen contract facts:
   new `arrangementPricingSchema` / `arrangement_pricing` JSONB freezes the
   arrangement, declared terms, trip ID, exact recorded size/UOM, applied rate,
   billing quantity/unit and any review reason. Reads use the saved snapshot.
2. `vendorBillAutoSourceIdentity`: extended its qualified source list with
   `site_material_trip_arrangement`; retained individual trip identities.
3. `assertVendorBillAutoSources`: re-derives and validates the candidate and
   pricing facts; stored snapshots cannot be rewritten from current terms.
4. `vendorBillTripCandidate`: accepts arrangement facts supplied by storage;
   shared code performs no database lookups.

The existing duplicate checker and advisory-lock transaction guard now also
recognise arrangement-versus-material/transport conflicts. The lock is shared
by roles of the same physical trip. It remains alias-aware and handles source
case differences. Snapshot sources are locked during the save transaction.
No second billing, duplicate-detection or grouping subsystem was introduced.

## Files / migration

- `migrations/0045_arrangement_billing.sql`: two nullable JSONB columns,
  `earthwork_arrangements.billing_terms` and
  `vendor_bill_items.arrangement_pricing`. ADD COLUMN only; no default,
  backfill, UPDATE or historical repricing. Applied to both verified development
  targets (`sitelog_dev`, `heliumdb`), not production.
- `shared/vendorBillArrangement.ts`, `shared/vendorBillArrangementValidation.ts`:
  declarations, snapshots, pure pricing, source conflicts and save validation.
- Existing schema, execution-state material-field registry, planning summary,
  candidate builder/grouping, both qualified source identity helpers.
- `server/routes.ts`, `server/storage.ts`: declaration save/read wiring,
  candidates, authoritative save validation, snapshot persistence and duplicate
  protection, using existing guards and transactions.
- Arrangement editor and bill screen; transport-working display and existing
  bill-page projection also show saved arrangement facts.
- `tests/vendorBillArrangement.test.ts`; development verification/integrity
  scripts and evidence in this directory; project memory records the owner's
  conflict decision.

## Signed-in evidence and arithmetic

Used DEV-ACCT-02 account 16 through normal login and ordinary permissions.
No account creation, password reset, grant change, bypass or real-record edit.
Temporary device approval only.

| Proof | Result |
|---|---|
| P1 | Activity GET **200**; bill POST **201**. 300 CFT: 1 × ₹1,000 = ₹1,000; 600 CFT: 2 × ₹1,250 = ₹2,500; 800 CFT: 1 × ₹1,500 = ₹1,500; 1000 CFT: 1 × ₹1,750 = ₹1,750. Total **₹6,750**, with four displayed size groups and no separate material/transport rows. |
| P2 | 700 CFT shown with rate 0 and an exact-size-match reason. Saved review bill **201**, reopened **200**. |
| P3 | Undeclared arrangement retains both rate stores but produces rate 0 and a visible undeclared-basis reason. |
| P4 | Before/after API **200**: transport becomes arrangement work; a different seller's material response remains identical. Then same-party conflict retains material at 0 and names both competing charges. |
| P5 | 600 / 35.3147 = **16.99009194471424 cum**; × ₹100 = **₹1,699.009194471424**, displayed **₹1,699.01**. See the exact snapshot numbers in JSON rather than rounded display text. |
| P6 | MT and km arrangement rows visibly unpriced. Existing transport helper regression: 25 km × 2 × ₹10 = **₹500**, unchanged. This unchanged-card proof is an automated arithmetic test, not a separate signed-in existing-card screenshot. |
| P7 | Re-pull duplicate preflight **200** identifies all five saved trip identities for exclusion. Reposting arrangement rows using uppercase source strings: **409**. Direct transport-source submission for an arrangement trip: **400**. |
| P8 | Change only disposable arrangement's 600 CFT rate to ₹9,999; saved bill GET **200** retains ₹1,250 and ₹6,750 total. Reopen in the UI and click Update Bill: **200**, preserving the snapshots and total. |

Screenshots: `P1-P8-frozen.jpg`, `P3-P6-review.jpg`, `signed-in-bills.jpg`.
Detailed status/body evidence is in the P1–P8 JSON files and
`browser-responses.json`. Grouping is presentation-only: one stored item and
source identity per trip, so grouping never loses duplicate protection.

## Integrity, tests and cleanup

Before/after checksums cover all pre-existing fields in:
45 bills, 172 bill items, 5 arrangements, 10 material trips, 199 progress entries,
and 9 vendor rate cards. All match. New nullable columns are excluded from
the old-row comparison; none of the pre-existing rows was backfilled.
Approval and payment fields within bill rows are included in those hashes.
No approval/payment transition, historical-rate update or production access
was performed.

Full-suite comparison and build results are recorded in `tests.json` and
`build.log`. Combined verified result: **4,663 passed, the same 48 baseline
failures, 3 skipped, 342 files; no new remaining failures or setup skips.**
The full run encountered two setup timeouts, two other timeout failures and
one stale source-text assertion. That assertion now checks the case-insensitive
SQL guard; the six-file single-worker rerun passed all 75 tests. The first full
run before the last hardening changes also had exactly the 48 baseline failures.
After the final case-normalization hardening, 29 focused tests passed, the
signed-in save/update harness passed again (including a **409** refusal of
case-changed snapshot tampering), and build passed again.
The optional standalone TypeScript check timed out and is not
claimed as passing.

Fifteen added tests cover size-group arithmetic and identities,
missing/exact rates, undeclared terms, supported volume conversion,
unsupported MT/km, same-party conflict retention, different seller preservation,
cross-role duplicate identities, frozen snapshots/tampering and unchanged
transport arithmetic. The final signed-in run also proves case-insensitive
duplicate refusal and a real UI update of the frozen bill.

All disposable arrangements 1900000401–1900000406 and trips
1900000501–1900000511 were removed, along with every proof bill/item and session
created by the harness. Proof bill IDs were 47–49 across reruns; the final
run's exact IDs and device cleanup are in `removed.json`. Devices 180–185
were created and removed across attempts. Account 16 was retained unchanged
apart from normal sign-in/session activity. No temporary vendor account or
rate-card record was created.

The notification sender was temporarily fenced only for New Vendor Bill
payloads containing the uniquely disposable vendor name, then restored in
`finally`. No test delivery reached a real device. No account/subscription or
notification permission was changed.

## Choices / limitations

- Arrangement work uses the existing “other” bill category, with its own
  qualified source identity; no transport-card or GST-rate inference.
- Unresolved rows cannot be repriced through bulk/vendor rate cards. The
  owner resolves the arrangement/conflict rather than accidentally applying
  a standing landed or kilometre rate.
- Stored items stay per-trip; the existing grouping helper presents size groups.
- No per-MT or arrangement per-km pricing, production changes or publishing.
- P6's existing per-km UI screenshot could not be supplied: development has
  only one transport card and its kilometre fields are all NULL. No card was
  created or changed to manufacture that proof. The unchanged arithmetic was
  instead exercised directly by the automated transport-helper regression.
- GitHub push was attempted but rejected with “Invalid username or token.”
  No credentials or GitHub integration settings were changed.
- Genuine Publish schema preview obtained: exactly the two ADD COLUMN statements
  below, no removals, truncations, data-loss flag, compatibility flag or warnings.
  Nothing was published or applied to production. Full response:
  `publish-preview.json`.

```sql
ALTER TABLE "vendor_bill_items" ADD COLUMN "arrangement_pricing" jsonb;
ALTER TABLE "earthwork_arrangements" ADD COLUMN "billing_terms" jsonb;
```
