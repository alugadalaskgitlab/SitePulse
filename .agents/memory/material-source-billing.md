---
name: Material source billing identity
description: One physical trip can support separate source-material and transporter liabilities.
---

Treat a trip's material seller and transporter as independent commercial roles, even when their vendor names coincide.

**Why:** The same delivery incurs two different charges. A global trip-consumed flag would block a legitimate second liability, while ignoring the role would allow duplicate charges or collapse them.

**How to apply:** Keep role-qualified identity in existing bill source metadata and apply vendor/alias-aware duplicate protection per role. Never derive the material seller from vehicle associations. Bulk source assignments must remain site-scoped, filtered, audited and atomic.

Automatic source billing conversion reuses the existing rate-card conversion contract without modifying physical trip quantities.

**Why:** Source vendors may charge per trip while delivery records remain in CFT. Rate-card ambiguity is not permission to guess a price.

**How to apply:** Auto-apply only an unambiguous matching material card; otherwise retain logged quantity/unit and let the user use Set Rates.