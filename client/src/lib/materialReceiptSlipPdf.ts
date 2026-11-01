import jsPDF from "jspdf";
import type { MaterialReceiptSlipCompany, MaterialReceiptSlipData } from "./materialReceiptSlipTypes";
import { loadPdfLogoDataUrl } from "@/components/vendor-bills/pdfExportStyle";
import { formatPersonName } from "@shared/personName";

const W = 148;
const M = 10;
const INK: [number, number, number] = [33, 33, 33];
const DARK: [number, number, number] = [55, 55, 55];
const MID: [number, number, number] = [110, 110, 110];
const RULE: [number, number, number] = [205, 205, 205];
const TINT: [number, number, number] = [244, 244, 244];

function displayDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function displayDateTime(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function displayTime(value?: string | null): string {
  if (!value) return "-";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  return `${((hour + 11) % 12) + 1}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

function formatQty(value: number | string): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("en-IN", { maximumFractionDigits: 3 })
    : String(value);
}

function label(doc: jsPDF, text: string, x: number, y: number, align: "left" | "right" = "left") {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...MID);
  doc.setCharSpace(align === "left" ? 0.25 : 0);
  if (align === "right") doc.text(text.toUpperCase(), x, y, { align });
  else doc.text(text.toUpperCase(), x, y);
  doc.setCharSpace(0);
}

function reference(record: MaterialReceiptSlipData): string {
  return record.kind === "plant" ? record.receiptNo || `Receipt #${record.id}` : `Trip #${record.id}`;
}

function convertedMt(record: MaterialReceiptSlipData): string | null {
  if (record.kind !== "plant") return null;
  const factor = Number(record.conversionFactor);
  const from = (record.conversionFromUom || "").trim().toUpperCase();
  const to = (record.conversionToUom || "").trim().toUpperCase();
  if (!Number.isFinite(factor) || factor <= 0 || !/^(CFT|CUBIC FEET)$/.test(from)) return null;
  if (!/^(MT|TONS?|TONNES?|METRIC TONS?)$/.test(to)) return null;
  if ((record.uom || "").trim().toUpperCase() !== from) return null;
  const mt = Number(record.quantity) * factor;
  if (!Number.isFinite(mt)) return null;
  const density = Number(record.bulkDensity);
  return `Approx. ${mt.toFixed(2)} MT${Number.isFinite(density) && density > 0 ? ` · at ${density.toFixed(2)} t/cum` : ""}`;
}

function detailRows(record: MaterialReceiptSlipData): [string, string][] {
  const rows: [string, string][] = [];
  if (record.kind === "plant") {
    if (record.supplier) rows.push(["Supplier/Vendor", record.supplier]);
    if (record.transporter) rows.push(["Transporter", record.transporter]);
  } else {
    const own = record.materialSourceType === "own_source";
    const source = own ? record.materialSourceLabel : record.materialSourceSupplier;
    if (source) rows.push([own ? "Source" : "Supplier/Vendor", source]);
    if (record.supplier) rows.push(["Transporter", record.supplier]);
  }
  if (record.vehicleNumber) rows.push(["Vehicle", record.vehicleNumber]);
  if (record.driverName) rows.push(["Driver", formatPersonName(record.driverName)]);
  if (record.kind === "plant") {
    if (record.challanNumber) rows.push(["Supplier challan", record.challanNumber]);
    if (record.invoiceNo || record.invoiceDate) {
      rows.push(["Invoice", [record.invoiceNo, record.invoiceDate ? displayDate(record.invoiceDate) : null].filter(Boolean).join(" · ")]);
    }
    if (record.tankNumber != null) rows.push(["Unloaded into", `Tank ${record.tankNumber}`]);
  } else if (record.receiptNumber) {
    rows.push(["Supplier challan", record.receiptNumber]);
  }
  return rows;
}

function layout(
  doc: jsPDF,
  record: MaterialReceiptSlipData,
  company: MaterialReceiptSlipCompany,
  logoDataUrl: string | null,
): number {
  let logoWidth = 0;
  if (logoDataUrl) {
    try {
      const image = doc.getImageProperties(logoDataUrl);
      const scale = Math.min(22 / image.width, 18 / image.height);
      logoWidth = image.width * scale;
      doc.addImage(logoDataUrl, image.fileType === "PNG" ? "PNG" : "JPEG", M, 9, logoWidth, image.height * scale);
    } catch {
      logoWidth = 0;
    }
  }
  if (!logoWidth) {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.rect(M, 9, 18, 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text("HLC", M + 9, 19.5, { align: "center" });
    logoWidth = 18;
  }

  const textX = M + logoWidth + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(company.name || "High Lane Constructions", W - M - textX).slice(0, 1), textX, 15.5);
  const companyLines = [
    company.address?.trim() || "",
    [
      company.gstin?.trim() ? `GSTIN ${company.gstin.trim()}` : "",
      company.phone?.trim() ? `Ph ${company.phone.trim()}` : "",
    ].filter(Boolean).join("   ·   "),
  ].filter(Boolean);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MID);
  let companyY = 20.5;
  for (const line of companyLines) {
    doc.text(doc.splitTextToSize(line, W - M - textX).slice(0, 1), textX, companyY);
    companyY += 3.6;
  }

  let y = 31;
  doc.setFillColor(...DARK);
  doc.rect(M, y, W - 2 * M, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setCharSpace(0.8);
  doc.text(record.kind === "plant" ? "MATERIAL RECEIPT" : "SITE MATERIAL RECEIPT", M + 4, y + 6);
  doc.setCharSpace(0);
  doc.setFontSize(9.5);
  doc.text(reference(record), W - M - 4, y + 6, { align: "right" });
  y += 9;
  const revisedAt = displayDateTime(record.latestEditAt);
  if (revisedAt) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MID);
    doc.text(`Revised copy · ${revisedAt} · replaces earlier copy`, W - M, y + 4, { align: "right" });
    y += 4;
  }

  y += 5;
  const info = record.kind === "plant"
    ? [["Date", displayDate(record.date)], ["Time", displayTime(record.time)], ["Received at", record.plantName || "Main Plant"]] as [string, string][]
    : [["Date", displayDate(record.date)], ["Time", displayTime(record.time)], ["Site", record.site || "-"], ["Location", record.location || "-"]] as [string, string][];
  const widths = record.kind === "plant" ? [30, 24, 74] : [26, 20, 41, 41];
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  doc.line(M, y + 13, W - M, y + 13);
  let x = M;
  info.forEach(([key, value], index) => {
    const left = x + (index ? 3 : 0);
    label(doc, key, left, y + 4.6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...INK);
    const wrapped = doc.splitTextToSize(value, widths[index] - 4);
    doc.text(wrapped.length > 1 ? wrapped.slice(0, 2) : wrapped, left, y + (wrapped.length > 1 ? 8.6 : 9.8));
    if (index) doc.line(x, y + 2.5, x, y + 10.5);
    x += widths[index];
  });
  y += 13 + 5;

  const heroHeight = 25;
  doc.setFillColor(...TINT);
  doc.rect(M, y, W - 2 * M, heroHeight, "F");
  doc.setFillColor(...INK);
  doc.rect(M, y, 1.6, heroHeight, "F");
  label(doc, "Material", M + 6, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(record.materialName || "Material", 62).slice(0, 1), M + 6, y + 14.5);
  if (record.kind === "plant") {
    label(doc, "Stock of", M + 6, y + 20.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(record.partyName || "HLC", 46).slice(0, 1), M + 22, y + 20.5);
  }
  label(doc, "Quantity received", W - M - 5, y + 7, "right");
  const uom = (record.uom || "").toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  const uomWidth = doc.getTextWidth(uom);
  doc.text(uom, W - M - 5, y + 16, { align: "right" });
  doc.setFontSize(24);
  doc.text(formatQty(record.quantity), W - M - 5 - uomWidth - 1.8, y + 16, { align: "right" });
  const converted = convertedMt(record);
  if (converted) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...MID);
    doc.text(converted, W - M - 5, y + 21.5, { align: "right" });
  }
  y += heroHeight;

  const details = detailRows(record);
  if (details.length) {
    y += 7;
    label(doc, "Delivery details", M, y);
    y += 2;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.35);
    doc.line(M, y, W - M, y);
    for (const [key, value] of details) {
      const lines = doc.splitTextToSize(value, W - M - 52).slice(0, 2);
      const height = 4 + lines.length * 3.6 + 1.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(...MID);
      doc.text(key, M + 1, y + 5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.4);
      doc.setTextColor(...INK);
      doc.text(lines, M + 42, y + 5);
      y += height;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.15);
      doc.line(M, y, W - M, y);
    }
  }

  if (record.kind === "plant" && /^(CFT|CUBIC FEET|CUM|CUMM|TRIP|TRIPS)$/i.test((record.uom || "").trim())) {
    y += 5;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.8);
    doc.setTextColor(...MID);
    doc.text(
      doc.splitTextToSize("Not weighed — quantity measured by tipper body volume; MT shown is approximate, at the agreed bulk density.", W - 2 * M),
      M,
      y,
    );
    y += 2;
  }

  y += 22;
  const half = (W - 2 * M - 12) / 2;
  const receivedByName = formatPersonName(record.receivedByName);
  const driverName = formatPersonName(record.driverName);
  const companyName = company.name.replace(/\s+/g, " ").trim();
  const companyCaption = companyName ? `for ${companyName}` : "";
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.25);
  doc.line(M, y, M + half, y);
  doc.line(W - M - half, y, W - M, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  if (receivedByName) doc.text(doc.splitTextToSize(receivedByName, half), M, y + 5);
  if (driverName) doc.text(doc.splitTextToSize(driverName, half), W - M - half, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MID);
  doc.text("Received by", M, y + 10);
  doc.text("Driver", W - M - half, y + 10);
  if (companyCaption) {
    let companyCaptionSize = 6.5;
    doc.setFontSize(companyCaptionSize);
    while (doc.getTextWidth(companyCaption) > half && companyCaptionSize > 5.5) {
      companyCaptionSize = Math.max(5.5, companyCaptionSize - 0.25);
      doc.setFontSize(companyCaptionSize);
    }
    doc.text(companyCaption, M, y + 13);
  }

  y += 17;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  doc.setFontSize(6);
  doc.setTextColor(...MID);
  doc.text("System-generated receipt · SitePulse", M, y + 4);
  doc.text(`Issued ${displayDateTime(new Date())}`, W - M, y + 4, { align: "right" });
  return y + 9;
}

