---
name: Published export verification
description: A successful deployment build does not prove workspace authorization changes are live.
---

Verify published authorization behavior with real non-admin sessions before calling the live app secured. Do not treat a successful deployment-build flag, workspace tests, or mocked browser responses as evidence that current workspace gates are published.

**Why:** A successful live build served older ungated export endpoints while the workspace contained the permission fixes. Real restricted-user requests exposed both permission and site-filter failures that local fixtures could not detect.

**How to apply:** Compare signed-in list and export results, require a non-empty permitted subset and known excluded records, and verify cleanup of temporary accounts/devices. Report deployment discrepancies explicitly without publishing unless authorized.

For a requested PDF comparison when the bill exists only in production and no live session is available, reuse the unchanged renderers with an authorized read-only snapshot locally rather than inserting a copy into development.

**Why:** This preserves the requested bill's financial evidence without modifying either database or changing account permissions.

**How to apply:** Label the outputs and screenshots as local snapshot renderings, not live authenticated verification. Keep the snapshot out of memory and stop temporary rendering services afterward.