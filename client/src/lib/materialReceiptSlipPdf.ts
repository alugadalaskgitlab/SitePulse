import jsPDF from "jspdf";
import type { MaterialReceiptSlipData } from "./materialReceiptSlipTypes";
import { loadPdfLogoDataUrl } from "@/components/vendor-bills/pdfExportStyle";

const PAGE_MARGIN = 10;
const DARK: [number, number, number] = [55, 55, 55];
const MID: [number, number, number] = [115, 115, 115];
const LIGHT: [number, number, number] = [238, 238, 238];

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

function drawHeader(doc: jsPDF, record: MaterialReceiptSlipData, companyName: string, logoDataUrl: string | null): number {
  const width = doc.internal.pageSize.getWidth();
  let logoDrawn = false;
  if (logoDataUrl) {
    try {
      const image = doc.getImageProperties(logoDataUrl);
      const box = { x: PAGE_MARGIN, y: 8, width: 15, height: 12 };
      const scale = Math.min(box.width / image.width, box.height / image.height);
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;
      const format = image.fileType === "JPEG" || image.fileType === "PNG" ? image.fileType : "PNG";
      doc.addImage(logoDataUrl, format, box.x + (box.width - imageWidth) / 2, box.y + (box.height - imageHeight) / 2, imageWidth, imageHeight);
      logoDrawn = true;
    } catch {
      // Fall back to the compact HLC mark if the configured logo cannot be embedded.
    }
  }
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);
  if (!logoDrawn) {
    doc.rect(PAGE_MARGIN, 8, 15, 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.text("HLC", PAGE_MARGIN + 7.5, 15.5, { align: "center" });
  }
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  doc.text(companyName || "Highlane Constructions", 29, 13);

  const title = record.kind === "plant" ? "MATERIAL RECEIPT" : "SITE MATERIAL RECEIPT";
  const reference = record.kind === "plant"
    ? record.receiptNo || `Receipt #${record.id}`
    : `Trip ${record.id}${record.receiptNumber ? ` · Challan ${record.receiptNumber}` : ""}`;
  doc.setFontSize(10);
  doc.text(title, width - PAGE_MARGIN, 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(reference, width - PAGE_MARGIN, 16, { align: "right" });
  const revisedAt = displayDateTime(record.latestEditAt);
  if (revisedAt) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MID);
    doc.text(`REVISED · ${revisedAt}`, width - PAGE_MARGIN, 20, { align: "right" });
  }
  doc.setDrawColor(...DARK);
  doc.line(PAGE_MARGIN, 24, width - PAGE_MARGIN, 24);
  return 28;
}

function drawInfoGrid(doc: jsPDF, record: MaterialReceiptSlipData, startY: number): number {
  const width = doc.internal.pageSize.getWidth();
  const gap = 3;
  const cellWidth = (width - PAGE_MARGIN * 2 - gap) / 2;
  const cellHeight = 12;
  const rows = record.kind === "plant"
    ? [
      ["Received at", record.plantName || "Main Plant"],
      ["Stock of", record.partyName || "HLC"],
      ["Date", displayDate(record.date)],
      ["Time", record.time || "-"],
    ]
    : [
      ["Site", record.site || "-"],
      ["Location / chainage", record.location || "-"],
      ["Date", displayDate(record.date)],
      ["Time", record.time || "-"],
    ];
  rows.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE_MARGIN + column * (cellWidth + gap);
    const y = startY + row * (cellHeight + gap);
    doc.setFillColor(...LIGHT);
    doc.setDrawColor(185, 185, 185);
    doc.roundedRect(x, y, cellWidth, cellHeight, 1.2, 1.2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MID);
    doc.setFontSize(6);
    doc.text(label.toUpperCase(), x + 2, y + 4);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(value || "-", cellWidth - 4).slice(0, 1), x + 2, y + 9);
  });
  return startY + cellHeight * 2 + gap;
}

function plantConvertedMt(record: MaterialReceiptSlipData): string | null {
  const factor = Number(record.conversionFactor);
  const from = (record.conversionFromUom || "").trim().toUpperCase();
  const to = (record.conversionToUom || "").trim().toUpperCase();
  if (!Number.isFinite(factor) || factor <= 0 || !from || !/^(MT|TONS?|TONNES?|METRIC TONS?)$/.test(to)) return null;
  if ((record.uom || "").trim().toUpperCase() !== from) return null;
  const mt = Number(record.quantity) * factor;
  if (!Number.isFinite(mt)) return null;
  const density = Number(record.bulkDensity);
  const densityText = Number.isFinite(density) && density > 0 ? ` at ${density.toFixed(2)} t/cum` : "";
  return `Approx. ${mt.toFixed(2)} MT${densityText}`;
}

function drawQuantityBand(doc: jsPDF, record: MaterialReceiptSlipData, startY: number): number {
  const width = doc.internal.pageSize.getWidth();
  const height = 19;
  doc.setFillColor(247, 247, 247);
  doc.setDrawColor(...DARK);
  doc.roundedRect(PAGE_MARGIN, startY, width - PAGE_MARGIN * 2, height, 1.2, 1.2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.setFontSize(10);
  const materialText = record.materialName || "Material";
  doc.text(doc.splitTextToSize(materialText, 82).slice(0, 1), PAGE_MARGIN + 3, startY + 7);
  doc.setFontSize(11);
  doc.text(`${record.quantity} ${record.uom}`, width - PAGE_MARGIN - 3, startY + 8, { align: "right" });
  const converted = record.kind === "plant" ? plantConvertedMt(record) : null;
  if (converted) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MID);
    doc.text(converted, width - PAGE_MARGIN - 3, startY + 14, { align: "right" });
  }
  return startY + height;
}

