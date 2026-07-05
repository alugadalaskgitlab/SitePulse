---
name: Sticky thead cross-browser bug
description: position:sticky headers in scrollable tables break unless the wrapper is an explicit-height overflow-auto scroll container using top-0; per-th vs per-thead alone is not the fix.
---

Two distinct issues can break sticky table headers; both must be fixed together, not just one:

1. `position: sticky` set directly on a `<thead>` element (rather than on each `<th>`) is unreliable across browsers — some fail to clip body rows underneath it, causing a data row to visually bleed through/overlap the header.
2. **(The actual root cause of a real recurring bug in SiteLog.)** Wrapping the table in a plain `overflow-x-auto` div (no explicit height) and using a `top-<page-nav-offset>` value (e.g. `top-14`) assuming page-level scroll does NOT create a working sticky context. Setting `overflow-x: auto` with no declared `overflow-y` forces the browser to treat `overflow-y` as `auto` too, making that div the "nearest scrolling ancestor" for `position: sticky`. But since the div has no max-height, it never actually scrolls internally — it just grows to fit content — so the sticky offset is computed against an effectively static container and the header never really sticks as the page scrolls. Data rows keep bleeding above/through the header even after switching from thead-level to per-th sticky, because the container itself was still wrong.

**Why:** SiteLog's Work Programme tables (Monthly Plan, Procurement shortage-check, Plan vs Actual) originally set sticky on `<thead>` with `top-14` inside an `overflow-x-auto`-only wrapper. Fixing only the thead→per-th part did not resolve the user-visible bug; the wrapper/offset mismatch was the real cause.

**How to apply:** Use the pattern already proven working elsewhere in SiteLog's WorkDemand.tsx (Materials/Equipment/Labour tables):
- Wrapper: `overflow-auto rounded-xl border max-h-[70vh]` (explicit height so the div is a *real* internal scroll container).
- Every `<th>`: `sticky top-0 z-20` (first/left-frozen column additionally `left-0` with a higher z-index, e.g. z-30).
- Never combine an `overflow-x-auto`-only wrapper (no max-height) with a `top-<page-offset>` value — that combination looks plausible but silently doesn't stick.
- If there's a secondary sticky row below the header (e.g. a category band), its `top` offset must equal the header row's own rendered height (since it now stacks inside the same `max-h` container, not relative to the page), not a page-nav-derived value.
