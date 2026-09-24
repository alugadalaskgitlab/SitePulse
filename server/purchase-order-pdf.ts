import PDFDocument from "pdfkit";
import type { Vendor } from "@shared/schema";

export type PurchaseOrderDetails = {
  companyName: string;
  logoPath?: string;
  indentNo: string;
  orderNo?: string | null;
  vendor: string | null;
  linkedVendor?: Vendor | null;
  showBank: boolean;
  description: string;
  spec?: string | null;
  qty: number;
  unit: string;
  rate: number | null;
  expectedDelivery?: string | null;
  paymentMode?: string | null;
  destination?: string | null;
};

export async function buildPurchaseOrderPdf(data: PurchaseOrderDetails): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: true });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 40;
  const width = 515;
  const line = (label: string, value: string | number | null | undefined) => {
    if (value == null || String(value).trim() === "") return;
    // A vendor can store arbitrarily long text. Bound it before PDFKit lays it
    // out so a single PO never silently spills onto a second page.
    const printable = String(value).replace(/\s+/g, " ").trim();
    const concise = printable.length > 140 ? `${printable.slice(0, 137)}...` : printable;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155").text(`${label}:`, left, doc.y, { continued: true });
    doc.font("Helvetica").fillColor("#0f172a").text(` ${concise}`, { width, height: 38, ellipsis: true });
    doc.moveDown(0.35);
  };
  const section = (label: string) => {
    doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#b45309").text(label.toUpperCase(), left);
    doc.moveDown(0.4);
  };
  if (data.logoPath) {
    try { doc.image(data.logoPath, left, 38, { fit: [36, 36] }); } catch { /* Optional logo; the company name remains the letterhead. */ }
  }
  doc.font("Helvetica-Bold").fontSize(17).fillColor("#0f172a").text(data.companyName.toUpperCase(), { align: "center", height: 42, ellipsis: true });
  doc.fontSize(12).text("PURCHASE ORDER", { align: "center" });
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(2).strokeColor("#d97706").stroke();
  section("Reference");
  line("Purchase Indent", data.indentNo);
  line("PO / Order No", data.orderNo);
  section("Supplier");
  line("Vendor", data.vendor);
  const vendor = data.linkedVendor;
  if (vendor) {
    line("Business Name", vendor.businessName);
    line("GST", vendor.gstNumber);
    line("PAN", vendor.panNumber);
    line("Address", vendor.address);
    if (data.showBank) {
      line("Bank", vendor.bankName);
      line("Account Name", vendor.bankAccountName);
      line("Account No", vendor.bankAccountNumber);
      line("IFSC", vendor.bankIfsc);
    }
  }
  section("Item & agreed terms");
  line("Description", data.description);
  line("Specification", data.spec);
  line("Quantity", `${data.qty} ${data.unit}`);
  line("Agreed rate", data.rate == null ? null : `Rs. ${Number(data.rate).toLocaleString("en-IN", { maximumFractionDigits: 2 })} / ${data.unit}`);
  line("Expected delivery", data.expectedDelivery);
  line("Payment mode", data.paymentMode);
  line("Delivery destination", data.destination || "To be confirmed");
  doc.moveDown(1);
  doc.fontSize(8).fillColor("#64748b").text("Generated from the Purchase Indent. Please confirm delivery arrangements with the purchaser.", left, Math.min(doc.y + 15, 735), { width });
  doc.end();
  return result;
}