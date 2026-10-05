import type { BillingDailyRow } from "./EquipmentHireBillOutput";

export type BillExportCell = string | number | null;
export type BillExportRow = {
  date: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  /** null means no rate. A deliberate zero may be passed with priced: true. */
  rate: number | null;
  priced?: boolean;
  amount: number;
  siteName?: string | null;
  suppliedTo?: string | null;
  transporter?: string | null;
  vehicleNumber?: string | null;
  receiptNumber?: string | null;
  leadDistance?: number | null;
  /** Already displayed secondary facts, not newly fetched evidence. */
  details?: Record<string, BillExportCell>;
};
export type BillExportDateGroup = {
  label: string;
  rows: BillExportRow[];
  /** Exact screen subtotal; export never calculates it. */
  subtotal: number;
};
export type BillExportSection = {
  category: string;
  groups: BillExportDateGroup[];
  subtotal: number;
};
export type BillExportAdjustment = { label: string; amount: number; reason?: string };
export type BillExportCalendar = {
  equipmentName: string;
  periodFrom: string;
  periodTo: string;
  rows: BillingDailyRow[];
  dieselResponsibility?: string | null;
  consumptionNorm?: number | null;
  meterType?: string | null;
  /** Billing decisions / breakdown calendar already rendered on screen. */
  breakdown?: { headers: string[]; rows: BillExportCell[][] };
  unavailableReason?: string;
};
export type WholeBillSnapshot = {
  companyName: string;
  vendorName: string;
  billNo: string;
  billDate: string;
  periodFrom: string;
  periodTo: string;
  site: string;
  billType: string;
  billTypeLabel: string;
  saved: boolean;
  status: string;
  generatedAt: string;
  sections: BillExportSection[];
  calendars: BillExportCalendar[];
  /** All values are supplied by the current screen financial path. */
  totals: {
    subtotal: number;
    gst: BillExportAdjustment[];
    totalGst: number;
    adjustments: BillExportAdjustment[];
    tds: BillExportAdjustment;
    netPayable: number;
  };
  notes?: string;
};

export const BILL_EXPORT_TYPES = ["equipment", "material", "transport", "labour", "other"] as const;
export const BILL_EXPORT_SHEET_NAMES: Record<string, string> = {
  equipment: "Equipment", material: "Materials", transport: "Transport", labour: "Labour", other: "Other",
};
export const DRAFT_BILL_NOTICE = "DRAFT — NOT A FINAL BILL";
export const billExportStatus = (snapshot: Pick<WholeBillSnapshot, "saved" | "status">) =>
  snapshot.saved ? snapshot.status.toUpperCase() : "UNSAVED";
export const billExportIsDraft = (snapshot: Pick<WholeBillSnapshot, "saved" | "status">) =>
  !snapshot.saved || snapshot.status.toLowerCase() === "draft";
export const isBillExportPriced = (row: BillExportRow) =>
  row.priced ?? (row.rate != null && Number.isFinite(row.rate) && row.rate !== 0);
export const canExportWholeBill = (canExport: boolean, isFieldEngineer?: boolean) =>
  canExport && !isFieldEngineer;

/** Detach the clicked screen state before a save picker or file generation awaits. */
export function captureWholeBillSnapshot(snapshot: WholeBillSnapshot): WholeBillSnapshot {
  return structuredClone(snapshot);
}

export function wholeBillFilename(snapshot: WholeBillSnapshot, kind: "xlsx" | "pdf") {
  const vendor = snapshot.vendorName.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "")
    .trim().replace(/[. ]+$/g, "").replace(/\s+/g, "_") || "VENDOR";
  // Period fields are normally ISO dates; sanitize incomplete form values too.
  const date = (value: string) => value.replace(/[^0-9-]/g, "") || "NO_DATE";
  const status = billExportStatus(snapshot).replace(/[^A-Z0-9_-]/g, "");
  return `${vendor}_${date(snapshot.periodFrom)}_to_${date(snapshot.periodTo)}_${status}.${kind}`;
}

export function populatedBillSections(snapshot: WholeBillSnapshot) {
  return snapshot.sections.filter(section => section.groups.some(group => group.rows.length));
}

