# TRIAL-02 — Part B

Development only. No production access, publishing, schema change, migration, or document creation was performed.

## What changed

- Company identity now comes from company settings for screen labels, guides, receipt slips, and vendor-bill PDFs. Full legal names are used in formal headings; short names are used in compact labels. Unconfigured copy uses neutral text, and missing plant names use the existing “Main Plant” fallback. Saved record names and stored enums/API values were left alone.
- New vendor-bill, purchase-indent, and internal-requisition numbers use the configured company short name. The HLC formatting and sequence behavior remain covered by tests. Existing numbers were not rewritten.
- Added an Admin/Owner own-company-party selector backed by the existing `app_settings` table. Operational own-party lookups use the selected party; when unset, the legacy HLC resolver remains available for the existing High Lane installation. The Vendor Master self-vendor guard checks the selected party and configured identity; its legacy HLC-name rule applies only when the short name is `HLC`.
- Tally readiness now requires a Tally company name and uses the exact message “Set the Tally company name in Tally settings first.” The preview displays the configured Tally company. Voucher/XML generation was not changed.
- The one-time ledger-gap-427 route is limited to an installation whose short name is exactly `HLC`. Existing historical repair functions were not changed.
- Added a default plant-name setting for new records, blank values, and examples only. Existing plant names are preserved.

## Settings and generated-number check

The development database reports `current_database() = sitelog_dev`. Its saved identity is:

- Legal company name: `High Lane Constructions Pvt Ltd`
- Company short name: **`HLCPL`**, not `HLC`
- Own-company party setting: unset; the effective legacy lookup resolves party 1, `HIGH LANE CONSTRUCTIONS`
- Default plant setting: unset; effective fallback is `Main Plant`
- Tally company: `High Lane Constructions Pvt Ltd - SK 2025-26`

This differs from the instruction’s assumption that the installed short name is `HLC`. No setting was permanently changed to hide that mismatch. With the actual `HLCPL` setting, the next new numbers would use `HLCPL` and start that prefix’s sequence at `0001`; the previous HLC sequence would have continued at VB `0066`, PI `0003` for site 19 / `0005` for HMP Plant, and IRN sequence `0009`. No numbers were generated. Please resolve the HLC/HLCPL setting before relying on the new prefixes.

When the identity is configured as `HLC`, the label and numbering tests preserve the existing HLC output. Because `sitelog_dev` is actually configured as `HLCPL`, I cannot confirm that the current installation’s future output remains unchanged until that setting is reconciled.

For the requested temporary test, the short name was set to `ABC` and `/api/config` returned `companyShortName: ABC`; it was then restored to `HLCPL` with its original `updated_at` timestamp (`2026-11-03 11:31:25.364723`). No other setting was changed. The shared formatter test covers stock, procurement, requirements, receipts, and bill labels. Receipt-slip and equipment-bill PDF tests also cover configured company names. A signed-in screenshot was not captured because the preview browser is at the login page; authentication was not bypassed.

The five checked display surfaces are Plant Stock (“Borrow from ABC”), Work Demand (“Issue from ABC stock”), Site Requirements (“ABC / Internally Arranged”), the material-receipt slip PDF (“ABC · Material Receipt”), and the equipment-hire bill PDF (“Prepared · ABC”). Screen labels are covered through the shared formatter; both PDF outputs are tested.

`stock_ledger` has no `plant_name` column, so there were no ledger plant-name values to compare.

## Read-only data comparison

Before/after snapshots on `sitelog_dev` match exactly for all checked records:

| Table | Rows | Result |
|---|---:|---|
| vendor_bills | 58 | Same fingerprint |
| vendor_bill_items | 411 | Same fingerprint |
| purchase_indents | 9 | Same fingerprint |
| purchase_indent_items | 9 | Same fingerprint |
| internal_requisitions | 8 | Same fingerprint |
| internal_requisition_items | 8 | Same fingerprint |
| parties | 10 | Same fingerprint |
| stock_ledger | 848 | Same fingerprint |

Company name and short name were restored unchanged; the own-party and default-plant settings remain unset. The Tally company configuration is unchanged. No production database was queried.

## Verification

- Focused company-identity, own-party, Tally, receipt, and bill tests: **84 passed** across 8 files. The alternate-company PI-prefix test, the explicit DPR diesel-submit regression test, and UX-FIX-01 frontend tests (**12 passed**) also passed.
- Full suite: pending final run.
- `npm run build`: passed.
- Schema check: `shared/schema.ts` is unchanged; no migration or schema file was added.
