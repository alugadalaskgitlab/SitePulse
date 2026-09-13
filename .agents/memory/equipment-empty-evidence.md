---
name: Empty equipment versus operational evidence
description: Conservative equipment placeholder handling and clone source alignment
---
No Site Work is never grounds to remove equipment records. Determine meaningfulness from identity and operational evidence, including separately loaded child allocations and breakdowns.

**Why:** A blank historical row caused false identification alerts, but filtering bare parents can also hide genuine child-only evidence. Default Operating, zero issued diesel and placeholder operators are not evidence; explicitly recorded zero meters and timestamps are.

**How to apply:** Use the common evidence rule across editors, persistence, identification and reports. Avoid timestamp-prefilling untouched blank rows. When filtering clone inputs, retain source/input pairs throughout child reconciliation and materialization so skipped placeholders never shift another machine's history.

Legacy auto-prefill-only start timestamps need separate read visibility and write retention.

**Why:** Older blank forms saved an automatic start time. Such rows otherwise reproduce phantom identification alerts, but the timestamp's origin cannot be conclusively recovered.

**How to apply:** Suppress the default-only start-without-end shape in report visibility when no identity, observations, non-default details or children exist. Retain its stored timestamp for editing/audit; never bulk-delete ambiguous historical rows.