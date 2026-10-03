# DPR-VIEW-01 isolated browser + PDF evidence

Run from the workspace root:

```sh
node tests/fixtures/dpr-view-01/run.mjs
```

The runner creates test-only `baseline/` sources from `git show HEAD`, starts a
temporary Vite fixture on 4189 and headless Chromium/CDP on 9239, verifies and
captures evidence, then stops both process groups. `CHROMIUM_PATH` can override
the installed executable. Dependencies: existing `ws`, Chromium, `pdftotext`,
`pdftoppm`, `pdfinfo`. No Playwright package is required.

Both real pages mount against the same mockup-derived DPR409 record. Fixture
auth is confined to this Vite config using the existing isolated mock-auth
adapter; there is no bypass, route or session change in the application. Fetch
is browser-local: all APIs resolve from memory. The one Send onward action is
recorded in memory, not sent to a server. Unknown mutation/non-API fetch throws.

Before sources come from HEAD, not a production-file rollback. Both HEAD
read-only equipment presentations always expose their audit facts, so a
“before closed” image means their default screen state: those pages have no
equipment toggle to close. After captures verify all three equipment panels
closed, then opened. Unrelated native activity details are closed/opened for
matching before captures.

Output: `.agents/outputs/dpr-view-01/`

- Both pages × before/after × 1280/390px × default/expanded full-page PNGs.
- Equipment viewport PNGs for readable visual comparisons.
- Same mockup record's actual A4 PDF, extracted text and every rendered page.
- Audit-stress actual A4 PDF, extracted text and every rendered page. Synthetic
  long remarks and filename are explicitly labelled fixture variations.
- `verification-results.json`: dimensions, panel visibility, visual text-line
  counts, lifecycle mutation payload, PDF assertions and browser exceptions.

Assertions cover no after-phone horizontal overflow (closed and expanded),
one equipment table, measured mockup figures, ≤4 visual text lines in the six
main fields on desktop, lifecycle badges contained in their cells, preserved
real move form/date/payload, closed screen panels forced open by print CSS,
all 95 complete long-remark paragraphs and the entire long attachment filename
in PDF text, linked maintenance, all machines and no Lifecycle text in print.

These are fixture results, not authenticated customer DPR evidence. Canonical
report response deliberately has no matching event, so screenshot consumption
is measured DPR-snapshot fallback; canonical precedence is covered separately
by focused tests. Poppler may emit Type 3 glyph bounding-box warnings; text
preservation is asserted independently and PDF pages are rendered for review.