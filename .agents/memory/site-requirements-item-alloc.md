---
name: Site Requirements item-level allocation
description: How per-item allocation statuses work in the Site Requirements Queue — schema extension, backend, and frontend patterns.
---

## Rule
The `allocationStatus` jsonb column in `site_requirements` is extended with four item-level arrays alongside the old section-level keys. Old records continue to display section-level badges as fallback.

## Extended jsonb shape
```json
{
  "materials": "arranged",        // section-level (backward compat)
  "materialsRemark": "...",
  "materialItems": [              // NEW item-level
    { "index": 0, "status": "expected_at_site", "expectedBy": "10:30 AM", "remarks": "...", "updatedBy": "John PM", "updatedAt": "2026-07-14T08:00:00Z" }
  ],
  "equipmentItems": [...],
  "labourItems": [...],
  "immediateItems": [...]
}
```

## Backend
- `updateSiteRequirementItemStatus(id, category, itemIndex, data)` in storage.ts: read-modify-write; upserts the item by `index` field inside the appropriate array key.
- Route: `PATCH /api/site-requirements/:id/item-status` — `admin`/`manager` only. Body: `{ category, itemIndex, status, expectedBy?, remarks? }`.

## Category → array key mapping
| category   | array key      |
|------------|----------------|
| materials  | materialItems  |
| equipment  | equipmentItems |
| labour     | labourItems    |
| immediate  | immediateItems |

## Frontend — SiteRequirementsList.tsx
- `getItemAlloc(allocationStatus, category, index)` — looks up the right array, finds item by `item.index`.
- `ItemEditPanel` — inline form with status dropdown (options vary by category), optional `expectedBy` text input (shown only for `expected_at_site`/`expected_by_time` statuses), remarks input.
- Per-item "Update" buttons visible only when `canUpdateMaterials` / `canUpdateEquipment` / `canUpdateLabour` / `canUpdateImmediate` is true (computed from `user.role` + `sectionVisible()`).
- `isManager` is computed as `(user as any)?.role === "admin" || ... === "manager"` — NOT from auth-context's `isManager` property (which is always true for non-admin).

## Frontend — FieldHome.tsx ReadinessSection
- Helpers: `getItemAllocFH`, `ItemAllocBadgeFH`, `hasItemLevelAllocFH`.
- "Stores / Equipment / PM Status" panel shows per-item statuses with `expectedBy` timestamp.
- Fallback: if `allocationStatus.materialItems` is empty but `allocationStatus.materials` is set, shows section-level `AllocBadge`.

**Why:** Site engineers need to see "Gravel — Expected at site by 10:30 AM" per item, not just "Materials — Arranged" overall. Stores/Equipment/PM update their own domain items independently.
