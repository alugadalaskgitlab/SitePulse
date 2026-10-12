---
name: Read-only startup readiness
description: Preserve customer records by keeping one-time initialization out of server startup
---

Application startup must verify readiness without applying one-time migrations,
seeds, historical repairs, reclassification or permission grants. Missing
prerequisites must fail closed and require an explicitly reviewed migration.

**Why:** The owner requires publication to preserve Production business records.
Several apparently idempotent schema helpers also rewrote data, and a legacy
schema branch could drop a table. A clean publishing diff does not cover these.

**How to apply:** Keep migration implementation separate from automatic startup
and route registration. Do not introduce a restart environment toggle that
reenables all legacy repairs. Preserve runtime permission checks and account
prerequisites instead of silently bypassing them.

The recurring GRN reminder was preserved; it may remove expired push subscriptions.
Do not claim every Production table stays unchanged merely because migration
startup is read-only. External push effects require separate review.

**Why:** Silently disabling operational notifications was not authorized.

**How to apply:** Distinguish protected business records, normal authentication
activity, and external-provider housekeeping in publication-safety reports.

Keep startup fingerprints stricter than authenticated-request fingerprints.
Normal login updates the user's last-login timestamp as well as sessions/devices;
exclude only that timestamp for post-login user comparisons, not the whole users
table or its privilege/password fields.

**Why:** An isolated real-login check initially reported a false business-data
change from ordinary authentication activity. Broadly excluding accounts would
hide unauthorized privilege or password changes.

**How to apply:** Take separate before/after checkpoints for startup and login,
and label the exact authentication-only exceptions.