function detailRows(record: MaterialReceiptSlipData): [string, string][] {
  const rows: [string, string][] = [];
  if (record.vehicleNumber) rows.push(["Vehicle", record.vehicleNumber]);
  if (record.driverName) rows.push(["Driver", record.driverName]);
  if (record.kind === "plant") {
    if (record.supplier) rows.push(["From / Supplier", record.supplier]);
    if (record.transporter) rows.push(["Brought by / Transporter", record.transporter]);
    if (record.challanNumber) rows.push(["Challan", record.challanNumber]);
    if (record.invoiceNo || record.invoiceDate) {
      rows.push(["Invoice", [record.invoiceNo, record.invoiceDate ? displayDate(record.invoiceDate) : null].filter(Boolean).join(" - ")]);
    }
    if (record.tankNumber != null) rows.push(["Tank", String(record.tankNumber)]);
  } else {
    const source = record.materialSourceType === "own_source"
      ? record.materialSourceLabel
      : record.materialSourceSupplier;
    if (source) rows.push([record.materialSourceType === "own_source" ? "From / Source" : "From / Supplier", source]);
    if (record.supplier) rows.push(["Brought by / Transporter", record.supplier]);
    if (record.receiptNumber) rows.push(["Challan", record.receiptNumber]);
    if (record.enteredBy?.trim()) rows.push(["Entered by", record.enteredBy.trim()]);
  }
  return rows;
}

function drawDetails(doc: jsPDF, record: MaterialReceiptSlipData, startY: number): number {
  const labelX = PAGE_MARGIN + 2;
  const valueX = PAGE_MARGIN + 34;
  const valueWidth = doc.internal.pageSize.getWidth() - valueX - PAGE_MARGIN;
  let y = startY + 6;
  for (const [label, value] of detailRows(record)) {
    const wrapped = doc.splitTextToSize(value, valueWidth);
    const lineCount = Math.min(2, wrapped.length);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MID);
    doc.text(label, labelX, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(wrapped.slice(0, lineCount), valueX, y);
    y += Math.max(5, lineCount * 4);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.15);
    doc.line(PAGE_MARGIN, y - 2, doc.internal.pageSize.getWidth() - PAGE_MARGIN, y - 2);
  }
  return y;
}

export function drawMaterialReceiptSlip(
  doc: jsPDF,
  record: MaterialReceiptSlipData,
  companyName: string,
  logoDataUrl: string | null,
): void {
  const width = doc.internal.pageSize.getWidth();
  let y = drawHeader(doc, record, companyName, logoDataUrl);
  y = drawInfoGrid(doc, record, y);
  y += 4;
  y = drawQuantityBand(doc, record, y) + 1;
  y = drawDetails(doc, record, y);
  const isPlantVolume = record.kind === "plant" && /^(CFT|CUBIC FEET|CUM|CUMM|TRIP|TRIPS)$/i.test(record.uom.trim());
  if (isPlantVolume) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.8);
    doc.setTextColor(...MID);
    doc.text(
      doc.splitTextToSize("Not weighed - quantity by tipper body volume, converted at the agreed bulk density.", width - PAGE_MARGIN * 2),
      PAGE_MARGIN + 1,
      Math.min(y + 2, 162),
    );
  }
  const signatureY = 177;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.25);
  doc.line(PAGE_MARGIN + 3, signatureY, width / 2 - 4, signatureY);
  doc.line(width / 2 + 4, signatureY, width - PAGE_MARGIN - 3, signatureY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.text("Received · HLC", (PAGE_MARGIN + 3 + width / 2 - 4) / 2, signatureY + 5, { align: "center" });
  doc.text("Driver", (width / 2 + 4 + width - PAGE_MARGIN - 3) / 2, signatureY + 5, { align: "center" });
  doc.setDrawColor(180, 180, 180);
  doc.line(PAGE_MARGIN, 194, width - PAGE_MARGIN, 194);
  doc.setFontSize(6);
  doc.text(`Generated by SitePulse - ${displayDateTime(new Date())}`, PAGE_MARGIN, 199);
  doc.text("Page 1 of 1", width - PAGE_MARGIN, 199, { align: "right" });
}

export async function buildMaterialReceiptSlipPdf(
  record: MaterialReceiptSlipData,
  companyName: string,
  logoFile?: string | null,
): Promise<Blob> {
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadPdfLogoDataUrl(logoFile);
  } catch {
    // A missing or inaccessible logo must not prevent a receipt slip from being saved.
  }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  drawMaterialReceiptSlip(doc, record, companyName, logoDataUrl);
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
  return [
    heading,
    `${reference}${record.latestEditAt ? " · REVISED" : ""}`,
    `${record.materialName} — ${record.quantity} ${record.uom}`,
    record.vehicleNumber ? `Vehicle: ${record.vehicleNumber}` : null,
    dateTime,
  ].filter(Boolean).join("\n");
}
