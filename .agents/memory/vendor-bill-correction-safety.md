---
name: Vendor-bill correction safety
description: Guardrails for production vendor-bill corrections, migrations, and publishing.
---

For vendor-bill scope and payment correction work, treat existing records as financial evidence. Keep legacy unknown scope unconfirmed until an explicit reviewed correction. Do not backfill or automatically repair production bills, add permission keys, reset sequences, modify production data, or publish without user review. Preserve calculations, statuses, snapshots, payment records, permissions, users, and site access.

ALPS-like payer text remains unchanged until an authorized admin or owner confirms one bill with a configured third-party account. Keep the original text in audit history; do not bulk-convert or alter amounts, status, or snapshots.

**Why:** The user requires review before production changes or publishing and wants financial history preserved.

**How to apply:** Use read-only production queries for baseline checks. Keep schema additions nullable and without automatic backfills; expose changes through individually audited corrections only after review. Payer reconciliation must be per-bill and use the existing account-source guard.
