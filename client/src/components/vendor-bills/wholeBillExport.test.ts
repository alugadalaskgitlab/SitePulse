import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { equipmentHireActivitySheetRows } from "./EquipmentHireBillOutput";
import { buildWholeBillPdf, buildWholeBillWorkbook, saveWholeBillFile, type BillSaveHandle } from "./wholeBillExport";
import {
  captureWholeBillSnapshot, billExportIsDraft, billSectionTable, billSummaryRows, wholeBillFilename,
  wholeBillPricingNotes, type WholeBillSnapshot,
} from "./wholeBillSnapshot";

export function exampleSnapshot(): WholeBillSnapshot {
  return {
    companyName: "HLC", vendorName: "NARASIMHULU", billNo: "", billDate: "2026-10-04",
    periodFrom: "2026-08-01", periodTo: "2026-10-04", site: "Kondapur", billType: "all",
    billTypeLabel: "All Types (Combined)", saved: false, status: "draft", generatedAt: "04 Oct 2026 14:23",
    sections: [{
      category: "material", subtotal: 3482.57, groups: [{
        label: "04-OCT-2026", subtotal: 3482.57,
        rows: [{
          date: "2026-10-04", category: "material", description: "GSB", qty: 14.3, unit: "MT",
          rate: 243.5364, amount: 3482.57, siteName: "SITE · Kondapur",
          suppliedTo: "HLC", vehicleNumber: "TS 07 UB 4721", receiptNumber: "RK/481",
          details: { "Physical Qty": 524, "Physical Unit": "CFT" },
        }],
      }],
    }],
    calendars: [],
    totals: {
      subtotal: 3482.57,
      gst: [{ label: "GST ON MATERIAL @ 5%", amount: 174.1285 }],
      totalGst: 174.1285,
      adjustments: [{ label: "ADVANCE DEDUCTION", amount: -172.31, reason: "Cash advance reference R-18" },
        { label: "Credit — agreed correction", amount: 42.17 }],
      tds: { label: "IT TDS @ 2%", amount: -69.6514 },
      // Deliberately non-derived input proves exports copy the screen result.
      netPayable: 3431.907100000003,
    },
  };
}
const readSheet = (book: XLSX.WorkBook, name: string) =>
  XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[name], { header: 1, defval: null });

