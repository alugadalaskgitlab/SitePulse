"""Render real CDP PDFs and measure physical page margins/rightmost content."""
import json
from pathlib import Path
import fitz

out = Path(".agents/outputs/dpr-page-02")
results = {}
for name in ["E-report", "F-mixed-report"]:
    doc = fitz.open(out / f"{name}.pdf")
    page = doc[0]
    page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(out / f"{name}-page-1.png")
    drawings = page.get_drawings()
    blocks = [block for block in page.get_text("blocks") if block[6] == 0]
    rect = page.rect
    bounds = [
        min(drawing["rect"].x0 for drawing in drawings),
        min(drawing["rect"].y0 for drawing in drawings),
        max(drawing["rect"].x1 for drawing in drawings),
        max(drawing["rect"].y1 for drawing in drawings),
    ]
    right_text = max(block[2] for block in blocks)
    text = "\n".join(p.get_text() for p in doc)
    assert len(doc) == 1, f"Unexpected page count for {name}"
    assert right_text < rect.width - 28, "Text exceeds the 10mm right margin"
    assert bounds[2] < rect.width, "Drawing clipped at page edge"
    assert "Remarks / hold-ups" in text
    assert "Physical quantities only. Development verification." in text
    for heading in ["Work done", "Equipment", "Labour", "Materials", "Consumption", "Programme", "Trips"]:
        assert heading in text, f"Missing printable column/section: {heading}"
    assert "₹" not in text and "987654" not in text and "9,87,654" not in text
    if name.startswith("F"):
        assert "Site purchases" in text and "unloading" in text and "Safety gloves" in text
    results[name] = {
        "pageCount": len(doc),
        "pagePoints": [rect.width, rect.height],
        "drawingBoundsPoints": bounds,
        "textRightPoints": right_text,
        "drawingPageMarginsMm": [
            bounds[0] * 25.4 / 72,
            bounds[1] * 25.4 / 72,
            (rect.width - bounds[2]) * 25.4 / 72,
            (rect.height - bounds[3]) * 25.4 / 72,
        ],
        "cssPageMargin": "10mm (existing @page margin:1cm)",
        "roundingNote": "Chromium A4/pixel rounding makes physical drawing margins approximate; all text remains inside the 10mm margin and no right-edge clipping is present.",
        "allRequiredSectionsAndFinalRemarksPresent": True,
        "noRightEdgeClipping": True,
        "noMoney": True,
    }
(out / "pdf-evidence.json").write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))