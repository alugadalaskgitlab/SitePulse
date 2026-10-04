import fs from "node:fs/promises";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { buildVendorPayablesPreview } from "../server/vendorPayablesPreview";
import { buildPayablesPreviewWorkbook, buildPayablesPreviewPdf } from "../client/src/components/vendor-bills/payablesPreviewExport";

// Defense in depth: every connection used by the real storage methods rejects
// writes. This script does not import application startup/migration code.
assert.equal(process.env.NODE_ENV, "development");
assert.ok(process.env.DEV_DATABASE_URL);
assert.equal(pool.totalCount, 0);
pool.options.options = "-c default_transaction_read_only=on";
const out = ".agents/outputs/vb-payables-preview";
try {
  assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name, "sitelog_dev");
  const vendors = [...new Set((await storage.getVendorBills()).map(b => b.vendorName))];
  const summaries: unknown[] = [];
  let selected: Awaited<ReturnType<typeof buildVendorPayablesPreview>> | undefined;
  for (const vendorName of vendors) {
    const preview = await buildVendorPayablesPreview(storage, {
      vendorName, periodFrom: "2026-01-01", periodTo: "2026-10-04",
    }, { permittedSiteNames: null, siteId: null, siteName: null });
    const activeCategories = preview.categories.filter(c => c.items.length);
    summaries.push({ vendorName, categories: activeCategories.map(c => c.category), excluded: preview.excludedCount,
      items: activeCategories.reduce((sum, c) => sum + c.items.length, 0), hireGroups: preview.hireGroups.length });
    if (!selected || activeCategories.length > selected.categories.filter(c => c.items.length).length) selected = preview;
  }
  assert.ok(selected);
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(`${out}/live-preview.json`, JSON.stringify(selected, null, 2));
  const workbook = buildPayablesPreviewWorkbook(selected);
  assert.deepEqual(workbook.SheetNames, ["Summary", "Equipment hire", "Materials", "Transport", "Labour", "Other"]);
  await fs.writeFile(`${out}/live-payables-preview.xlsx`, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  const pdf = buildPayablesPreviewPdf(selected);
  const pdfBytes = Buffer.from(pdf.output("arraybuffer"));
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  await fs.writeFile(`${out}/live-payables-preview.pdf`, pdfBytes);
  await fs.writeFile(`${out}/live-readonly-verification.json`, JSON.stringify({
    environment: "development", writeProtection: "PostgreSQL default_transaction_read_only=on on all service connections",
    businessWritesAttempted: false, selectedVendor: selected.vendorName, generatedAt: selected.generatedAt,
    sheets: workbook.SheetNames, pdfPages: pdf.getNumberOfPages(), vendors: summaries,
  }, null, 2));
  console.log(JSON.stringify({ vendorsChecked: vendors.length, selectedVendor: selected.vendorName,
    categoryCounts: selected.categories.map(c => ({ category: c.category, count: c.items.length })),
    excluded: selected.excludedCount, sheets: workbook.SheetNames, pdfPages: pdf.getNumberOfPages() }, null, 2));
} finally {
  await pool.end();
}