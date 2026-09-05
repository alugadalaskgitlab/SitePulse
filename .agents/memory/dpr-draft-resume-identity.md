---
name: DPR draft resume identity
description: Canonical selection and safe browser recovery when active DPR drafts overlap for one site and date.
---

When multiple active drafts exist for the same site and date, treat the highest server DPR ID as the canonical draft to resume.

**Why:** Detailed and Field entry paths have historically produced duplicate active drafts. An earlier draft can be empty while a later one contains saved progress, equipment, and labour, so database tie order can make valid work appear lost.

**How to apply:** Every list, route builder, and server-side “reuse existing draft” path must resolve duplicate active drafts with the same newest-ID rule. Do not silently merge child rows without a dedicated reconciliation workflow.

Browser recovery for an existing server draft must prove that its local snapshot was established only after that server draft finished hydrating; matching only the draft ID and database revision is insufficient.

**Why:** A premature empty browser snapshot can carry the current server revision and overwrite correctly hydrated child rows when restored.

**How to apply:** Stamp post-hydration recovery state and require the stamp together with server ID and revision. Preserve the stamp for later deliberate local edits, including intentional row deletions.