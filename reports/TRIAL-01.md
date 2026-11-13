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

### Work not started

Because the example pairs do not satisfy the stated matching rule, I did not change bill editing, status transitions, the possible-double warning, or the paid-amount filter, and did not run tests or a build. No schema change was made. Clarification is needed on whether another condition should flag either example pair before implementation.
