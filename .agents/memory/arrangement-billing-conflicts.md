---
name: Arrangement billing conflicts
description: Owner's rule for same-party landed material versus transport-only arrangements.
---

Retain the material row when a transport-only arrangement conflicts with a
same-vendor, same-trip landed-material row. Do not add arrangement haulage
alongside it and do not auto-price either side. Show a plain note naming the
landed material (which includes delivery) and the transport-only arrangement.
The owner decides which applies.

**Why:** The owner explicitly resolved the conflict between leaving material
unchanged and preventing the same haulage from being charged twice.

**How to apply:** Treat this as visible unpriced review, never a hidden zero,
automatic material suppression or inferred material-only rate.

Group arrangement charges for presentation but retain each trip's source
identity and frozen pricing facts on its individual stored bill item.

**Why:** A merged monetary line cannot represent multiple trip identities in
the existing single-string source field; losing them defeats duplicate checks.

**How to apply:** Use the existing grouping helper for the displayed rows,
and the existing auto-source and transaction-lock mechanisms for persistence.
