---
name: Equipment performance integrity
description: Non-obvious attribution, deduplication, access, review, and utilization rules for fleet performance reporting.
---

An equipment event belongs to an active project only through an explicit live DPR link. A site-access filter limits what a viewer may see, but never becomes evidence that a machine or usage belongs to a project.

**Why:** Machine name, date, site text, and meter similarity are not reliable identities and can silently mix project histories.

**How to apply:** Resolve DPR logs and canonical usages through their stored IDs. A canonical usage replaces a DPR log only when the log's explicit usage link is valid; missing or invalid links leave the DPR log independent.

Historical Equipment Master attribution is review-first. Only owners/admins may confirm or correct an unlinked historical identity, and a canonically linked log is immutable through this review workflow.

**Why:** Attribution changes affect audit history and deduplication; a linked source pair already has a canonical identity.

**How to apply:** Suggestions may assist review but never write automatically. Scope candidate lists to what the viewer may see. Attach breakdown notes only through exact source-type and source-record links.

Hired utilization exists only when both real hire-window bounds exist. Owned equipment reports time since last use and is never labeled idle. Project history starts at the first attributed event even when the current display window is narrower.

**Why:** Missing hire dates and filtered event windows otherwise fabricate commercial or operational conclusions.

**How to apply:** Return unavailable utilization/gap metrics plus a data-quality warning for incomplete hire windows; preserve the unfiltered earliest project event separately from filtered totals.