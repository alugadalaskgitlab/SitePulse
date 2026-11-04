---
name: PDF export assertion reliability
description: Avoid mistaking limited jsPDF text extraction for missing rendered PDF content.
---

For jsPDF/autoTable export tests, do not treat a basic regex over PDF text operators as proof that content is absent. Line wrapping can emit separate text operators, and escaped parentheses can cause a pattern that stops at `)` to miss otherwise present text.

**Why:** A bill-export assertion reported missing equipment evidence even though the PDF content stream contained it and the rendered page showed it. The failure came from the test parser, not the export.

**How to apply:** Prefer a PDF-aware text extractor, assert carefully chosen raw content when appropriate, and inspect a rasterized page for layout and visibility.
