---
name: Vendor payables preview
description: User-approved GST provenance and unallocated monthly-hire presentation for unsaved previews.
---

Preview GST rates are editable, unsaved inputs. Prefill each vendor/category from its most recent saved bill and label it “from last bill — check”. Missing rates stay blank and amber, never implicitly zero. Pre-tax is primary; label totals “Pre-tax”, “GST (indicative)”, and “With GST”.

**Why:** The user explicitly approved indicative GST without persisting rates or silently assuming a tax rate.

**How to apply:** Preserve an explicitly saved zero as a real rate, distinguish missing rates, and never show unknown tax as a complete calculated total. Apply existing access controls to source bills.

Do not block previews for unallocatable monthly availability/maintenance. Show a “Not allocated to a site” block with reasons per charge; exclude those charges from the site subtotal and include them in the vendor grand total, labelled clearly. Never prorate or guess site allocation.

**Why:** The user explicitly wants the difference between site and vendor totals to be deliberate and visible without inventing hire-billing rules.

**How to apply:** Keep the original hire engine authoritative and do not disclose otherwise unauthorized sites through the vendor total. The unsaved preview must not create, update or delete business records.