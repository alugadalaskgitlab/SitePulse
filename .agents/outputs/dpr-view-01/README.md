# DPR-VIEW-01 evidence — isolated fixture, not live auth

Verified by `node tests/fixtures/dpr-view-01/run.mjs`.

Actual SiteReport and DprDetails mount the same explicitly mockup-derived DPR409
fixture. BEFORE is extracted `git show HEAD` at
`490f21f77490f64cb7c4dd07c550987448d115ac`; application files were never rolled
back. Both baseline equipment read views always show audit: “before closed”
therefore means default screen state, not a toggle the baseline did not have.

## Key comparisons

| View | Before | After |
| --- | --- | --- |
| SiteReport desktop | `sitereport-before-desktop-closed.png` | `sitereport-after-desktop-closed.png` |
| SiteReport phone | `sitereport-before-phone-equipment-viewport.png` | `sitereport-after-phone-equipment-viewport.png` |
| DprDetails desktop | `dprdetails-before-desktop-closed.png` | `dprdetails-after-desktop-closed.png` |
| DprDetails phone | `dprdetails-before-phone-equipment-viewport.png` | `dprdetails-after-phone-equipment-viewport.png` |

All combinations also have full-page `*-expanded.png` captures.
`verification-results.json` records every result.

After desktop's six main fields have at most four visual text lines per cell.
SiteReport baseline rows were about 785px; after rows 72–115px (the eligible
Lifecycle row retains its badge/button chrome). DprDetails baseline readonly
audit blocks were 654px; after rows about 71px. This evidence includes the
fixture's task, source and full registration. No fact was truncated to achieve
those dimensions.

Both after phone pages are 390px wide with document width 390px, closed and
expanded. One equipment table per page. No browser runtime exceptions. The real
Send onward form submitted fixture-local `{destinationType:"hmp",
successorDate:"2026-10-02"}`. No production request or write occurred.

## Actual paginated print evidence

- `sitereport-after-mockup409.pdf`: **5-page A4** normal fixture report.
- `sitereport-after-mockup409-print-page-1.png` through `-5.png`: rendered PDF pages.
- `sitereport-after-audit-stress.pdf`: **9-page A4** synthetic long-audit variation.
- `sitereport-after-print-page-1.png` through `-9.png`: rendered stress PDF pages.
- Both PDFs have extracted `*.txt` files.

All three equipment audit panels were screen-closed when printing and became
visible solely through print CSS. Print checks verify no Lifecycle text, one
legend, every machine, snapshot/expected/assignment facts, all **95 complete
long-remark paragraphs** and the **entire unbroken long attachment filename**.
Stress PDF page 6 shows the remarks end marker and wrapped full filename.
PDF pages were visually reviewed for page fragmentation and right-edge clipping.

## Limits / incidental fixes

These are isolated fixtures, not authenticated customer records. Canonical
performance deliberately has no matching event; pictured measured consumption
comes from the existing DPR snapshot fallback. Canonical precedence is covered
by separate focused tests. Full suite is main-agent owned.

Browser review exposed long Lifecycle badges protruding from their narrow
desktop cell; the only application change in this verification pass was scoped
wrapping/sizing CSS. The exact Lifecycle subtree/behavior remains unchanged.
The fixture has its own labelled logo so evidence has no broken header image.

The Screenshot tool could not reach temporary shell-hosted ports after a shell
call finished; the saved evidence was captured directly by the real Chromium
CDP session during the runner, not by that tool. Poppler emitted Type 3 glyph
bounding-box warnings; full paragraph/filename preservation assertions passed.
Temporary fixture server and Chromium are stopped when the runner finishes.