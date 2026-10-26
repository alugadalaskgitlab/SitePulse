from pathlib import Path
import fitz


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / ".agents" / "outputs"
OUTPUT.mkdir(parents=True, exist_ok=True)

REFERENCES = {
    "bill-export-inklight": ROOT / "attached_assets" / "bill-export-inklight_1793012957067.pdf",
    "activity-statement-inklight": ROOT / "attached_assets" / "activity-statement-inklight_1793012957074.pdf",
}

for name, path in REFERENCES.items():
    document = fitz.open(path)
    print(f"{name}: {document.page_count} page(s)")
    for index, page in enumerate(document):
        print(f"  page {index + 1}: {page.rect.width:.0f} x {page.rect.height:.0f} pt")
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        output_path = OUTPUT / f"{name}-page-{index + 1}.png"
        pixmap.save(output_path)
        print(f"  rendered: {output_path.relative_to(ROOT)}")
