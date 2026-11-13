# TRIAL-01 — Vendor bill safety

## Read-only development check and stop

I confirmed the target was `sitelog_dev`. No application code, schema, or database data was changed. I stopped before implementation because the supplied examples conflict with the possible-double rule; I did not infer an additional matching rule.

### Development counts

- Vendor bills checked: 58.
- Paid bills with no recorded paid amount: 20.
- Possible-double pairs under the stated rule: 0.

The stated rule flags non-voided bills only when the vendor is the same and either the invoice number matches ignoring case and spaces, or the gross amount matches and bill dates are within seven days.

| Expected pair | Vendor IDs | Gross amounts | Bill dates | Why it does not match |
| --- | --- | --- | --- | --- |
| HLC/VB/2026/0017 and HLC/VB/2026/0021 | 2 and 2 | ₹12,000.00 and ₹6,701.885 | 1 Jun 2026 and 4 May 2026 | Invoice numbers differ; amounts differ; dates are more than seven days apart. |
| HLC/VB/2026/0028 and HLC/VB/2026/0029 | 2 and 2 | ₹15,389.41 and ₹132,000.00 | 13 May 2026 and 13 May 2026 | Invoice numbers differ and gross amounts differ. |

The names for the first pair are `NARASIMHULU JCB PLANNT` and `NARASIMHULU JCB PLANT`; the second pair is `NARASIMHULU JCB PLANNT` and `NARASIMHULU`. All four records have the same Vendor Master ID, so vendor identity is not the reason they fail the rule.

### Snapshot check

I compared the requested bill fingerprint (`id`, status, gross, net payable, paid amount) before and after the read-only inspection: **0 bills changed** (58 compared).

At the end of Part A I stopped before implementation. The continuation below follows the clarification that the two example pairs are not supposed to match; no extra matching condition was added.

## Part B — Safety controls

- Approved and paid bills can no longer be edited. The screen hides Edit and shows: “This bill is approved/paid. Use Reopen (Owner) or the Owner correction buttons.” Verified edits still return to draft and keep the `status_reset` audit entry.
- Owners can reopen an approved or paid bill as draft after entering a reason. Backward status changes are Owner-only and require a reason. Reopening changes only status and adds a before/after audit entry; saved amounts, payment details, settlements and linked hire statements stay unchanged.
- Saving a bill checks only the stated possible-double rules: same vendor identity, plus either the same invoice number ignoring case/spaces or the same gross amount within seven days. The warning allows Save anyway or Cancel. List badges identify the other bill. The existing per-item duplicate check was left unchanged.
- Added the “Paid, amount missing” filter and the “Paid amount not recorded” line; no amount is filled automatically.

### Development data checks

- Database: `sitelog_dev`; 58 bills and 411 bill lines.
- Possible-double pairs: 0.
- Paid bills with no recorded amount: 20.
- Existing per-item duplicate check: HLC/VB/2026/0017 and HLC/VB/2026/0021 — 0 items flagged between the pair.
- Existing per-item duplicate check: HLC/VB/2026/0028 and HLC/VB/2026/0029 — 0 items flagged between the pair.
- Before/after fingerprint (`id`, status, gross, net payable, paid amount): **0 bills changed** (58 compared).

### Verification

- Focused bill-safety and export tests: 120 passed; permission route test: 17 passed.
- Full suite: 5,726 passed, 8 failed, 3 skipped (460 test files). The only failures are the 8 already known: `arrangementProcurementCorrection` (1), `materialReceiptReversal06mD` (1), `purchase-indent-pi01` (1), `unscheduledReportCredit` (3), `vendorBillVb15Server` (1), and `dpr314Correction` (1). No new failures remained. The outdated approved/paid edit assertions were changed to expect the requested lock; the monthly selection mock now handles the added pre-save check.
- `npm run build`: passed.
- No schema, data, startup, or Tally changes. No production database was accessed and nothing was published.
