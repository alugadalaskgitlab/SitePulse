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

For automatic regular-vendor pulls, a rate card's alternate unit alone is not evidence of a conversion factor. Prefer exact same-unit cards; one identifiable physical trip can become one TRIP, but unknown conversions retain logged quantities at zero rate with a manual-conversion warning.

**Why:** Extending the historical bill-local one-unit default indiscriminately to hours/days or volume/mass creates financial errors. The pre-existing material-source conversion behavior was explicitly retained rather than silently reinterpreted.

**How to apply:** Keep manual billing-unit edits distinct from automatic conversion. Never revive unitless legacy rate application; require explicit unit-aware matching.