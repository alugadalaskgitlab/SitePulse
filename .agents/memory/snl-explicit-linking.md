---
name: SNL explicit linking
description: User-confirmation boundary for BOQ-to-SNL mappings and recipe writes.
---

**Rule:** Background startup and post-import matching may save review suggestions for unlinked items, but only explicit Re-link or Map to Norm actions may confirm mappings or write recipes.

**Why:** Automatic matching can silently change a BOQ item's norm and downstream resource demand; the owner requires a user action before a suggestion becomes authoritative.

**How to apply:** Keep startup/import paths suggestions-only and pending review. Keep actual mapping and recipe writes behind the user-driven mapping flows.

**Rule:** A confirmed wording memory ignores changing chainage, quantities, and item/Sl. No. prefixes, but stores the exact selected MoRTH item, including its leaf sub-case. Ambiguous memories remain choices; they never auto-confirm.

**Why:** The same work recurs across projects with different BOQ numbering and chainage, while distinct workbook sub-cases can have different resource norms.

**How to apply:** Normalize BOQ wording for lookup, persist the exact SNL item only after a user confirms Map to Norm or Re-link, and keep the remembered-link list removable without changing existing recipes or mappings.
