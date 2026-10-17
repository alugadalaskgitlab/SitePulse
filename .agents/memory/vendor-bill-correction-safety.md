---
name: Vendor-bill correction safety
description: Guardrails for production vendor-bill corrections, migrations, and publishing.
---

For vendor-bill scope and payment correction work, treat existing records as financial evidence. Keep legacy unknown scope unconfirmed until an explicit reviewed correction. Do not backfill or automatically repair production bills, add permission keys, reset sequences, modify production data, or publish without user review. Preserve calculations, statuses, snapshots, payment records, permissions, users, and site access.

**Why:** The user requires review before production changes or publishing and wants financial history preserved.

**How to apply:** Use read-only production queries for baseline checks. Keep schema additions nullable and without automatic backfills; expose changes through individually audited corrections only after review.
