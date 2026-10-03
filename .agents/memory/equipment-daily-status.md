---
name: Explicit equipment daily status
description: Daily status is operational evidence, independent of maintenance and financial deductions.
---

Explicit Working, Idle (no work/operator), and Breakdown are additional daily facts, not replacements for entry type or maintenance events.

**Why:** The user deliberately deferred maintenance integration. A selected Breakdown status must never create a maintenance record or change vendor hire deductions.

**How to apply:** Preserve status/reason through clone and source-link projections and retain status-only rows. Keep legacy nulls compatible; records without explicit status belong to Logged — No Status, never inferred Idle or Working. Reserve Not Logged strictly for days with no records.

DPR entry saves require a reason for Breakdown, with the exact message “Enter the breakdown reason”. Leave the existing Idle — No Work requirement and other statuses unchanged. Do not re-check or block old submitted DPRs that are only opened, not edited. Do not extend this DPR-only change to standalone plant usage.

**Why:** The user explicitly approved this as a second deliberate mandatory-rule change while requiring historical reads and other status behavior to remain unchanged.

**How to apply:** Enforce the new requirement in editable DPR validation and write paths, not read-only report loading or historical migrations.

**Why:** Combining real legacy logs with missing days hides activity in summary totals; a cosmetic legacy badge alone is insufficient.

Idle defaults fill blank targets only, remain editable, and never confirm a physical tank measurement.

**Why:** Existing entered readings/fuel are evidence; overwriting them or auto-confirming a dip would fabricate operational facts. Diesel issued is a flow, so its idle default is zero, not the opening tank balance.

**How to apply:** Apply defaults after late continuity only while targets remain untouched; Breakdown has no zero-run assumption. Reuse the existing site-scoped strict-before closing resolver rather than introducing another continuity engine.