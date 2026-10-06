---
name: Development browser verification
description: Normal development authentication for browser checks without any app bypass
---

Use ordinary development login and a specifically approved device for signed-in verification. Never change production, use a real person's credentials, or add test-mode authentication.

**Why:** Pending-device responses previously prevented live checks. Normal login plus one authorized development device approval worked without application changes.

**How to apply:** Consult `reports/dev-verification-account.md` for the authorized account procedure and private-note location. Never put passwords, cookie values, or tokens in memory or the repository. Private local notes may not survive container replacement; do not claim otherwise.

The documented testing-agent kind was unavailable in this environment. Installed Chromium with DevTools protocol provided real signed-in screenshots instead. Select the CDP target whose type is `page`; the first target may be an extension background page.
