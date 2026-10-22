---
name: Vendor master identity boundaries
description: Review-first identity must remain separate from legacy vendor-name matching.
---

Vendor identity is an explicitly reviewed association. Reviewed Vendor Master IDs now govern equipment-owner and trip-party billing identity; unlinked legacy names remain visible and usable where permitted.

**Why:** The user explicitly expanded the scope to reconcile equipment owners, material sellers, transporters and bills to one party identity, without rewriting recorded names or existing financial references.

**How to apply:** Keep free-text names functional and visibly unlinked. A subsequent recorded-name change must invalidate its reviewed association, independently for each role. Do not treat alias or spelling suggestions as confirmed identity.
Keep the Vendor Master review and alias-management flows unchanged unless separately requested.

Historical trip linking must preserve recorded names and registration; use the
explicit role-correction flow only when the operational facts are genuinely wrong.
Opening an already reviewed trip is inspection, not a new confirmation.

**Why:** The user requested one combined trip review without repeated linking or
automatic historical rewrites, while keeping hire terms independent of identity.

**How to apply:** Confirm IDs separately, check both prior IDs and recorded party
names for stale reviews, and never invalidate identity merely because bill terms
or the screen's open/closed state changed.

HLC maintains one Tally creditor ledger per party, regardless of whether it supplies material, owns hired equipment or provides transport.

**Why:** The user stated this business rule while authorising equipment-owner reconciliation.

**How to apply:** Multiple equipment records may share the same Vendor Master. Keep roles separate, never create role-specific duplicate vendors, and do not add Tally exports or expense-ledger rules without a separate instruction.

Link Vendors now includes hired-equipment owners, trip transport/material suppliers, unlinked bills and existing rate-card/bulk-PI references.

**Why:** The user explicitly superseded the earlier bulk-PI-only scope.

**How to apply:** Require Administrator/Owner confirmation and audit evidence. Preserve existing bill-specific references, paid bills, snapshots, operational facts and rates; no automatic uncertain matching, vendor merges or mass backfills.

The owner's vendor master already suffers from duplicate spellings. Do not
leave test vendors behind.

**Why:** The user explicitly identified this existing data-quality problem and
required obviously fake test names plus exact before/after count and checksum
proof when authorizing temporary vendors.

**How to apply:** Obtain authorization for vendor fixtures, label them clearly,
remove every fixture, and prove the master is restored rather than relying
only on successful DELETE responses.