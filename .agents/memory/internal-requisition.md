---
name: Internal Material Requisition
description: Planned feature for HLC — an internal requisition slip (MRN) that precedes Purchase Indents and Diesel Requirements, enabling site/plant staff to request materials from the store.
---

# Internal Material Requisition (MRN) Feature

## What the user wants
A "Material Requisition Note" (or internal indent slip) that sits at the TOP of the procurement chain:

```
Field Engineer / Plant Operator / Foreman
  ↓  raises Material Requisition (any section: Site, HMP, Equipment)

Storekeeper reviews:
  • checks available stock qty
  • splits: "Issue from Store" qty + "Balance to Purchase" qty
  • verifies and confirms

  ↓ If stock available → generates Issue Voucher (existing feature)
  ↓ If purchase needed → creates/links Purchase Indent (existing) or Diesel Requirement (existing)

Plant Incharge / Manager → approves Purchase Indent (as today)
Store → receives goods (GRN, existing), issues goods (Issue Voucher, existing)
```

## Key fields for the Requisition
- Item / material requested
- Quantity needed
- Purpose / description
- Raised by (user)
- Raised from (section: Site Ops / HMP / Equipment & Fleet)
- Date
- Store fields (added by storekeeper): available in stock, qty to issue from store, balance to procure, verified by
- Status: Draft → Submitted → Verified → Fulfilled / Partially Fulfilled
- Links: to resulting Purchase Indent(s) or Diesel Requirement(s), and Issue Voucher(s)

## Where it fits in the app
- "Raise Requisition" quick-action appears in: SiteHub, HmpHub, EquipmentHub tiles
- All pending requisitions land in: Stores & Inventory hub (Storekeeper view)
- Approved purchases route to: Procurement & Billing hub (Purchase Indents / Diesel Req)
- Issue from store routes to: Stores Issue Voucher

## Why this matters
Makes the app fully end-to-end: every material movement (bulk and store items) has a traceable trail from request through to receipt or purchase. Currently, Purchase Indents can be raised directly without a store check — the requisition adds the critical "check store first" step.

## Development scope
- New DB table: material_requisitions (+ items table)
- New screens: Raise Requisition form (in 3 hubs), Storekeeper verification screen, Requisition list/history
- Updates to: Purchase Indents (add source requisition link), Diesel Requirements (add source link), Issue Vouchers (add source link)
- This is a medium-large feature — build as its own dedicated task after navigation restructuring

**Why:** User requested this explicitly during nav redesign planning session (May 2026).
**How to apply:** When user says "plan the requisition/MRN feature", refer to this file for full context.
