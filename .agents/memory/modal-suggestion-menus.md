---
name: Modal suggestion menus
description: Why custom suggestions must be tested inside the actual modal.
---

Test custom suggestion menus inside the real modal, not only as standalone inputs.

**Why:** Radix modal dialogs disable body pointer events and hide outside content from assistive technology. A body-level custom portal can pass standalone keyboard tests while failing taps in receipt-edit dialogs.

**How to apply:** Keep custom options within the active dialog subtree or use a modal-aware primitive. Account for container scrolling when positioning absolute menus and preserve shared input styling.

Touch-picker verification must cover both sides of responsive breakpoints and final-item selection, not just a change in scrollTop.

**Why:** The BOQ picker uses a Drawer below 768px but a Popover at iPad widths. A list could reach its mathematical scroll bottom while its last option remained below the screen; mobile-only testing missed this.

**How to apply:** Test portrait and landscape tablet sizes in realistic page containment, drag to the bottom and tap the final item. Distinguish Chromium touch evidence from physical iPad Safari verification; do not infer a Safari root cause from CSS alone.