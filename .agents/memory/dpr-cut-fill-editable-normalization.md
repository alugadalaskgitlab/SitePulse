---
name: DPR cut/fill editable normalization
description: Durable rules for keeping editable excavation outcomes consistent without rewriting submitted history.
---

Editable DPR state must normalize forced excavation outcomes after restore and whenever the excavation quantity changes: fully reusable follows the current quantity, unsuitable stays zero, and no outcome clears reusable quantity. Partly reusable is always user-owned; preserve its entered value and require correction when it is missing or outside the valid range.

**Why:** Restored or recalculated rows could look complete in the UI while carrying a stale forced tuple that the authoritative final-submit validator correctly rejected. Inventing a partial quantity would hide a business decision the engineer must make.

**How to apply:** Run normalization only in editable create/draft/reopen/version form state and payload preparation. Keep submitted-history views unchanged. Resolve roadway excavation from explicit BOQ context, and drive pre-submit readiness plus server rejection from the same strict tuple semantics.