---
name: Material source billing identity
description: One physical trip can support separate source-material and transporter liabilities.
---

Treat a trip's material seller and transporter as independent commercial roles when they are different parties. When the same party supplies and delivers, retain ONE landed material rate and no separate transport row. Own-fleet haulage produces no vendor-billable transport line.

HLC can hold the rights to its own borrow area and hire a vendor only to excavate
and haul. HLC owns that material; nobody sold it to HLC. Royalty is in HLC's
scope, paid by R&B directly to Mines. HLC must never be represented as a vendor,
or as a self/own placeholder in vendor columns.

**Why:** The owner explicitly distinguishes own-source material from purchases;
a self vendor would create bogus self-billing and a party ledger in Tally.

**How to apply:** Record commercial origin independently of transport and
physical receipt. Own-source material creates no material-seller liability.
Do not infer this origin for historical trips. Arrangement-work pricing is
separate, not authorised by the origin-recording change.

**Why:** The owner explicitly settled these commercial rules. A global trip-consumed flag would block a legitimate separate-party liability, while splitting same-party delivery would contradict the landed-rate rule.

**How to apply:** Keep role-qualified identity in existing bill source metadata and apply vendor/alias-aware duplicate protection per role. Never derive the material seller from vehicle associations. Bulk source assignments must remain site-scoped, filtered, audited and atomic.

Do not backfill, infer, default, rewrite, or automatically correct historical trip roles. The owner is correcting historical trips by hand. Unresolved stored roles remain unresolved until explicitly chosen and saved; already-saved bills stay untouched.

**Why:** The owner expressly prohibited automated historical correction.

**How to apply:** New same-party trips explicitly store the chosen vendor in both role columns; a blank transporter never means "same party". Existing ambiguous records must display their stored values and a roles-not-confirmed warning without preselecting a role.

Site-trip transport pricing must match the vendor and material exactly through the existing rate-card identity mechanism; do not use a sole unrelated vendor card as a default. Ambiguous or missing cards leave the new candidate unpriced.

**Why:** The owner explicitly disallowed nearby/default/most-recent material or transport rates for this flow, while requiring already-saved pricing snapshots to remain frozen.

**How to apply:** Keep this stricter rule specific to new site-trip transport candidates; do not redesign rate-card setup or retroactively reprice bills. Unresolved trips must be offered unchecked and corrected on the trip before billing.

Automatic source billing conversion reuses the existing rate-card conversion contract without modifying physical trip quantities.

**Why:** Source vendors may charge per trip while delivery records remain in CFT. Rate-card ambiguity is not permission to guess a price.

**How to apply:** Auto-apply only an unambiguous matching material card; otherwise retain logged quantity/unit and let the user use Set Rates.

Do not infer that a placeholder audit ID caused a bulk assignment rollback.

**Why:** In a reported live assignment failure, read-only SQL confirmed blank source values, but the original implementation committed the exact-sized fixture in real PostgreSQL. The production audit table had only a primary-key constraint, so the suggested ID-zero constraint failure was ruled out. A zero-update response was also misleadingly labelled success, but was not proven to explain the original incident.

**How to apply:** Distinguish reproduced defects from the unresolved live cause. Verify committed rows through a separate query, keep per-trip audit identifiers, and return explicit failure for zero matches or transaction errors rather than claiming live data repair.