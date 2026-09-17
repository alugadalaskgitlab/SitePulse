---
name: Rate-card manual provenance and billing-unit changes
description: Preserve manual-row removability and separate physical delivery quantities from deliberate billing-unit edits.
---

Manual rate-card provenance must survive ordinary bill rate updates. Treat legacy card-only identities without historical usage as removable, but do not infer manual origin for unmarked rows backed by real usage.

**Why:** Earlier manual additions had no provenance field and became indistinguishable from discovered rows after reload. A schema migration was explicitly excluded. Existing notes provide a marker for new manual entries; null notes from bill saves must not erase it.

**How to apply:** Preserve provenance through upserts and reconcile discovery by category, item key, and unit. Different units must not overwrite each other. Historical unmarked rows with real usage cannot reliably be identified as originally manual.

Billing-unit changes are deliberate bill-local edits, not physical-unit conversions. Default converted source rows to one target unit and show quantity, rate, and total before confirmation.

**Why:** One recorded delivery can contain 600 CFT but be commercially billed as one TRIP. No assumed CFT-per-trip factor is authorized.

**How to apply:** Offer only explicitly supported alternate rate-card units, keep per-row quantity editable, and defer Set Rates writes until ordinary bill Save. Preserve rate-only quantity/unit behavior.