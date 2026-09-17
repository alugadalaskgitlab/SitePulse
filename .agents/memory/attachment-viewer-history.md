---
name: Attachment viewer history
description: Keep in-app attachment Back handling compatible with dirty forms and route lifecycle.
---

Treat attachment history as a same-URL overlay, never a temporary exemption from navigation protection. Bind ownership and traversal to the exact URL and unique marker; do not use a timed global bypass.

**Why:** rapid double-Back or a multi-entry Back can leave a dirty form while an overlay-close flag remains active. Restoring the URL afterward is insufficient if the router already unmounted the form.

**How to apply:** coordinate with the shared dirty-form guard, stop declined route-changing events before routing listeners, and verify browser history with a real routed parent, nested dialog, component mount identity, unsaved values, and scroll position. Simple always-mounted component tests miss this loss.