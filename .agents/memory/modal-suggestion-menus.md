---
name: Modal suggestion menus
description: Why custom suggestions must be tested inside the actual modal.
---

Test custom suggestion menus inside the real modal, not only as standalone inputs.

**Why:** Radix modal dialogs disable body pointer events and hide outside content from assistive technology. A body-level custom portal can pass standalone keyboard tests while failing taps in receipt-edit dialogs.

**How to apply:** Keep custom options within the active dialog subtree or use a modal-aware primitive. Account for container scrolling when positioning absolute menus and preserve shared input styling.