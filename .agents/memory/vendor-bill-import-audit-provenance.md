---
name: Vendor-bill import audit provenance
description: Distinguishes business lifecycle audit events from restoring historical vendor-bill snapshots.
---

Snapshot import restores existing vendor-bill history; it is not a new business creation or edit by the importing administrator. Preserve the source bill's author and timestamps without recording a new "created" audit event for the import.

**Why:** attributing historical bills to the import actor would fabricate audit history. Lifecycle audit events should represent actual business actions.

**How to apply:** When adding vendor-bill lifecycle fields, preserve them through snapshot import/export. Write event audit records for authenticated create, edit, payment, status, void, and delete actions; do not synthesize events for historical snapshot restoration.
