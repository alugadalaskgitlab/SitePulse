---
name: SiteEntry showPreview early-return trap
description: A confirm/warning dialog triggered from handleSubmit in SiteEntry.tsx must be rendered in both the showPreview and main render branches, and cross-entity balance aggregation must match the true planning granularity.
---

`SiteEntry.tsx` has an early-return branch that renders a preview screen before the component's main JSX tree. Any confirm/warning dialog driven by the shared submit handler must be rendered in *both* branches, or it becomes unreachable whenever the user submits from that early-return path.

**Why:** Discovered while adding an over-balance confirmation dialog — it was only present in the main render branch and silently never appeared when submitting via Preview.

**How to apply:** Extract such dialogs into a shared JSX variable and render it in every return path of the component, not just the "normal" one.

## Match aggregation granularity to the planning model

When a value can be planned at a finer granularity than the primary linkage key (e.g. the same catalog/BOQ item planned separately at multiple physical locations), a single project-wide or item-wide aggregate is not sufficient for previous/cumulative/balance calculations — it must be scoped to the actual planned unit, and that scoping key must be persisted on the saved record so future aggregation can find it again.

**Why:** An item-wide balance silently double-counts or misattributes progress across separate planned locations that happen to share the same catalog reference.

**How to apply:** Before computing "previous actual" or "balance" for a linked entry, check whether the planning source can plan the same reference at more than one location/instance — if so, the persisted record must carry that location key, and aggregation must group by (reference + location), not just reference.
