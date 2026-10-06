import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface GstRegisterPdfInput {
  title: string;
  company: string;
  metadata: string[];
  categories: (string | number)[][];
  details: (string | number)[][];
}

const printable = (value: string | number) => String(value)
  .replace(/[—–→]/g, "-").replace(/₹/g, "Rs. ");

/** Presentation only: every number and filter comes from the existing Excel path. */
export function buildGstRegisterPdf(input: GstRegisterPdfInput): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  let y = 14;
  const text = (value: string, size: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(printable(value), width - 24);
    for (const line of lines) {
      if (y > 185) { doc.addPage(); y = 14; }
      doc.text(line, 12, y);
      y += size * 0.45 + 1;
    }
  };
  text(input.company, 14, true);
  text(input.title, 12, true);
  input.metadata.forEach(line => text(line, 9));
  y += 3;
  const table = (heading: string, headers: string[], rows: (string | number)[][]) => {
    if (y > 166) { doc.addPage(); y = 14; }
    text(heading, 11, true);
    autoTable(doc, {
      startY: y, head: [headers], body: rows.map(row => row.map(printable)),
      margin: { top: 14, right: 12, bottom: 16, left: 12 },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [55, 65, 81] },
      rowPageBreak: "avoid", showHead: "everyPage",
      didParseCell: data => {
        if (data.section === "body" && data.row.raw[0] === "TOTAL") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 243, 247];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  };
  table("GST by Category", ["Category", "Bills", "Taxable", "GST"], input.categories);
  table("Bill Detail", ["Bill No", "Date", "Vendor", "Category", "Taxable", "GST", "Total"], input.details);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(`Page ${page} of ${pages}`, width - 12, doc.internal.pageSize.getHeight() - 7, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}
