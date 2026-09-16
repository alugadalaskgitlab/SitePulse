---
name: Admin DPR correction constraints
description: Why submitted-report corrections need narrow operational authority and semantic audit preservation.
---

Admin corrections must remain version-based, not overwrite the original report. Moved equipment report copies can be corrected without rewriting canonical predecessors or successor continuity.

**Why:** unlocking form controls alone leaves save-time lifecycle rejections; indiscriminately adopting all linked usage rows changes unrelated operational history.

**How to apply:** authorize canonical corrections for exact changed usage IDs under transaction locks, never a transaction-wide boolean. Preserve machine/link identities; use explicit reasons and valid conversion metadata for measurement/unit overrides.

Server-owned review facts must follow a uniquely identified source row, with semantic comparisons for changes.

**Why:** legacy rows may have no stable entry key or normalized chainage values. Raw comparisons discard valid approvals, while duplicate source claims can copy approval onto multiple rows.

**How to apply:** enforce one-to-one validated source identity before geometry exceptions and audit copying; normalize chainage and nullable booleans, ignore incoming approval fields, and reset review when relevant work facts change.