export function drawMaterialReceiptSlip(
  doc: jsPDF,
  record: MaterialReceiptSlipData,
  company: MaterialReceiptSlipCompany,
  logoDataUrl: string | null,
): number {
  return layout(doc, record, company, logoDataUrl);
}

export async function buildMaterialReceiptSlipPdf(
  record: MaterialReceiptSlipData,
  company: MaterialReceiptSlipCompany,
  logoFile?: string | null,
): Promise<Blob> {
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadPdfLogoDataUrl(logoFile);
  } catch {
    // A missing or inaccessible logo must not prevent a receipt slip from being saved.
  }
  const probe = new jsPDF({ unit: "mm", format: [148, 400] });
  const height = Math.max(150, Math.ceil(layout(probe, record, company, logoDataUrl)));
  const doc = new jsPDF({ unit: "mm", format: [148, height], orientation: "portrait" });
  layout(doc, record, company, logoDataUrl);
  return doc.output("blob");
}

export function materialReceiptSlipFilename(record: MaterialReceiptSlipData): string {
  const reference = record.kind === "plant" ? record.receiptNo || `RECEIPT-${record.id}` : `TRIP-${record.id}`;
  const safeReference = reference.trim().replace(/[\/\s]+/g, "-").replace(/[^A-Za-z0-9._-]/g, "-");
  return `HLC-${safeReference}.pdf`;
}

export function materialReceiptSlipCaption(record: MaterialReceiptSlipData): string {
  const heading = record.kind === "plant" ? "*HLC · Material Receipt*" : "*HLC · Site Material Receipt*";
  const reference = record.kind === "plant"
    ? record.receiptNo || `Receipt #${record.id}`
    : `Trip ${record.id}${record.receiptNumber ? ` · Challan ${record.receiptNumber}` : ""}`;
  const dateTime = [displayDate(record.date), record.time].filter(Boolean).join(" · ");
  const receivedByName = formatPersonName(record.receivedByName || record.enteredBy);
  return [
    heading,
    `${reference}${record.latestEditAt ? " · Revised" : ""}`,
    `${record.materialName} — ${record.quantity} ${record.uom}`,
    record.vehicleNumber ? `Vehicle: ${record.vehicleNumber}` : null,
    record.driverName ? `Driver: ${formatPersonName(record.driverName)}` : null,
    receivedByName ? `Received by: ${receivedByName}` : null,
    dateTime,
  ].filter(Boolean).join("\n");
}
