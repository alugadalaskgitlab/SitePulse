import PDFDocument from "pdfkit";

export type PurchaseOrderDetails = {
  companyName: string;
  logoPath?: string;
  indentNo: string;
  orderNo: string;
  orderDate: Date;
  vendor: string;
  vendorBusinessName?: string | null;
  vendorGst?: string | null;
  vendorPan?: string | null;
  vendorAddress?: string | null;
  description: string;
  spec?: string | null;
  qty: number;
  unit: string;
  rate: number | null;
  expectedDelivery?: string | null;
  paymentTerms?: string | null;
  destination?: string | null;
  raisedBy: string;
  raisedAt: Date;
  approvedBy: string;
  approvedAt: Date;
};

export async function buildPurchaseOrderPdf(data: PurchaseOrderDetails): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const x = 40, w = 515;
  const clean = (value: string | null | undefined, limit = 170) => {
    const text = (value || "").replace(/\s+/g, " ").trim();
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text || "—";
  };
  const date = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (data.logoPath) {
    try { doc.image(data.logoPath, x, 39, { fit: [48, 48] }); } catch { /* Company name remains visible without a logo. */ }
  }
  doc.fillColor("#142b43").font("Helvetica-Bold").fontSize(17).text(clean(data.companyName, 65), 96, 43, { width: 458, height: 45, ellipsis: true });
  doc.moveTo(x, 98).lineTo(x + w, 98).lineWidth(2).strokeColor("#d79235").stroke();
  doc.fillColor("#142b43").font("Helvetica-Bold").fontSize(20).text("PURCHASE ORDER", x, 116, { width: 300 });
  doc.roundedRect(355, 110, 200, 64, 5).fillAndStroke("#f1f5f9", "#cbd5e1");
  doc.fontSize(9).fillColor("#475569").text("PO / ORDER NO.", 365, 119);
  doc.fontSize(12).fillColor("#142b43").text(clean(data.orderNo, 40), 365, 132, { width: 178, height: 18, ellipsis: true });
  doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`Date: ${date(data.orderDate)}`, 365, 153);
  doc.fontSize(9).text(`Purchase Indent: ${clean(data.indentNo, 75)}`, x, 165, { width: 300 });

  const boxY = 197, boxH = 160, gap = 12, half = (w - gap) / 2;
  const block = (bx: number, heading: string, lines: string[]) => {
    doc.roundedRect(bx, boxY, half, boxH, 5).strokeColor("#cbd5e1").stroke();
    doc.rect(bx + 1, boxY + 1, half - 2, 30).fill("#e9eff5");
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#142b43").text(heading, bx + 12, boxY + 10, { width: half - 24 });
    let yy = boxY + 42;
    for (const line of lines) {
      if (!line) continue;
      doc.font("Helvetica").fontSize(9).fillColor("#27364a").text(clean(line, 95), bx + 12, yy, { width: half - 24, height: 31, ellipsis: true });
      yy += Math.min(32, Math.max(16, doc.heightOfString(clean(line, 95), { width: half - 24 }) + 5));
      if (yy > boxY + boxH - 12) break;
    }
  };
  block(x, "VENDOR", [
    data.vendor, data.vendorBusinessName && data.vendorBusinessName !== data.vendor ? data.vendorBusinessName : "",
    data.vendorGst ? `GST: ${data.vendorGst}` : "",
    data.vendorPan ? `PAN: ${data.vendorPan}` : "",
    data.vendorAddress || "",
  ]);
  block(x + half + gap, "DELIVER TO", [data.destination || "To be confirmed"]);

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#142b43").text("ITEM & AGREED TERMS", x, 383);
  const cols = [x, x + 196, x + 252, x + 307, x + 367, x + 441, x + w];
  const labels = ["DESCRIPTION", "QTY", "UNIT", "RATE", "DELIVERY", "PAYMENT"];
  const tableY = 407, rowH = 116;
  doc.rect(x, tableY, w, 34).fill("#e9eff5");
  doc.rect(x, tableY, w, 34 + rowH).strokeColor("#aebdca").stroke();
  doc.moveTo(x, tableY + 34).lineTo(x + w, tableY + 34).stroke();
  for (let i = 1; i < cols.length - 1; i++) doc.moveTo(cols[i], tableY).lineTo(cols[i], tableY + 34 + rowH).stroke();
  labels.forEach((label, i) => doc.font("Helvetica-Bold").fontSize(8).fillColor("#142b43")
    .text(label, cols[i] + 5, tableY + 11, { width: cols[i + 1] - cols[i] - 10 }));
  const cells = [
    `${data.description}${data.spec ? `\n${data.spec}` : ""}`,
    String(data.qty), data.unit,
    data.rate == null ? "—" : `Rs. ${Number(data.rate).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
    data.expectedDelivery || "—", data.paymentTerms || "—",
  ];
  cells.forEach((value, i) => doc.font("Helvetica").fontSize(9).fillColor("#27364a")
    .text(clean(value, i === 0 ? 220 : 75), cols[i] + 5, tableY + 45, {
      width: cols[i + 1] - cols[i] - 10, height: rowH - 15, ellipsis: true,
    }));
  doc.moveTo(x, 558).lineTo(x + w, 558).strokeColor("#cbd5e1").stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#142b43").text(`Raised by: ${clean(data.raisedBy, 75)}`, x, 574, { width: half });
  doc.font("Helvetica").fontSize(9).fillColor("#475569").text(date(data.raisedAt), x, 592);
  doc.font("Helvetica-Bold").fillColor("#142b43").text(`Approved by: ${clean(data.approvedBy, 75)}`, x + half + gap, 574, { width: half });
  doc.font("Helvetica").fillColor("#475569").text(date(data.approvedAt), x + half + gap, 592);
  doc.end();
  return result;
}