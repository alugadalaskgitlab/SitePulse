---
name: SNL explicit linking
description: User-confirmation boundary for BOQ-to-SNL mappings and recipe writes.
---

**Rule:** Background startup and post-import matching may save review suggestions for unlinked items, but only explicit Re-link or Map to Norm actions may confirm mappings or write recipes.

**Why:** Automatic matching can silently change a BOQ item's norm and downstream resource demand; the owner requires a user action before a suggestion becomes authoritative.

**How to apply:** Keep startup/import paths suggestions-only and pending review. Keep actual mapping and recipe writes behind the user-driven mapping flows.
