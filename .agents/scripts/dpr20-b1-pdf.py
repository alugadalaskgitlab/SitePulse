"""Visual/coordinate audit of isolated DPR20 B1 PDF (no DB access)."""
from pathlib import Path
import json
import pymupdf as fitz

root = Path("tests/fixtures/dpr-site-entry/evidence")
document = fitz.open(root / "dpr20-b1-print.pdf")
outside = []
for index, page in enumerate(document):
    page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(root / f"dpr20-b1-print-page-{index + 1}.png")
    for word in page.get_text("words"):
        x0, y0, x1, y1, text, *_ = word
        if x0 < -0.5 or y0 < -0.5 or x1 > page.rect.width + 0.5 or y1 > page.rect.height + 0.5:
            outside.append({"page": index + 1, "text": text, "bounds": [x0, y0, x1, y1]})
(root / "dpr20-b1-print-fulltext.txt").write_text(
    "\n".join(f"PAGE {index + 1}\n{page.get_text()}" for index, page in enumerate(document))
)
print(json.dumps({"pages": len(document), "page_sizes": [[page.rect.width, page.rect.height] for page in document],
                  "out_of_page_words": outside}))
assert not outside, "Printed text falls outside paper bounds"