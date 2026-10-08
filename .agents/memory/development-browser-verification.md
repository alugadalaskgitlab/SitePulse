---
name: Development browser verification
description: Normal development authentication for browser checks without any app bypass
---

Use ordinary development login and a specifically approved device for signed-in verification. Never change production, use a real person's credentials, or add test-mode authentication.

**Why:** Pending-device responses previously prevented live checks. Normal login plus one authorized development device approval worked without application changes.

**How to apply:** Consult `reports/dev-verification-account.md` for the authorized account procedure and secret usage. Never put passwords, cookie values, or tokens in memory or the repository. Browser sessions are disposable, not a durable credential source.

Use the existing development verification password secret. If it is absent, stop sign-in verification rather than inventing another storage location.

**Why:** The user supplied the password through the secrets flow and explicitly prohibited another storage fallback after repeated container-reclamation failures.

**How to apply:** Use supported secrets tooling to check existence, consume the value only inside the login process, and record only the secret name and usage procedure in the verification report. Reuse the ordinary account; do not create a duplicate or change flags. Restore only the explicitly approved grants documented in the account report.

The owner authorized durable development-only view/create/edit grants for
verification. Delete, Export and Notify must remain false on every section,
and the account must never gain admin, owner, field-engineer or
permission-management bypass flags. Tests needing Delete or Export use a
separate temporary account and remove it afterward.

**Why:** Repeated 403s prevented real signed-in saves; the owner requires those
saves through normal permission checks rather than substituting fixture tests.

**How to apply:** Use the account-maintenance procedure in the report. Grant
restoration is not permission to expand access beyond the approved list.
Browser fixture sites must be active; an inactive site can exist in saved trips
yet be absent from the live site selector. Wait for dialog animations to settle
before capturing evidence.

Buffer browser evidence until the interaction run finishes, and wait for a
confirmation dialog to mount before clicking its action.

**Why:** A verification run lost the expected screen state while writing
evidence and advancing immediately between dialog actions; buffered output
and explicit dialog readiness produced stable signed-in proofs.

**How to apply:** Do not treat a dispatched click as proof that React has rendered
the next dialog. Device labels are generated from the user agent, not the login
body's requested label; identify the newly pending device by its own cookie and
check it was absent before that login.

The documented testing-agent kind was unavailable in this environment. Installed Chromium with DevTools protocol provided real signed-in screenshots instead. Select the CDP target whose type is `page`; the first target may be an extension background page.

The public development domain can route to the separate mockup sandbox rather
than the main application. Verify the response before using it for app login.

**Why:** A normal login request received the mockup server's `/__mockup/` base-URL
message instead of the application's JSON response.

**How to apply:** If this occurs, use the main workflow's verified port for the
disposable local browser harness; do not change port exposure or authentication
to make verification work.
