---
name: Cross-book SDB fallback
description: Rule for allowing one SNL/SDB sector-book to act as a fallback source for another category
---

`server/snlAutoMapper.ts`'s `BOQ_CATEGORY_SECTORS` / `getSectorMultiplier()`
controls which SDB "sector books" (ROAD, STRUCTURES, BRIDGE, DRAINAGE,
IRRIGATION, MISCELLANEOUS, ELECTRICAL, BUILDING…) are eligible candidates for
a given BOQ work category (road_pavement, pipe_culvert, retaining_wall,
bridge_structure, reinforcement, drainage, road_furniture, electrical_misc,
unknown_misc). Note: the real sector *value* stored for the "SDB
MISCELLANEOUS" source book row is the literal string `MISCELLANEOUS`, not
`MISC` — check `snl_sources`/`snl_items.sector` in the DB rather than
guessing an abbreviation when asked to widen fallback matching to a "misc"
book.

When widening this to let a category borrow from a book it doesn't normally
use (e.g. letting structure-type categories fall back to IRRIGATION-book SDB
items when no road/structure-book match exists):

- Add the new sector ONLY to that category's `secondary` set, never `primary`.
  Secondary matches are penalized (multiplier strictly between 0 and 1, via
  `CROSS_SECTOR_SECONDARY_PENALTY`), so they're only picked when nothing
  better exists.
- Scope it per-category. Categories with no legitimate fallback need (e.g.
  `earthwork`, `road_furniture`, `electrical_misc`) must NOT get the new
  secondary sector — leave their `secondary` set as-is (often empty), so the
  multiplier stays 0 (excluded) for that sector.

**Why:** a blanket global fallback would let wrong-book SDB items (e.g.
irrigation-specific rates) silently outcompete or contaminate matches for
categories that have nothing to do with irrigation, which is much harder to
notice than an explicit unmapped/needs_review item.

**How to apply:** any time a task asks to "widen cross-book matching" for
specific categories, edit only those categories' `secondary` sets in
`BOQ_CATEGORY_SECTORS`, and add a unit test asserting the new sector is
excluded (0 multiplier) for every category that should NOT get the fallback.
