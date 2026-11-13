export type MaterialReceiptSlipData = {
  kind: "plant" | "site";
  id: number;
  createdAt?: string | Date | null;
  enteredByUserName?: string | null;
  date: string;
  time?: string | null;
  materialName: string;
  quantity: number | string;
  uom: string;
  plantName?: string | null;
  partyName?: string | null;
  site?: string | null;
  location?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  receivedByName?: string | null;
  supplier?: string | null;
  transporter?: string | null;
  materialSourceType?: string | null;
  materialSourceSupplier?: string | null;
  materialSourceLabel?: string | null;
  challanNumber?: string | null;
  receiptNumber?: string | null;
  receiptNo?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  tankNumber?: number | null;
  enteredBy?: string | null;
  conversionFactor?: number | string | null;
  conversionFromUom?: string | null;
  conversionToUom?: string | null;
  bulkDensity?: number | string | null;
  latestEditAt?: string | Date | null;
  slipSharedAt?: string | Date | null;
  slipSharedByUserName?: string | null;
  slipSendWindowOpen?: boolean;
  slipSendTrackingEnabled?: boolean;
};

export type MaterialReceiptSlipCompany = {
  name: string;
  shortName?: string | null;
  defaultPlantName?: string | null;
  address?: string | null;
  gstin?: string | null;
  phone?: string | null;
};

export function formatEnteredByDisplay(name?: string | null, createdAt?: string | Date | null): string {
  if (!name?.trim() || !createdAt) return "—";
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  const timestamp = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
  return `Entered by ${name.trim()} · ${timestamp}`;
}