export function unpricedBillRows(snapshot: WholeBillSnapshot) {
  return populatedBillSections(snapshot).flatMap(section => section.groups.flatMap(group => group.rows))
    .filter(row => !isBillExportPriced(row));
}

/**
 * A7 and A3 conflict if a historical unpriced row has a nonzero stored amount.
 * Surface it without altering any amount, GST, deduction or screen total.
 */
export function wholeBillPricingNotes(snapshot: WholeBillSnapshot): string[] {
  const missing = unpricedBillRows(snapshot);
  if (!missing.length) return [];
  const conflicts = missing.filter(row => row.amount !== 0);
  return conflicts.length
    ? [
        `${missing.length} rows have no rate.`,
        `Screen totals retained unchanged: ${conflicts.length} unpriced rows carry nonzero on-screen amounts. These totals cannot be described as excluding those rows.`,
      ]
    : [`${missing.length} rows have no rate — not included in the total`];
}

export function billSummaryRows(snapshot: WholeBillSnapshot): BillExportCell[][] {
  return [
    ["Company", snapshot.companyName], ["Vendor", snapshot.vendorName],
    ["Bill number", snapshot.saved ? snapshot.billNo : "Not yet saved"],
    ["Bill date", snapshot.billDate], ["Period from", snapshot.periodFrom], ["Period to", snapshot.periodTo],
    ["Site", snapshot.site], ["Bill type", snapshot.billTypeLabel],
    ["Status", snapshot.saved ? snapshot.status.toUpperCase() : "Unsaved"],
    ["Generated", snapshot.generatedAt],
    ...(billExportIsDraft(snapshot) ? [[DRAFT_BILL_NOTICE]] : []),
    [],
    ...(snapshot.billType === "all"
      ? populatedBillSections(snapshot).map(section => [BILL_EXPORT_SHEET_NAMES[section.category] || section.category, section.subtotal])
      : []),
    ["SUB-TOTAL", snapshot.totals.subtotal],
    ...snapshot.totals.gst.map(row => [row.label, row.amount, row.reason || ""]),
    ["TOTAL GST", snapshot.totals.totalGst],
    ...snapshot.totals.adjustments.map(row => [row.label, row.amount, row.reason || ""]),
    [snapshot.totals.tds.label, snapshot.totals.tds.amount, snapshot.totals.tds.reason || ""],
    ["NET PAYABLE", snapshot.totals.netPayable],
    ...wholeBillPricingNotes(snapshot).map(note => [note]),
    ...(snapshot.notes ? [["Notes / Remarks", snapshot.notes]] : []),
  ];
}

export const BILL_LINE_HEADERS = [
  "Date", "Type", "Description", "Site", "Supplied To", "Transporter", "Vehicle", "Receipt", "Lead (KM)",
];
export const BILL_LINE_END_HEADERS = ["Qty", "Unit", "Rate", "Amount"];

export function billSectionTable(section: BillExportSection) {
  const details = Array.from(new Set(section.groups.flatMap(group => group.rows.flatMap(row => Object.keys(row.details || {})))));
  const headers = [...BILL_LINE_HEADERS, ...details, ...BILL_LINE_END_HEADERS];
  const amountIndex = headers.length - 1;
  const subtotalRow = (label: string, amount: number): BillExportCell[] => {
    const row: BillExportCell[] = Array(headers.length).fill(null);
    row[2] = label;
    row[amountIndex] = amount;
    return row;
  };
  const values: BillExportCell[][] = [];
  for (const group of section.groups) {
    if (!group.rows.length) continue;
    values.push(subtotalRow(group.label, group.subtotal));
    for (const row of group.rows) {
      const priced = isBillExportPriced(row);
      values.push([
        row.date, BILL_EXPORT_SHEET_NAMES[row.category] || row.category, row.description,
        row.siteName || "", row.suppliedTo || "", row.transporter || "", row.vehicleNumber || "", row.receiptNumber || "",
        row.leadDistance ?? null,
        ...details.map(key => row.details?.[key] ?? null),
        row.qty, row.unit, priced ? row.rate : null, priced ? row.amount : "Rate not set",
      ]);
    }
  }
  values.push(subtotalRow(`${BILL_EXPORT_SHEET_NAMES[section.category] || section.category} TOTAL`, section.subtotal));
  return { headers, values };
}