---
name: Admin DPR correction constraints
description: Why submitted-report corrections need narrow operational authority and semantic audit preservation.
---

Admin corrections must remain version-based, not overwrite the original report. Moved equipment report copies can be corrected without rewriting canonical predecessors or successor continuity.

An explicitly approved incident-specific chainage correction is a narrow
exception: the user required original equipment-log identities and paid-bill
references to survive, with progress changed in place and before/after audit.
This approval must not be generalized to other DPRs or other missing links.

**Why:** normal equipment-log replacement can break financial source identity;
reconstructing a missing usage from report readings invents operational history.

**How to apply:** keep ordinary versioning unchanged. Any further in-place
exception needs separate explicit approval, unchanged-section validation,
authenticated Administrator confirmation and an atomic preservation audit.

**Why:** unlocking form controls alone leaves save-time lifecycle rejections; indiscriminately adopting all linked usage rows changes unrelated operational history.

**How to apply:** authorize canonical corrections for exact changed usage IDs under transaction locks, never a transaction-wide boolean. Preserve machine/link identities; use explicit reasons and valid conversion metadata for measurement/unit overrides.

Server-owned review facts must follow a uniquely identified source row, with semantic comparisons for changes.

Correction preservation checks must compare persisted resource identities and
facts, not client-session isNew/workAssignmentEdited flags.

**Why:** assignment-touch flags can survive reverting the edit and restoring a
session draft. A generic error shared across resource sections cannot identify
the offending row after the fact.

**How to apply:** test the actual SiteEdit mapper through JSON serialization,
retain strict identity/child/resource comparisons, and include section, row
identity and field in rejection messages without logging private payloads.

**Why:** legacy rows may have no stable entry key or normalized chainage values. Raw comparisons discard valid approvals, while duplicate source claims can copy approval onto multiple rows.

**How to apply:** enforce one-to-one validated source identity before geometry exceptions and audit copying; normalize chainage and nullable booleans, ignore incoming approval fields, and reset review when relevant work facts change.

Submitted-version programme, quantity-source, and material-outcome checks apply to changed/new activity rows, not untouched historical rows. Fresh creation and draft save/submit retain full validation.

**Why:** a labour-only correction must not be blocked by unrelated legacy activity data. Semantic comparison must not normalize invalid enum values into an apparent unchanged match.

**How to apply:** match validated source identity, compare authored facts, preserve unchanged rows without validator mutation, and compare strict enums exactly. Keep the server diesel guard aligned with UI: ordinary editors may correct Contractor/Direct-Purchase diesel; authenticated admins retain Plant-stock override.