---
name: Vendor master identity boundaries
description: Review-first identity must remain separate from legacy vendor-name matching.
---

Vendor identity is an additive, explicitly reviewed association, not a replacement for name-based billing and rate matching.

**Why:** The user deliberately deferred migrating matching to IDs. Silently linking names or changing matching while adding structured vendor details would bypass that decision.

**How to apply:** Keep free-text names functional. A subsequent name change must invalidate its reviewed association, independently for transporter and material-source roles. Do not treat alias suggestions as confirmed identity.

The initial identity scope is bill headers, rate cards, PI items and the two trip roles; standalone equipment and bill-item identities were not authorized additions.

**Why:** The requested schema scope explicitly limited the linked tables. Equipment activity in the initial master summary comes from linked bills, not a complete equipment-history migration.

**How to apply:** Flag standalone equipment identity as separate scope rather than silently adding more FKs or inferred links.