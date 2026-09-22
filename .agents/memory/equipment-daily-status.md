---
name: Explicit equipment daily status
description: Daily status is operational evidence, independent of maintenance and financial deductions.
---

Explicit Working, Idle (no work/operator), and Breakdown are additional daily facts, not replacements for entry type or maintenance events.

**Why:** The user deliberately deferred maintenance integration. A selected Breakdown status must never create a maintenance record or change vendor hire deductions.

**How to apply:** Preserve status/reason through clone and source-link projections and retain status-only rows. Require reasons for explicit non-working states. Keep legacy nulls compatible; the fleet view labels unspecified days Not Logged, with a legacy-record annotation where available, never inferred Idle.

Idle defaults fill blank targets only, remain editable, and never confirm a physical tank measurement.

**Why:** Existing entered readings/fuel are evidence; overwriting them or auto-confirming a dip would fabricate operational facts. Diesel issued is a flow, so its idle default is zero, not the opening tank balance.

**How to apply:** Apply defaults after late continuity only while targets remain untouched; Breakdown has no zero-run assumption. Reuse the existing site-scoped strict-before closing resolver rather than introducing another continuity engine.