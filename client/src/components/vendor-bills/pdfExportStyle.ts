import type { jsPDF } from "jspdf";

export const PDF_HEADER_FILL: [number, number, number] = [237, 237, 237];
export const PDF_ZEBRA_FILL: [number, number, number] = [248, 248, 248];
export const PDF_RULE: [number, number, number] = [65, 65, 65];

const pdfLogoCache = new Map<string, Promise<string | null>>();

/** Loads the configured public company mark and normalizes it for jsPDF. */
export function loadPdfLogoDataUrl(logoFile?: string | null): Promise<string | null> {
  const relativePath = String(logoFile || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!relativePath || relativePath.split("/").some(part => part === "." || part === "..")) {
    return Promise.resolve(null);
  }
  const cached = pdfLogoCache.get(relativePath);
  if (cached) return cached;

  const loading = (async () => {
    try {
      const url = `/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
      const imageBlob = await response.blob();
      const objectUrl = URL.createObjectURL(imageBlob);
      try {
        const image = new Image();
        const loaded = await new Promise<boolean>(resolve => {
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = objectUrl;
        });
        if (!loaded || !image.naturalWidth || !image.naturalHeight) return null;
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(image, 0, 0);
        return canvas.toDataURL("image/png");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return null;
    }
  })();
  pdfLogoCache.set(relativePath, loading);
  void loading.then(dataUrl => {
    if (!dataUrl) pdfLogoCache.delete(relativePath);
  });
  return loading;
}

export type PdfBillHeader = {
  title: string;
  companyName?: string;
  logoDataUrl?: string | null;
  billNo?: string;
  billDate?: string;
  periodFrom?: string;
  periodTo?: string;
  status?: string;
  detailLines?: string[];
};

/** Compact, grayscale letterhead shared by the equipment-hire PDFs. */
export function drawPdfBillHeader(doc: jsPDF, header: PdfBillHeader): number {
  const width = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...PDF_RULE);
  doc.setLineWidth(0.35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  let logoDrawn = false;
  if (header.logoDataUrl) {
    try {
      const image = doc.getImageProperties(header.logoDataUrl);
      const box = { x: 10, y: 8, width: 15, height: 12 };
      const scale = Math.min(box.width / image.width, box.height / image.height);
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;
      doc.addImage(
        header.logoDataUrl, "PNG",
        box.x + (box.width - imageWidth) / 2,
        box.y + (box.height - imageHeight) / 2,
        imageWidth, imageHeight,
      );
      logoDrawn = true;
    } catch {
      // Preserve a usable text mark if the configured image cannot be embedded.
    }
  }
  if (!logoDrawn) {
    doc.rect(10, 8, 15, 12);
    doc.text("HLC", 17.5, 15.5, { align: "center" });
  }

  doc.setFontSize(10);
  doc.text(header.companyName || "Highlane Constructions", 29, 13);
  doc.setFontSize(12);
  doc.text(header.title, width - 10, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const metadata = [
    `Bill: ${header.billNo || "Not yet saved"}`,
    `Bill date: ${header.billDate || "Not recorded"}`,
    `Period: ${header.periodFrom || "—"} to ${header.periodTo || "—"}`,
    `Status: ${header.status || "Draft"}`,
  ].join("   ·   ");
  const metadataLines = doc.splitTextToSize(metadata, width - 20);
  doc.text(metadataLines, 10, 24);

  const details = (header.detailLines || []).filter(Boolean);
  let y = 27 + metadataLines.length * 3.2;
  if (details.length) {
    doc.setFillColor(...PDF_ZEBRA_FILL);
    doc.setDrawColor(170, 170, 170);
    const wrapped = details.flatMap(line => doc.splitTextToSize(line, width - 24));
    const lineHeight = 3.2;
    const height = Math.max(7, wrapped.length * lineHeight + 3);
    doc.rect(10, y, width - 20, height, "FD");
    doc.setFontSize(6.8);
    doc.setTextColor(25, 25, 25);
    doc.text(wrapped, 12, y + 4.2);
    y += height + 3;
  }
  return Math.max(y, 33);
}

export function drawPdfBillFooter(doc: jsPDF, page: number, pages: number, generatedAt: string, billNo: string) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.25);
  doc.line(10, height - 11, width - 10, height - 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(55, 55, 55);
  doc.text(`Generated ${generatedAt}  ·  Bill ${billNo || "Not yet saved"}`, 10, height - 6);
  doc.text(`Page ${page} of ${pages}`, width - 10, height - 6, { align: "right" });
}

export const INK_LIGHT_TABLE = {
  theme: "grid" as const,
  styles: {
    font: "helvetica",
    fontSize: 7,
    textColor: [25, 25, 25] as [number, number, number],
    lineColor: [170, 170, 170] as [number, number, number],
    lineWidth: 0.15,
    cellPadding: 2,
    overflow: "linebreak" as const,
  },
  headStyles: {
    fillColor: PDF_HEADER_FILL,
    textColor: [0, 0, 0] as [number, number, number],
    fontStyle: "bold" as const,
    lineColor: PDF_RULE,
    lineWidth: 0.45,
  },
  alternateRowStyles: { fillColor: PDF_ZEBRA_FILL },
};
