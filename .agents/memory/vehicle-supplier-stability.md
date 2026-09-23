---
name: Vehicle supplier stability
description: Stable vehicle identity is separate from historical trip supplier facts.
---

A vehicle has one standing supplier across sites. Historical trip supplier fields remain facts, not instructions to replace the standing association.

**Why:** The user explicitly rejected latest-trip inference. Old conflicting suppliers remain in history even after an authorised correction, so persisted corrections must take precedence over historical conflict detection.

**How to apply:** Seed only from complete active history, never a bounded suggestion sample. Couple first-save seeding and correction audit to their database transactions. For inferred associations without a version, compare the displayed supplier as well as the version during correction.

The minimal association uses protected namespaced application settings rather than new schema.

**Why:** This avoids a deployment schema change for a small mapping; the tradeoff is serialized writes to the shared mapping. Any future migration must retain normalization uniqueness, transaction guarantees, and site-scoped discovery.

Do not attribute the historical bulk material-source persistence report to an audit transaction ID of zero.

**Why:** Real isolated PostgreSQL runs of both the pre-fix and current builds committed the full reported-size fixture and returned it on a fresh GET. Zero was accepted by the database; it affected per-trip audit visibility, not persistence. The historical failure remains unreproduced. A separately proven zero-match false-success defect does not establish the original cause without the original response/matched count.

**How to apply:** Keep persistence, per-trip history, and zero-match feedback claims separate. Use real PostgreSQL evidence and explicitly state remaining uncertainty; do not label synthetic UI screenshots as persistence proof.