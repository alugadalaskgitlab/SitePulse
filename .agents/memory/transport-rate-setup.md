---
name: Transport rate setup compatibility
description: Why the new transport pricing basis must remain separate from legacy flat-rate identity.
---

Transport setup must preserve the existing flat rate, saved unit and item identity. A derived TRIP label is display-only; it must not rewrite an MT/KM/hourly card into a per-trip card.

**Why:** The user approved setup separately from bill-pricing integration. Replacing a legacy flat rate with a derived trip figure before updating its consumers can multiply lead or quantity twice. Existing NULL-basis cards must remain unchanged, and payload 30 is only an editor default, not a database default.

**How to apply:** Pricing consumers must explicitly opt into the saved basis. Keep ordinary bill-to-standing-rate write-back semantics unchanged unless separately authorized; callers omitting basis fields must not clear them. Do not infer approval to implement bill-pricing integration from approval of rate setup.

The user requires basis writes to come only through existing-row rate-card setup. Legacy bill write-back must ignore basis fields even when explicitly supplied as numbers or NULL. Setup must never create a row or normalize a name/key/label.

**Why:** Future Tally ledger mapping depends on stable names and identities. Duplicate-looking rows are review findings, not permission to merge, delete or rename.

**How to apply:** Keep setup update-only with an exact stored identity and a three-column allowlist. Audit saved cards separately from unsaved historical discovery suggestions. Do not change existing naming policies as part of a naming audit.

Transport billing is opt-in when pulling new rows. Persist the row's pricing basis, payload, original card lead and actual carried weight as a frozen snapshot; never derive historical bills from today's rate cards.

**Why:** The user requires old saved amounts to remain unchanged and row-level overrides never to flow back into standing rates. Actual carried MT is independent of the card's rated payload.

**How to apply:** Keep the legacy NULL-snapshot calculation unchanged. Prefer an exact card identity, otherwise use only a single unambiguous configured transport card from the vendor-scoped response. Never infer weight from descriptions or volume. Exclude opted-in lines from legacy rate write-back and bulk flat-rate replacement.