describe("whole-bill snapshot projection", () => {
  it("detaches all clicked state, including nested calendars and unsaved edits", () => {
    const original = exampleSnapshot();
    const captured = captureWholeBillSnapshot(original);
    original.sections[0].groups[0].rows[0].rate = 877;
    original.totals.adjustments[0].reason = "changed later";
    expect(captured.sections[0].groups[0].rows[0].rate).toBe(243.5364);
    expect(captured.totals.adjustments[0].reason).toContain("R-18");
  });
  it("preserves exact supplied money values and every signed reason without deriving them", () => {
    const snapshot = exampleSnapshot();
    const rows = billSummaryRows(snapshot);
    expect(rows).toContainEqual(["NET PAYABLE", snapshot.totals.netPayable]);
    expect(rows).toContainEqual(["ADVANCE DEDUCTION", -172.31, "Cash advance reference R-18"]);
    expect(rows).toContainEqual(["IT TDS @ 2%", -69.6514, ""]);
  });
  it("exports missing rates as blank and Rate not set, without changing supplied subtotal", () => {
    const snapshot = exampleSnapshot();
    const row = snapshot.sections[0].groups[0].rows[0];
    row.rate = 0;
    row.amount = 0;
    const table = billSectionTable(snapshot.sections[0]);
    expect(table.values[1].slice(-2)).toEqual([null, "Rate not set"]);
    expect(table.values.at(-1)?.at(-1)).toBe(3482.57);
    expect(wholeBillPricingNotes(snapshot)).toEqual(["1 rows have no rate — not included in the total"]);
  });
  it("flags the concrete historic zero-rate/nonzero-amount conflict without changing money", () => {
    const snapshot = exampleSnapshot();
    snapshot.sections[0].groups[0].rows[0].rate = null;
    const before = JSON.stringify(snapshot);
    expect(wholeBillPricingNotes(snapshot)[1]).toContain("nonzero on-screen amounts");
    expect(wholeBillPricingNotes(snapshot).join(" ")).not.toContain("not included in the total");
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("allows explicitly priced zero, never converts unknown rate to a guessed number", () => {
    const snapshot = exampleSnapshot();
    snapshot.sections[0].groups[0].rows[0].rate = 0;
    snapshot.sections[0].groups[0].rows[0].priced = true;
    expect(billSectionTable(snapshot.sections[0]).values[1].at(-2)).toBe(0);
    expect(wholeBillPricingNotes(snapshot)).toEqual([]);
  });
  it.each(["draft", "verified", "approved", "paid"])("retains status %s and watermark rule", status => {
    const snapshot = { ...exampleSnapshot(), saved: true, status };
    expect(billExportIsDraft(snapshot)).toBe(status === "draft");
    expect(wholeBillFilename(snapshot, "pdf")).toContain(`_${status.toUpperCase()}.pdf`);
  });
  it("sanitizes vendor filenames and uses UNSAVED, regardless of typed bill number", () => {
    const snapshot = exampleSnapshot();
    snapshot.vendorName = 'NARA/SIM\\HULU:*?"<>|';
    snapshot.billNo = "TEMP-432";
    expect(wholeBillFilename(snapshot, "xlsx")).toBe("NARASIMHULU_2026-08-01_to_2026-10-04_UNSAVED.xlsx");
    expect(billSummaryRows(snapshot)).toContainEqual(["Bill number", "Not yet saved"]);
  });
});

describe("whole-bill workbook and PDF", () => {
  it("places Summary first and never creates empty combined category sheets", () => {
    const snapshot = exampleSnapshot();
    snapshot.sections.push({ category: "transport", subtotal: 0, groups: [] });
    expect(buildWholeBillWorkbook(snapshot).SheetNames).toEqual(["Summary", "Materials"]);
  });
  it("creates exactly two sheets for a single type, including incidental other-category rows", () => {
    const snapshot = exampleSnapshot();
    snapshot.billType = "material";
    snapshot.sections.push({ category: "other", subtotal: 0, groups: [{ label: "Missing date", subtotal: 0,
      rows: [{ ...snapshot.sections[0].groups[0].rows[0], category: "other", description: "Incidental charge" }] }] });
    const book = buildWholeBillWorkbook(snapshot);
    expect(book.SheetNames).toEqual(["Summary", "Materials"]);
    expect(readSheet(book, "Materials").flat()).toContain("Incidental charge");
  });
  it("keeps grouping/order supplied by the screen and puts sub-lines into separate columns", () => {
    const snapshot = exampleSnapshot();
    const group = snapshot.sections[0].groups[0];
    group.rows.unshift({ ...group.rows[0], description: "First row as displayed" });
    const table = billSectionTable(snapshot.sections[0]);
    expect(table.headers).toContain("Vehicle");
    expect(table.headers).toContain("Receipt");
    expect(table.headers).toContain("Physical Qty");
    expect(table.values[1][2]).toBe("First row as displayed");
    expect(table.values[2][2]).toBe("GSB");
    expect(table.values[0][2]).toBe("04-OCT-2026");
  });
  it("reuses the existing hire daily formatter inside Equipment without a third sheet", () => {
    const snapshot = exampleSnapshot();
    snapshot.billType = "equipment";
    snapshot.sections[0].category = "equipment";
    const calendar = {
      equipmentName: "JCB-SITE", periodFrom: "2026-10-04", periodTo: "2026-10-04",
      rows: [{ date: "2026-10-04", status: "Breakdown" as const, remarks: "Hydraulic seal", downtimeHours: 3.2 }],
      dieselResponsibility: "vendor",
    };
    snapshot.calendars = [calendar];
    const expected = equipmentHireActivitySheetRows(calendar.rows, calendar.dieselResponsibility);
    const book = buildWholeBillWorkbook(snapshot);
    expect(book.SheetNames).toEqual(["Summary", "Equipment"]);
    const values = readSheet(book, "Equipment");
    expect(values.some(row => JSON.stringify(row.slice(0, expected.headers.length)) === JSON.stringify(expected.headers))).toBe(true);
    expect(values.some(row => row.includes(expected.values[0].at(-1)!))).toBe(true);
  });
  it("preserves spreadsheet values as text, not executable formulas", () => {
    const snapshot = exampleSnapshot();
    snapshot.sections[0].groups[0].rows[0].description = "=HYPERLINK(\"evil\")";
    const sheet = buildWholeBillWorkbook(snapshot).Sheets.Materials;
    expect(sheet.C4.t).toBe("s");
    expect(sheet.C4.f).toBeUndefined();
  });
  it("serializes a real workbook and retains exact totals through read-back", () => {
    const snapshot = exampleSnapshot();
    const bytes = XLSX.write(buildWholeBillWorkbook(snapshot), { type: "array", bookType: "xlsx" });
    const workbook = XLSX.read(bytes, { type: "array" });
    const net = readSheet(workbook, "Summary").find(row => row[0] === "NET PAYABLE");
    expect(net?.[1]).toBe(snapshot.totals.netPayable);
  });
  it.each(["draft", "verified", "approved", "paid"])("makes paginated PDF for %s with repeat headers and correct marks", status => {
    const snapshot = exampleSnapshot();
    snapshot.saved = true;
    snapshot.status = status;
    const row = snapshot.sections[0].groups[0].rows[0];
    snapshot.sections[0].groups[0].rows = Array.from({ length: 93 }, (_, i) => ({ ...row, description: `Material delivery ${i}` }));
    const pdf = buildWholeBillPdf(snapshot);
    const text = pdf.output();
    expect(pdf.getNumberOfPages()).toBeGreaterThan(2);
    expect(text.split("HLC / VENDOR BILL").length - 1).toBe(pdf.getNumberOfPages());
    expect(text).toContain(`Status: ${status.toUpperCase()}`);
    expect(text).toContain(`Page ${pdf.getNumberOfPages()} of ${pdf.getNumberOfPages()}`);
    expect(text.includes("DRAFT - NOT A FINAL BILL")).toBe(status === "draft");
    expect(text).toContain("NET PAYABLE");
  });
});

describe("save picker and download", () => {
  it("invokes picker before generation, writes a real workbook, and leaves input unchanged", async () => {
    const snapshot = exampleSnapshot();
    const before = JSON.stringify(snapshot);
    const write = vi.fn(async (_blob: Blob) => {});
    const close = vi.fn(async () => {});
    const handle: BillSaveHandle = { createWritable: async () => ({ write, close }) };
    const picker = vi.fn(async () => handle);
    const download = vi.fn();
    const saving = saveWholeBillFile(snapshot, "xlsx", { picker, download });
    expect(picker).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    const result = await saving;
    expect(result.cancelled).toBe(false);
    expect(write.mock.calls[0][0].type).toContain("spreadsheetml");
    expect(close).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("treats user cancellation as cancellation, not an unsolicited fallback download", async () => {
    const download = vi.fn();
    const result = await saveWholeBillFile(exampleSnapshot(), "pdf", {
      picker: async () => { throw new DOMException("Cancelled", "AbortError"); }, download,
    });
    expect(result.cancelled).toBe(true);
    expect(download).not.toHaveBeenCalled();
  });
  it("falls back to a real file download when the picker is unsupported", async () => {
    const download = vi.fn();
    await saveWholeBillFile(exampleSnapshot(), "pdf", { download });
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][0].type).toBe("application/pdf");
    expect(download.mock.calls[0][1]).toMatch(/_UNSAVED.pdf$/);
  });
  it("falls back for exposed-but-restricted pickers", async () => {
    const download = vi.fn();
    await saveWholeBillFile(exampleSnapshot(), "xlsx", {
      picker: async () => { throw new DOMException("Embedded frame", "SecurityError"); }, download,
    });
    expect(download).toHaveBeenCalledOnce();
  });
  it("reports a real write failure, aborts the stream and never downloads a duplicate", async () => {
    const abort = vi.fn(async () => {});
    const download = vi.fn();
    await expect(saveWholeBillFile(exampleSnapshot(), "pdf", {
      picker: async () => ({ createWritable: async () => ({
        write: async () => { throw new Error("Disk is full"); }, close: async () => {}, abort,
      }) }), download,
    })).rejects.toThrow("Disk is full");
    expect(abort).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });
});