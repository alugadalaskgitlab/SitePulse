---
name: Tank alert storage
description: Why tank reminders use their own delivery table instead of the existing order notification store.
---

Keep tank reminder/alert tracking separate from supply-order deliveries; do not relabel tank messages as order alerts or weaken the order-only constraint.

**Why:** The native order-delivery CHECK was absent from the Drizzle declaration, so an incomplete fixture falsely accepted tank alert types. The Owner approved one separate ADD-only tracking table, with no changes to existing tables or startup writes.

**How to apply:** Preserve native constraints in persistence fixtures and verify actual development constraints before reusing an existing store for new notification categories. New tracking storage is not permission to change operational records.
