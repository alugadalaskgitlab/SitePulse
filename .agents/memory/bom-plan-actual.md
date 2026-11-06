---
name: BOM plan vs actual source rules
description: Prevent double-counting and misattribution in project material buy/use reports.
---

For project material planning, each BOQ material item has one authoritative `Used` source: bituminous and plant-sourced granular mixes use dispatches split by template; earthwork, direct granular, concrete, and other recipe-based work use DPR quantity × recipe; unclassified items may use store issues only through an exact project/item requirement link. Never combine sources for the same item. Site-only store issues do not establish project attribution.

Plant-common stock (`party_id IS NULL`) is shared across projects. Attribute plant dispatches by destination site and date range, and label them as site-attributed. Site receipts/trips linked to a project are project-attributed; unlinked site receipts/trips are included only for the matching site and labeled `by site`.

Unit conversions between volume and mass use only the material's own delivered density or calculated loose weight. Never borrow a BOQ layer or mix profile for another material's CFT conversion.

**Why:** The project view must not overstate use, purchases, or available stock by combining records that describe the same material movement or by inferring project ownership from site alone.

**How to apply:** Reuse these source and attribution rules for future BOM, material-balance, and buy/use reports; keep source precedence explicit in tests.
