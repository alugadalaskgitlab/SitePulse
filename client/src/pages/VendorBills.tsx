import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CancelDialog from "@/components/CancelDialog";
import HistoryDialog from "@/components/HistoryDialog";
import { Link, useLocation } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, FileText, Printer, ArrowRight, Check, Circle, Info, Fuel, Settings, Copy, X, Download, Search, Edit, PlusCircle, BarChart2, Calculator, History } from "lucide-react";
import { queryClient, apiRequest, isForbiddenError, NO_PERMISSION_DESCRIPTION } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { vendorBillStatusError } from "@/lib/vendorBillStatusError";
import { vendorBillingIdentityLabel, type VendorBillingIdentity } from "@/components/vendor-bills/vendorBillingIdentityLabel";
import { hasCumulativeVendorPayment } from "@shared/vendorBillPayment";
import { hasFrozenTripDailyHire, FROZEN_TRIP_DAILY_MESSAGE } from "@shared/vendorBillRecovery";
export { hasCumulativeVendorPayment } from "@shared/vendorBillPayment";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { format } from "date-fns";
import type { VendorBillWithItems, VendorAlias, Site, AuditLog } from "@shared/schema";
import { siteMatchesPermitted } from "@shared/siteName";
import { filterFinancialBills, billPaymentPosition, getBillFinancialTotals, type BillScope } from "@shared/vendorBillFinancialReport";
import { VendorBillTaxesSummary } from "@/components/vendor-bills/VendorBillTaxesSummary";
import { defaultConvertedQuantity, isDifferentBillingUnit, matchingRateCardsForGroup, normalizeRateCardPart, selectAutoMaterialRateConversion, type RateCardUnitOption, type VendorRateCardRecord } from "@/lib/vendorBillRateSelection";
import { autoBillItemIdentity, availableOtherBillItems, buildHireActivityDays, calculateEquipmentHireFinancials, calculateHireGroup, duplicateBillItemPayload, mergeOtherBillItems, monthlyHireSegments, normalizeHireActivities, rawAutoItemCoveredByHireGroup, uniqueDuplicateBillMatches, type DuplicateBillItemMatch, type HireActivity, type HireBillingBasis } from "@shared/hireBilling";
import { calculationTermsForBill as savedCalculationTermsForBill, type BillHireTerms } from "@/components/vendor-bills/hireBillTerms";
import type { EquipmentPerformanceReport } from "@shared/equipmentPerformance";
import { vendorHireEquipmentLabel as formatEquipmentOptionLabel } from "@/components/trip-master-selection";
import { authoritativeDieselPeriodFromFleet, hasIncludedOperationalTripOnSameDay, initialVendorBillPaidAmount, isPerformanceReadyForHireSubmission } from "@/components/vendor-bills/equipmentHireUi";
import {
  buildBillingDailyRows,
  buildSavedEquipmentHireBillOutput,
  EquipmentHireDailyActivity,
  EquipmentHireBillDetailOutput,
  EquipmentHireExportButtons,
  exportEquipmentHireBill,
  type EquipmentHireExportData,
} from "@/components/vendor-bills/EquipmentHireBillOutput";
import DraftEquipmentHireCalendar, { SavedEquipmentCalendarExport } from "@/components/vendor-bills/DraftEquipmentHireCalendar";
import SavedBillCalendars from "@/components/vendor-bills/SavedBillCalendars";
import { projectBillHireReviews, projectHireReview } from "@shared/vendorBillLayout";
import { buildSavedBillPresentationRows } from "@shared/vendorBillPresentation";
import { VendorBillFinancialSummary, VendorRunningStatement } from "@/components/vendor-bills/VendorBillReview";
import HireActivityBreakdownCalendar, { hireActivityBreakdownSheetRows } from "@/components/vendor-bills/HireActivityBreakdownCalendar";
import WholeBillExportButtons from "@/components/vendor-bills/WholeBillExportButtons";
import EquipmentLogFacts from "@/components/vendor-bills/EquipmentLogFacts";
import { mapAutoBillItemWithEvidence, type EquipmentLogEvidence } from "@/components/vendor-bills/equipmentLogEvidence";
import { useWholeBillCalendarSnapshots } from "@/components/vendor-bills/useWholeBillCalendarSnapshots";
import { displayedHireTotals, historicalHireSheetRows, projectVendorBillPageItems } from "@/components/vendor-bills/wholeBillPageProjection";
import type { WholeBillSnapshot } from "@/components/vendor-bills/wholeBillSnapshot";
import { BillDateGroupControls, BillDateGroupRows } from "@/components/vendor-bills/BillDateGroups";
import { isTrulyBlankManualBillRow } from "@/lib/vendorBillBlankRows";
import RateCards from "@/pages/RateCards";
import { applyTransportCard, changeTransportBasis } from "@shared/vendorBillTransport";
import { TransportPricingRow } from "@/components/vendor-bills/TransportPricingRow";
import { UnconfirmedTripOffers, TransportPricingNote } from "@/components/vendor-bills/TripCandidateWarnings";
import { arrangementWorking, type ArrangementPricing } from "@shared/vendorBillArrangement";
import { billableTripCandidates, isUnconfirmedTrip, isSiteTripTransport } from "@/components/vendor-bills/tripCandidateSafety";
import { calcCandidateAmount, groupRateItems, stripSourceSuffix, canonicalMachineName, canonicalTransportName, canonicalMatName, deriveLabourKey, type RateGroup as SharedRateGroup } from "@shared/vendorBillCandidates";

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
    if (Number.isNaN(d.getTime())) return dateStr;
    return format(d, "dd-MMM-yyyy").toUpperCase();
  } catch { return dateStr; }
};

const formatTimestamp = (ts: string | Date | null | undefined): string => {
  if (!ts) return "date and time not recorded";
  try {
    let d: Date;
    if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) {
      d = new Date(`${ts}T00:00:00`);
      if (Number.isNaN(d.getTime()) || format(d, "yyyy-MM-dd") !== ts) return "date and time not recorded";
      return `${format(d, "dd-MMM-yy")} · time not recorded`;
    }
    if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(ts)) {
      d = new Date(ts.replace(" ", "T") + "Z");
    } else {
      d = new Date(ts as string);
    }
    if (Number.isNaN(d.getTime())) return "date and time not recorded";
    return format(d, "dd-MMM-yy HH:mm");
  } catch { return "date and time not recorded"; }
};

type ViewMode = "list" | "form" | "detail";

interface LineItem {
  rolesUnconfirmed?: boolean;
  tripId?: number | null;
  roleWarning?: string | null;
  transportPricingNote?: string | null;
  arrangementPricing?: ArrangementPricing | null;
  transportPricing?: import("@shared/vendorBillTransport").TransportPricing | null;
  actualMt?: number | null;
  equipmentLogEvidence?: EquipmentLogEvidence | null;
  date: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  source: string;
  sourceType?: string | null;
  sourceId?: number | string | null;
  equipmentId: number | null;
  leadDistance: number | null;
  siteName?: string | null;
  billedIn?: { billNo: string; billStatus: string } | null;
  suppliedTo?: string | null;
  transporter?: string | null;
  vehicleNumber?: string | null;
  receiptNumber?: string | null;
  initialBlank?: boolean;
  vendorName?: string | null;
  physicalQuantity?: number;
  physicalUnit?: string;
  unitRateWarning?: string;
}

type AdditionalAdjustment = { label: string; amount: number };

/**
 * Older bills have no additional_adjustments value (and the additive backend
 * column is nullable), so keep all readers tolerant of null/undefined while
 * always giving the editor a stable array to work with.
 */
function normalizeAdditionalAdjustments(value: unknown): AdditionalAdjustment[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry: any) => ({
    label: String(entry?.label ?? entry?.reason ?? ""),
    amount: Number.isFinite(Number(entry?.amount)) ? Number(entry.amount) : 0,
  }));
}

function billAdditionalAdjustments(bill: any): AdditionalAdjustment[] {
  return normalizeAdditionalAdjustments(bill?.additionalAdjustments ?? bill?.additional_adjustments);
}

const categoryOrder: Record<string, number> = { equipment: 0, material: 1, transport: 2, labour: 3, other: 4 };

const isAutoLineSource = (source: string) => source === "auto" || source.startsWith("auto:");
const isGeneratedEvidenceLine = (source: string) =>
  isAutoLineSource(source) || ["hire_group", "hire_statement"].includes(source);

/**
 * Keep the banner preflight and the authoritative post-conversion check on
 * the same source-qualified projection. The latter receives `mapped`, so it
 * checks the exact candidates that will be merged after pull-time conversion.
 */
function sourceQualifiedDuplicateBillItemPayload(item: LineItem) {
  return {
    ...duplicateBillItemPayload(item),
    source: item.source,
    sourceType: item.sourceType ?? null,
    sourceId: item.sourceId ?? null,
  };
}

type HireDecision = { date: string; decision: "full_day" | "half_day" | "exclude"; reason?: string };
type HireGroup = BillHireTerms & {
  id: string; hireStatementId?: number; equipmentId: number; periodFrom: string; periodTo: string;
  basis: HireBillingBasis; rate: number; quantityOverride?: number;
  includeInBill?: boolean;
  grossAmountOverride?: number; dailyDecisions: HireDecision[];
  tripDecisions: { source: "dpr_log" | "plant_usage" | "site_material_trip" | "bulk_transport_trip"; sourceId: number; selected?: boolean; correctedTrips?: number; remarks?: string; separateFromOperational?: boolean }[];
  exceptionDecisions: any[]; dieselNormOverride?: number; dieselNormBasisOverride?: string;
  dieselRecoveryDecision?: "accept" | "edit" | "ignore"; dieselRecoveryFinalAmount?: number; dieselRecoveryRemarks?: string;
  breakdownHoursPerDay?: number; breakdownGraceDays?: number;
  projectSite?: string;
  adjustments?: { otherDebit?: number; otherDebitReason?: string; advanceAdjustment?: number; advanceAdjustmentReason?: string; otherCredit?: number; otherCreditReason?: string };
};

const HIRE_BASIS_LABELS: Record<HireBillingBasis, string> = {
  monthly: "Monthly Hire Available",
  daily: "Daily Hire Available",
  trip: "Trip Hire Available",
  hourly: "Hourly Hire Available",
};
// New bill previews use the restored Master contract; historical selections
// continue to use saved bill-specific terms rather than today's Master values.
function calculationTermsForBill(group: HireGroup, equipment: any) {
  if (group.hireStatementId) return savedCalculationTermsForBill(group, equipment);
  return {
    billingBasis: group.basis, rate: group.rate,
    hireStartDate: equipment.hireStartDate, hireEndDate: equipment.hireEndDate,
    monthlyDivisorType: equipment.hireMonthlyDivisorType || "30",
    monthlyDivisor: equipment.hireMonthlyDivisor,
    dieselResponsibility: equipment.hireDieselResponsibility,
    breakdownDeductionEnabled: !!equipment.hireBreakdownDeductionEnabled,
  };
}
const validHireDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const BILL_TYPES = [
  { value: "equipment", label: "EQUIPMENT HIRE" },
  { value: "material", label: "MATERIAL SUPPLY" },
  { value: "transport", label: "TRANSPORT" },
  { value: "labour", label: "LABOUR" },
  { value: "all", label: "All Types (Combined)" },
  { value: "other", label: "OTHER / MISCELLANEOUS" },
];
const FRESH_BILL_TYPE = "all";

const LINE_ITEM_UNITS = ["HRS", "DAYS", "TRIP", "TRIPS", "MT", "KL", "NOS", "KGS", "LITERS", "CFT", "CUM", "MONTHS", "KM", "HEAD-DAY"];

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case "equipment": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300";
    case "material": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300";
    case "transport": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300";
    case "labour": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-300";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-300";
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "equipment": return "EQUIP";
    case "material": return "MATL";
    case "transport": return "TRNS";
    case "labour": return "LABOUR";
    default: return "OTHER";
  }
}


function extractDiesel(description: string): number {
  const match = description.match(/DIESEL:\s*(\d+(?:\.\d+)?)L/i);
  return match ? parseFloat(match[1]) : 0;
}

/** Mirrors the server's period tank reconciliation for the review preview. */
function hclMonthlyDieselPeriod(activities: readonly any[], equipment: any) {
  const periodActivities = normalizeHireActivities(activities as HireActivity[])
    .filter(row => (!equipment?.hireStartDate || row.businessDate >= equipment.hireStartDate) &&
      (!equipment?.hireEndDate || row.businessDate <= equipment.hireEndDate))
    .sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate) || String(a.occurredAt || "").localeCompare(String(b.occurredAt || "")));
  const runtime = periodActivities.reduce((sum, row: any) => sum + Math.max(0, Number(row.hoursOrKmRun) || 0), 0);
  const expectedDiesel = Number.isFinite(Number(equipment?.consumptionNorm))
    ? Math.round(runtime * Number(equipment.consumptionNorm) * 100) / 100 : null;
  const stockRows = periodActivities.filter((row: any) => String(row.dieselSource || "").toLowerCase() === "plant_stock");
  const opening = stockRows.length ? Number((stockRows[0] as any).openingDiesel) : NaN;
  const closing = stockRows.length ? Number((stockRows.at(-1) as any).closingDiesel) : NaN;
  const actualDiesel = stockRows.length && Number.isFinite(opening) && opening >= 0 && Number.isFinite(closing) && closing >= 0 &&
    stockRows.every((row: any) => Number.isFinite(Number(row.actualDiesel)))
    ? Math.round(Math.max(0, opening + stockRows.reduce((sum, row: any) => sum + Number(row.actualDiesel || 0), 0) - closing) * 100) / 100
    : null;
  const reliable = String(equipment?.hireDieselResponsibility || "").toLowerCase() === "hlc" && actualDiesel != null && expectedDiesel != null;
  return { actualDiesel, expectedDiesel, difference: reliable ? actualDiesel! - expectedDiesel! : null, reliable, dailyRows: [] };
}

function inferSiteNameFromDescription(description: string | undefined, existingSiteName: string | null | undefined): string | null {
  if (existingSiteName) return existingSiteName;
  if (!description) return null;
  const d = description.toUpperCase();
  if (d.includes("(SITE-UNLINKED)")) return "SITE*";
  if (d.includes("(SITE TRIP)")) return "SITE: TRIP";
  if (d.includes("(PLANT)")) return "PLANT";
  if (d.includes("(SITE)")) return "SITE";
  return null;
}

function parseSiteBadge(item: { siteName?: string | null; description?: string }): { type: "site" | "plant" | "site-unlinked"; label: string } | null {
  const resolved = inferSiteNameFromDescription(item.description, item.siteName);
  if (!resolved) return null;
  const sn = resolved.toUpperCase();
  if (sn === "PLANT") return { type: "plant", label: "PLANT" };
  if (sn.startsWith("PLANT:") || sn.startsWith("PLANT ")) {
    const name = sn.replace(/^PLANT[:\s]\s*/, "").trim();
    return { type: "plant", label: name ? `PLANT · ${name}` : "PLANT" };
  }
  if (sn.startsWith("SITE*")) {
    const name = sn.replace(/^SITE\*:?\s*/, "").trim();
    return { type: "site-unlinked", label: name ? `SITE* · ${name}` : "SITE*" };
  }
  if (sn.startsWith("SITE")) {
    const name = sn.replace(/^SITE:?\s*/, "").trim();
    return { type: "site", label: name ? `SITE · ${name}` : "SITE" };
  }
  return { type: "site", label: sn };
}

function getLabourSource(item: { siteName?: string | null; description?: string; category?: string }): "plant" | "site" | "other" {
  const resolved = inferSiteNameFromDescription(item.description, item.siteName);
  if (!resolved) return "other";
  const sn = resolved.toUpperCase();
  if (sn === "PLANT" || sn.startsWith("PLANT:") || sn.startsWith("PLANT ")) return "plant";
  if (sn.startsWith("SITE")) return "site";
  return "other";
}

function getSiteBadgeClass(type: "site" | "plant" | "site-unlinked"): string {
  switch (type) {
    case "site": return "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700";
    case "plant": return "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700";
    case "site-unlinked": return "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700";
  }
}

type RateGroup<T extends Pick<LineItem, "category" | "description" | "unit" | "equipmentId"> = LineItem> = SharedRateGroup<T>;

type BulkRateSelection = {
  rate: number;
  leadDistance: number;
  targetUnit: string;
  unitOptions: RateCardUnitOption[];
};

const STATUS_ORDER = ["draft", "verified", "approved", "paid"] as const;

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "voided": return "bg-red-600 text-white border-red-700";
    case "draft": return "bg-amber-500 text-white border-amber-600";
    case "verified": return "bg-emerald-600 text-white border-emerald-700";
    case "approved": return "bg-indigo-600 text-white border-indigo-700";
    case "paid": return "bg-blue-600 text-white border-blue-700";
    default: return "bg-gray-500 text-white border-gray-600";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "draft": return "text-amber-600 dark:text-amber-400";
    case "verified": return "text-emerald-600 dark:text-emerald-400";
    case "approved": return "text-indigo-600 dark:text-indigo-400";
    case "paid": return "text-blue-600 dark:text-blue-400";
    default: return "";
  }
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "0.00";
  return Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(qty: number | null | undefined) {
  if (qty == null) return "0.00";
  return Number(qty).toFixed(2);
}

function getBillTypeLabel(type: string) {
  return BILL_TYPES.find(t => t.value === type.toLowerCase())?.label || type.toUpperCase();
}

// 06M-A: Payment Mode / Paid By on a vendor bill — same option semantics as
// PI/diesel. Entry preferred once the bill is PAID; values display read-only
// otherwise. Deliberately NO payment evidence / QR / screenshot upload.
const VB_MODE_LABELS: Record<string, string> = { cash: "CASH", credit: "CREDIT", advance: "ADVANCE", upi: "UPI", cheque: "CHEQUE", rtgs: "RTGS / NEFT" };

function useVendorBillCompanyAccounts(enabled: boolean, paymentAccountKey?: string | null) {
  const query = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: ["/api/vendor-bills/company-accounts"],
    queryFn: () => fetch("/api/vendor-bills/company-accounts", { credentials: "include" }).then(async response => {
      if (!response.ok) throw new Error((await response.text()) || "Could not load company accounts");
      return response.json();
    }),
    enabled,
  });
  return { ...query, selectedAccount: query.data?.find(account => account.id === paymentAccountKey) };
}

export function VendorBillPaidAccount({ paymentAccountKey }: { paymentAccountKey?: string | null }) {
  const { selectedAccount } = useVendorBillCompanyAccounts(!!paymentAccountKey, paymentAccountKey);
  return selectedAccount ? (
    <span data-testid="status-paid-account" className="text-[12px] font-medium text-muted-foreground whitespace-nowrap leading-tight">{selectedAccount.name}</span>
  ) : null;
}

export function VendorBillPaymentDetails({ bill, canEditPayment }: { bill: any; canEditPayment: boolean }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<string>(bill.paymentMode || "");
  const [paidByKind, setPaidByKind] = useState<"" | "company" | "personal">(
    !bill.paidBy ? "" : bill.paidBy === "company" ? "company" : "personal");
  const [payerName, setPayerName] = useState<string>(
    bill.paidBy && bill.paidBy !== "company" && bill.paidBy !== "PERSONAL" ? bill.paidBy : "");
  const [amountPaid, setAmountPaid] = useState<string>(() => initialVendorBillPaidAmount(bill));
  const [paymentAccountKey, setPaymentAccountKey] = useState<string>(bill.paymentAccountKey || "");
  const isEquipmentHire = hasCumulativeVendorPayment(bill.billType);
  const accountsQuery = useVendorBillCompanyAccounts(
    isEquipmentHire && ((editing && paidByKind === "company") || !!bill.paymentAccountKey),
    bill.paymentAccountKey,
  );
  const netPayable = bill.netPayableAmount != null ? Number(bill.netPayableAmount) : Number(bill.totalAmount || 0);
  // A Paid status is not evidence of the cash/bank amount. Display only the
  // recorded cumulative figure; keep the existing payment-entry workflow.
  const effectivePaid = bill.amountPaid != null && bill.amountPaid !== "" && Number.isFinite(Number(bill.amountPaid))
    ? Number(bill.amountPaid) : null;
  const selectedAccount = accountsQuery.selectedAccount;

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/vendor-bills/${bill.id}/payment-details`, {
      paymentMode: mode || null,
      paidBy: paidByKind === "" ? null : paidByKind === "company" ? "company" : (payerName.trim() ? payerName.trim().toUpperCase() : "PERSONAL"),
      ...(isEquipmentHire ? { amountPaid: amountPaid === "" ? 0 : Number(amountPaid) } : {}),
       ...(isEquipmentHire ? { paymentAccountKey: paidByKind === "company" ? paymentAccountKey || null : null } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: [`/api/vendor-bills/${bill.id}`] });
      toast({ title: "Payment details saved" });
      setEditing(false);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save payment details",
        description: isForbiddenError(err) ? NO_PERMISSION_DESCRIPTION : err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="border-t pt-4" data-testid="section-payment-details">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Payment Details</p>
        {canEditPayment && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit-payment-details">
            <Edit className="w-3 h-3 mr-1" /> {bill.paymentMode || bill.paidBy ? "EDIT" : "ADD"}
          </Button>
        )}
      </div>
      {!editing ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" data-testid="badge-vb-payment-mode">
            MODE: {bill.paymentMode ? (VB_MODE_LABELS[bill.paymentMode] || String(bill.paymentMode).toUpperCase()) : "\u2014"}
          </Badge>
          <Badge variant="outline" data-testid="badge-vb-paid-by">
            PAID BY: {!bill.paidBy ? "\u2014" : bill.paidBy === "company" ? "COMPANY ACCOUNT" : `PERSONAL${bill.paidBy !== "PERSONAL" ? ` \u2014 ${bill.paidBy}` : ""}`}
          </Badge>
          {isEquipmentHire && <>
            <Badge variant="outline">PAID: {effectivePaid == null ? "—" : `₹${formatCurrency(effectivePaid)}`}</Badge>
            <Badge variant="outline">BALANCE THIS BILL: {effectivePaid == null ? "—" : `₹${formatCurrency(netPayable - effectivePaid)}`}</Badge>
          </>}
          {selectedAccount && <Badge variant="outline">ACCOUNT: {selectedAccount.name}</Badge>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Payment Mode</p>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger data-testid="select-vb-payment-mode"><SelectValue placeholder="SELECT MODE" /></SelectTrigger>
              <SelectContent>
                {Object.entries(VB_MODE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Paid By</p>
            <Select value={paidByKind} onValueChange={(v) => setPaidByKind(v as any)}>
              <SelectTrigger data-testid="select-vb-paid-by"><SelectValue placeholder="SELECT PAYER" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">COMPANY ACCOUNT</SelectItem>
                <SelectItem value="personal">PERSONAL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paidByKind === "personal" && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Payer Name</p>
              <Input
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                onBlur={(e) => setPayerName(e.target.value.toUpperCase())}
                placeholder="WHO PAID?"
                className="uppercase"
                data-testid="input-vb-payer-name"
              />
            </div>
          )}
          {paidByKind === "company" && isEquipmentHire && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Bank / Account</p>
              <Select value={paymentAccountKey} onValueChange={setPaymentAccountKey}>
                <SelectTrigger data-testid="select-vb-payment-account"><SelectValue placeholder="SELECT ACCOUNT" /></SelectTrigger>
                <SelectContent>
                  {(accountsQuery.data || []).map(account => <SelectItem key={account.id} value={account.id}>{account.name} · {account.type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {isEquipmentHire && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Paid This Bill (cumulative ₹)</p>
              <Input type="number" min="0" max={netPayable} step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} data-testid="input-vb-amount-paid" />
              <p className="mt-1 text-[10px] text-muted-foreground">Net payable ₹{formatCurrency(netPayable)} · balance ₹{formatCurrency(Math.max(0, netPayable - Number(amountPaid || 0)))}</p>
            </div>
          )}
          <div className="sm:col-span-3 flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} data-testid="button-cancel-payment-details">CANCEL</Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-payment-details">
              {saveMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} SAVE
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VendorBills() {
  const [, setLocation] = useLocation();
  const [billScope, setBillScope] = useState<BillScope>("unpaid");
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "stock" });
  const { sectionCan, sectionVisible, isAdmin, user } = useAuth();
  const canViewFinancials = sectionCan("vendor_financials", "view");
  useEffect(() => {
    if (!canViewFinancials) queryClient.removeQueries({ predicate: query =>
      (query.queryKey[0] === "/api/vendor-bills" && query.queryKey[1] === "financial-review") ||
      (query.queryKey[0] === "/api/vendor-bills" && query.queryKey[2] === "statement") });
  }, [canViewFinancials]);
  const financialReview = useQuery<VendorBillWithItems[]>({
    queryKey: ["/api/vendor-bills", "financial-review", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/vendor-bills/financial-review", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Financial information is not available.");
      return response.json();
    },
    enabled: canViewFinancials,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  const { companyName, logoFile } = useFeatureFlags();
  const canCreate = sectionCan("vendor_bills", "create") || sectionCan("vendor_bills_raise", "create");
  const canEdit = sectionCan("vendor_bills", "edit") || sectionCan("vendor_bills_verify", "edit") || sectionCan("vendor_bills_approve", "edit");
  const canViewBills = sectionVisible("vendor_bills") || sectionVisible("vendor_bills_view");
  const canDelete = !!user?.isOwner;
  const canVoid = !!user?.isOwner;
  // 06M-A: payment details use the SAME capability the server enforces for
  // the payment-details PATCH and for marking a bill paid (approve on
  // vendor_bills_approve) — never show an edit control a 403 would reject.
  const canMarkPaid = isAdmin || sectionCan("vendor_bills_approve", "approve");
  const canExport = sectionCan("vendor_bills", "export") || sectionCan("vendor_bills_view", "export");

  const [view, setView] = useState<ViewMode>("list");
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const requestedReturnTo = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("returnTo") : null;
  const payablesReturnTo = requestedReturnTo === "/reports/vendor-payables" || requestedReturnTo?.startsWith("/reports/vendor-payables/")
    ? requestedReturnTo
    : null;
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("billId"));
    if (Number.isSafeInteger(id) && id > 0) { setSelectedBillId(id); setView("detail"); }
  }, []);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [editingBillStatus, setEditingBillStatus] = useState("draft");
  const [editingBillOriginalNo, setEditingBillOriginalNo] = useState("");
  const { rememberCalendar, readCalendars } = useWholeBillCalendarSnapshots();
  const renderedHireOutputs = useRef(new Map<string, EquipmentHireExportData>());
  const [historicalHireBillId, setHistoricalHireBillId] = useState<number | null>(null);
  const _vbSp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const mgmtReportSite = _vbSp?.get("from") === "management-report" ? (_vbSp?.get("site") || null) : null;

  const VB_FILTER_URL_KEYS = ["dateFrom", "dateTo", "site"];
  const vbUrlHasFilterParams = VB_FILTER_URL_KEYS.some((k) => _vbSp?.has(k));
  const vbUrlFilterDefaults = vbUrlHasFilterParams ? {
    dateFrom: _vbSp?.get("dateFrom") ?? "",
    dateTo: _vbSp?.get("dateTo") ?? "",
    site: _vbSp?.get("site") ?? "",
  } : {};

  const [vbFilters, setVbFilters, resetVbFilters] = usePersistedFilters(
    "vendor-bills:filters:v1",
    {
      dateFrom: "",
      dateTo: "",
      vendor: "all",
      status: "all",
      category: "all",
      party: "all",
      site: "",
      ...vbUrlFilterDefaults,
    },
    { shouldHydrate: !vbUrlHasFilterParams },
  );

  const filterDateFrom = vbFilters.dateFrom;
  const filterDateTo = vbFilters.dateTo;
  const filterVendor = vbFilters.vendor;
  const filterStatus = vbFilters.status;
  const filterCategory = vbFilters.category;
  const filterParty = vbFilters.party;
  const filterSite = vbFilters.site;

  const setFilterDateFrom = (v: string) => setVbFilters((f) => ({ ...f, dateFrom: v }));
  const setFilterDateTo = (v: string) => setVbFilters((f) => ({ ...f, dateTo: v }));
  const setFilterVendor = (v: string) => setVbFilters((f) => ({ ...f, vendor: v }));
  const setFilterStatus = (v: string) => setVbFilters((f) => ({ ...f, status: v }));
  const setFilterCategory = (v: string) => setVbFilters((f) => ({ ...f, category: v }));
  const setFilterParty = (v: string) => setVbFilters((f) => ({ ...f, party: v }));
  const setFilterSite = (v: string) => setVbFilters((f) => ({ ...f, site: v }));

  const [billDate, setBillDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [billNo, setBillNo] = useState("");
  const [billType, setBillType] = useState(FRESH_BILL_TYPE);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [vendorName, setVendorName] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [notes, setNotes] = useState("");
  const defaultManualItem: LineItem = { date: "", category: "equipment", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null, suppliedTo: null, transporter: null, initialBlank: true };
  const [lineItems, setLineItems] = useState<LineItem[]>(isAdmin ? [defaultManualItem] : []);
  const [adjustmentLabel, setAdjustmentLabel] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [additionalAdjustments, setAdditionalAdjustments] = useState<AdditionalAdjustment[]>([]);
  const [gstRateEquipment, setGstRateEquipment] = useState<number>(0);
  const [gstRateMaterial, setGstRateMaterial] = useState<number>(0);
  const [gstRateTransport, setGstRateTransport] = useState<number>(0);
  const [gstRateLabour, setGstRateLabour] = useState<number>(0);
  const [tdsRate, setTdsRate] = useState<number>(0);
  const [labourFilter, setLabourFilter] = useState<"all" | "site" | "plant">("all");
  const [dateGroupExpansionMode, setDateGroupExpansionMode] = useState<"auto" | "expanded" | "collapsed">("auto");
  const [dateGroupExpansionOverrides, setDateGroupExpansionOverrides] = useState<Record<string, boolean>>({});
  const [hireGroups, setHireGroups] = useState<HireGroup[]>([]);
  const monthlyHireSeedRef = useRef("");
  const [monthlyHireSeedKey, setMonthlyHireSeedKey] = useState("");
  const contractorAdvanceSeedRef = useRef("");
  const generatedBillAdjustmentRef = useRef("");
  const suppressedAutoItemsRef = useRef(new Set<string>());
  // Source rows are owned by the vendor/period/category query that inserted
  // them. Keeping that context separately lets a changed form reconcile
  // stale auto rows without touching manual evidence.
  const autoItemsContextRef = useRef("");
  const [showEquipmentDailyActivity, setShowEquipmentDailyActivity] = useState(false);
  // This identity is pinned when a persisted bill with hire statements is
  // loaded. Do not derive it from mutable working groups: clearing or
  // reloading a group's details must never switch the editor into the new
  // itemized flow mid-edit.
  const isHistoricalHireEdit = editingBillId !== null && historicalHireBillId === editingBillId;


  useEffect(() => {
    setLabourFilter("all");
  }, [vendorName, periodFrom, periodTo]);

  useEffect(() => {
    setDateGroupExpansionMode("auto");
    setDateGroupExpansionOverrides({});
  }, [editingBillId, selectedBillId]);

  const setAllDateGroupsExpanded = (mode: "expanded" | "collapsed") => {
    setDateGroupExpansionMode(mode);
    setDateGroupExpansionOverrides({});
  };
  const toggleDateGroup = (key: string, expanded: boolean) => {
    setDateGroupExpansionOverrides(previous => ({ ...previous, [key]: expanded }));
  };

  const [pendingDeleteAction, setPendingDeleteAction] = useState<{ billId: number; billNo?: string; status?: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [voidBillAction, setVoidBillAction] = useState<{ billId: number; billNo: string } | null>(null);
  const [showBillHistory, setShowBillHistory] = useState(false);
  const [showBillDateDialog, setShowBillDateDialog] = useState(false);
  const [billDateDraft, setBillDateDraft] = useState("");
  const [billDateReason, setBillDateReason] = useState("");
  const [showAliasDialog, setShowAliasDialog] = useState(false);
  const [aliasCanonical, setAliasCanonical] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const [showSetRatesDialog, setShowSetRatesDialog] = useState(false);
  const [showDraftRateCards, setShowDraftRateCards] = useState(false);
  const draftScrollRef = useRef(0);
  const pendingRateToastRef = useRef<{ title: string; description?: string } | null>(null);
  const [bulkRates, setBulkRates] = useState<Record<string, BulkRateSelection>>({});
  const [showBulkRateConfirmation, setShowBulkRateConfirmation] = useState(false);
  const unitEditGeneration = useRef(0);
  const unitEditContext = `${view}|${editingBillId ?? ""}|${billType}|${selectedSiteId}|${vendorName}|${periodFrom}|${periodTo}`;
  const unitEditContextRef = useRef(unitEditContext);
  unitEditContextRef.current = unitEditContext;
  useEffect(() => { unitEditGeneration.current++; }, [vendorName, editingBillId, view, billType, selectedSiteId, periodFrom, periodTo]);
  const activePullContextRef = useRef("");
  const pullInFlightRef = useRef(false);
  const [pullInFlight, setPullInFlight] = useState(false);
  const formGenerationRef = useRef(0);
  const activeEditingBillIdRef = useRef<number | null>(null);
  const pullTokenRef = useRef<{ context: string; controller: AbortController } | null>(null);
  const cancelActivePull = () => {
    const activePull = pullTokenRef.current;
    if (activePull) {
      activePull.controller.abort();
      pullTokenRef.current = null;
    }
    pullInFlightRef.current = false;
    setPullInFlight(false);
  };
  const updateActivePullContext = (
    type = billType,
    vendor = vendorName,
    from = periodFrom,
    to = periodTo,
  ) => {
    cancelActivePull();
    activePullContextRef.current = `${view}|${editingBillId ?? ""}|${type}|${vendor}|${from}|${to}`;
  };

  const { data: bills, isLoading, isError: billListError } = useQuery<VendorBillWithItems[]>({
    queryKey: filterStatus === "voided" ? ["/api/vendor-bills", "voided-list"] : ["/api/vendor-bills"],
    queryFn: async () => {
      const path = filterStatus === "voided" ? "/api/vendor-bills?status=voided" : "/api/vendor-bills";
      const response = await fetch(path, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch vendor bills.");
      return response.json();
    },
  });


  const { data: billDetail } = useQuery<VendorBillWithItems>({
    queryKey: ["/api/vendor-bills", selectedBillId],
    enabled: !!selectedBillId,
  });
  const billAuditHistory = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", { module: "vendor_bills", transactionId: selectedBillId }],
    queryFn: async () => {
      const response = await fetch(
        `/api/audit-logs?module=vendor_bills&transactionId=${selectedBillId}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to fetch vendor-bill audit history.");
      return response.json();
    },
    enabled: view === "detail" && !!selectedBillId && canViewBills,
  });

  const { data: vendorNamesData } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
  });

  const vendorNames = vendorNamesData || [];
  const billingIdentities = useQuery<VendorBillingIdentity[]>({ queryKey: ["/api/vendor-bills/vendor-identities"] });
  const matchingBillingIdentities = (billingIdentities.data || []).filter(v => v.name.trim().toUpperCase() === vendorName.trim().toUpperCase());
  const isHireVendorDisplay = ["equipment", "all"].includes(billType);
  const selectedHireVendorLabel = vendorBillingIdentityLabel(vendorName, billingIdentities.data);
  const { data: sites = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });

  const { data: vendorAliasesData } = useQuery<VendorAlias[]>({
    queryKey: ["/api/vendor-aliases"],
  });

  const addAliasMutation = useMutation({
    mutationFn: (data: { canonicalName: string; alias: string }) =>
      apiRequest("POST", "/api/vendor-aliases", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/vendor-names"] });
      toast({ title: "Vendor alias added" });
      setAliasCanonical("");
      setAliasValue("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add alias", description: err.message, variant: "destructive" });
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendor-aliases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/vendor-names"] });
      toast({ title: "Alias removed" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const [showVendorDiscovery, setShowVendorDiscovery] = useState(false);

  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  const filteredVendorNames = useMemo(() => {
    if (!vendorSearch) return vendorNames;
    return vendorNames.filter(n => n.includes(vendorSearch.toUpperCase()) ||
      (isHireVendorDisplay && vendorBillingIdentityLabel(n, billingIdentities.data).toUpperCase().includes(vendorSearch.toUpperCase())));
  }, [vendorNames, vendorSearch, isHireVendorDisplay, billingIdentities.data]);

  interface DiscoveredVendor {
    vendorName: string;
    recordCount?: number;
    categories?: string[];
    existingBill?: { id: number; billNo: string; status: string } | null;
    equipmentCount?: number;
    equipment?: any[];
  }

  const discoveryPeriodReady = !!periodFrom && !!periodTo;
  // New Equipment Hire bills deliberately use the same activity-backed
  // discovery endpoint as every other itemized bill. The legacy
  // hire-specific endpoint is queried only to hydrate the historical
  // calculation editor for bills that already contain hire statements.
  const discoverUrl = discoveryPeriodReady && billType !== "other"
    ? isHistoricalHireEdit
      ? `/api/vendor-bills/equipment-hire-discovery?periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`
      : `/api/vendor-bills/discover-vendors?billType=${encodeURIComponent(billType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`
    : null;

  const { data: discoveredVendors, isFetching: discoveryLoading } = useQuery<DiscoveredVendor[]>({
    queryKey: [isHistoricalHireEdit ? "/api/vendor-bills/equipment-hire-discovery" : "/api/vendor-bills/discover-vendors", billType, periodFrom, periodTo],
    queryFn: () => discoverUrl ? fetch(discoverUrl).then(r => r.json()) : Promise.resolve([]),
    enabled: !!discoverUrl && (showVendorDiscovery || isHistoricalHireEdit),
  });

  const autoItemsUrl = vendorName && periodFrom && periodTo && billType !== "other"
    ? `/api/vendor-bills/auto-items?vendorName=${encodeURIComponent(vendorName)}&billType=${encodeURIComponent(billType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}${selectedSiteId === "all" ? "" : `&siteId=${encodeURIComponent(selectedSiteId)}`}`
    : null;

  const { data: autoItems, isFetching: autoItemsLoading, refetch: refreshAutoItems } = useQuery<any[]>({
    queryKey: ["/api/vendor-bills/auto-items", vendorName, billType, periodFrom, periodTo, selectedSiteId],
    queryFn: () => autoItemsUrl ? fetch(autoItemsUrl).then(r => r.json()) : Promise.resolve([]),
    enabled: !!autoItemsUrl,
  });
  const mappedAutoItems = useMemo(() => (autoItems || []).map(mapAutoBillItemWithEvidence), [autoItems]);
  const billableAutoItems = useMemo(() => billableTripCandidates(mappedAutoItems), [mappedAutoItems]);
  const unconfirmedTripOffers = useMemo(() => mappedAutoItems.filter(isUnconfirmedTrip), [mappedAutoItems]);

  const hireEvidenceFrom = [periodFrom, ...hireGroups.map(group => group.periodFrom)].filter(validHireDate).sort()[0] || periodFrom;
  const hireEvidenceTo = [periodTo, ...hireGroups.map(group => group.periodTo)].filter(validHireDate).sort().at(-1) || periodTo;
  const hireActivitiesUrl = vendorName && hireEvidenceFrom && hireEvidenceTo
    ? `/api/vendor-bills/hire-activities?vendorName=${encodeURIComponent(vendorName)}&periodFrom=${encodeURIComponent(hireEvidenceFrom)}&periodTo=${encodeURIComponent(hireEvidenceTo)}`
    : "";
  const { data: hireActivityRows = [], isFetching: hireActivitiesLoading, isError: hireActivitiesError, refetch: reloadHireActivities } = useQuery<any[]>({
    queryKey: ["/api/vendor-bills/hire-activities", vendorName, hireEvidenceFrom, hireEvidenceTo],
    queryFn: async () => {
      const response = await fetch(hireActivitiesUrl);
      if (!response.ok) throw new Error("Could not load hire evidence. Retry before preparing the bill.");
      return response.json();
    },
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true,
    // Monthly lines are generated in the shared itemized bill flow too.  This
    // feed is evidence only; the server re-reads it before saving.
    enabled: !!hireActivitiesUrl && (isHistoricalHireEdit || billType === "equipment" || billType === "all"),
  });
  const hireEquipment = useMemo(() => {
    if (isHistoricalHireEdit && ["equipment", "all"].includes(billType)) {
      return discoveredVendors?.find(v => v.vendorName === vendorName)?.equipment || [];
    }
    const byId = new Map<number, any>();
    hireActivityRows.filter((row: any) => row.source === "equipment_default").forEach((row: any) => {
      byId.set(Number(row.equipmentId), { id: Number(row.equipmentId), ...(row.equipment || {}) });
    });
    return Array.from(byId.values());
  }, [billType, discoveredVendors, hireActivityRows, vendorName, isHistoricalHireEdit]);
  const currentMonthlySeedKey = `${vendorName}|${periodFrom}|${periodTo}`;
  const monthlyHireExclusions = useMemo(() => {
    if (!vendorName || !validHireDate(periodFrom) || !validHireDate(periodTo) || periodFrom > periodTo ||
      !["equipment", "all"].includes(billType) || monthlyHireSeedKey !== currentMonthlySeedKey) return [];
    return hireEquipment.flatMap((equipment: any) => {
      if (String(equipment.hireBillingBasis || "").toLowerCase() !== "monthly") return [];
      const id = Number(equipment.id);
      if (hireGroups.some(group => Number(group.equipmentId) === id && group.basis === "monthly")) return [];
      let reason: string | null = null;
      if (!validHireDate(equipment.hireStartDate)) reason = "Equipment Master has no valid hire start date.";
      else if (equipment.hireStartDate > periodTo) reason = "The Master hire period starts after this bill period.";
      else if (equipment.hireEndDate && equipment.hireEndDate < periodFrom) {
        reason = "The Master hire period ends before this bill period.";
      } else if (!(Number(equipment.hireRate) > 0)) reason = "Equipment Master has no positive hire rate.";
      else if (String(equipment.hireMonthlyDivisorType || "30").toLowerCase() === "custom" &&
        !(Number(equipment.hireMonthlyDivisor) > 0)) reason = "Equipment Master has a custom monthly divisor that is missing or not positive.";
      else reason = "This bill already contains hire lines, so automatic seeding preserved the existing lines.";
      return [{
        id,
        name: [equipment.equipmentType, equipment.equipmentSpec].filter(Boolean).join(" ") || equipment.name || `Equipment #${id}`,
        reason,
      }];
    });
  }, [billType, currentMonthlySeedKey, hireEquipment, hireGroups, monthlyHireSeedKey, periodFrom, periodTo, vendorName]);
  const selectedHireEquipmentId = hireGroups[0]?.equipmentId;
  const equipmentPerformanceQueries = useQueries({
    queries: hireGroups.map(group => {
      const url = `/api/reports/equipment-performance?dateFrom=${encodeURIComponent(group.periodFrom)}&dateTo=${encodeURIComponent(group.periodTo)}&equipmentId=${group.equipmentId}`;
      return {
        queryKey: ["/api/reports/equipment-performance", group.equipmentId, group.periodFrom, group.periodTo],
        queryFn: async (): Promise<EquipmentPerformanceReport> => {
          const response = await fetch(url, { credentials: "include" });
          if (!response.ok) throw new Error((await response.text()) || "Could not load daily equipment activity");
          return response.json();
        },
        enabled: validHireDate(group.periodFrom) && validHireDate(group.periodTo) && group.periodFrom <= group.periodTo,
      };
    }),
  });
  const performanceForGroup = (group: HireGroup) =>
    equipmentPerformanceQueries[hireGroups.findIndex(candidate => candidate.id === group.id)];
  const equipmentPerformanceRevision = equipmentPerformanceQueries
    .map(query => query.dataUpdatedAt)
    .join("|");
  const normalizedHireActivities = useMemo(
    () => normalizeHireActivities(hireActivityRows.filter((row: any) =>
      row.source === "dpr_log" || row.source === "plant_usage" || row.source === "site_material_trip" || row.source === "bulk_transport_trip"
    ) as HireActivity[]),
    [hireActivityRows],
  );

  // Restore monthly Master availability. Daily/hourly/trip machines use the
  // earlier ordinary equipment items; no material-trip daily-hire composer.
  useEffect(() => {
    if (isHistoricalHireEdit || editingBillId !== null || !vendorName || !validHireDate(periodFrom) || !validHireDate(periodTo) || periodFrom > periodTo || !["equipment", "all"].includes(billType) || hireActivitiesLoading) return;
    const monthly = hireEquipment.filter((equipment: any) =>
      String(equipment.hireBillingBasis || "").toLowerCase() === "monthly" &&
      validHireDate(equipment.hireStartDate) && equipment.hireStartDate <= periodTo &&
      (!equipment.hireEndDate || equipment.hireEndDate >= periodFrom) &&
      Number(equipment.hireRate) > 0 &&
      (String(equipment.hireMonthlyDivisorType || "30").toLowerCase() !== "custom" || Number(equipment.hireMonthlyDivisor) > 0),
    );
    const seedKey = `${vendorName}|${periodFrom}|${periodTo}`;
    if (monthlyHireSeedRef.current === seedKey) return;
    const previousVendor = monthlyHireSeedRef.current.split("|")[0];
    monthlyHireSeedRef.current = seedKey;
    setMonthlyHireSeedKey(seedKey);
    if (hireGroups.length && (!previousVendor || previousVendor === vendorName)) return;
    setHireGroups(monthly.flatMap((equipment: any) => {
      // Calendar month boundaries; the calculator clips to Master hire dates.
      return monthlyHireSegments(
        Date.parse(`${periodFrom}T00:00:00.000Z`),
        Date.parse(`${periodTo}T00:00:00.000Z`),
      ).map(segment => {
        const segmentFrom = new Date(segment.from).toISOString().slice(0, 10);
        const segmentTo = new Date(segment.to).toISOString().slice(0, 10);
        return {
          id: `monthly-auto-${equipment.id}-${segmentFrom}-${segmentTo}`, equipmentId: Number(equipment.id),
          periodFrom: segmentFrom, periodTo: segmentTo, basis: "monthly" as const, rate: Number(equipment.hireRate),
          includeInBill: true, dailyDecisions: [], tripDecisions: [], exceptionDecisions: [], breakdownGraceDays: 0,
        };
      });
    }));
  }, [billType, editingBillId, hireActivitiesLoading, hireEquipment, hireGroups.length, isHistoricalHireEdit, periodFrom, periodTo, vendorName]);

  // A category switch must not leave invisible generated availability lines in
  // an ordinary material/transport/labour bill.
  useEffect(() => {
    if (billType === "equipment" || billType === "all") return;
    monthlyHireSeedRef.current = "";
    setMonthlyHireSeedKey("");
    // The monthly adjustment bucket is gone; revisiting Equipment/All must
    // not suppress a contractor-diesel suggestion with a stale seed key.
    contractorAdvanceSeedRef.current = "";
    setHireGroups([]);
    setLineItems(items => items.filter(item => !["hire_group", "hire_statement"].includes(item.source)));
  }, [billType]);

  const contractorAdvanceSuggestion = useMemo(() => {
    if (!vendorName || !periodFrom || !periodTo || !["equipment", "all"].includes(billType)) return null;
    const advances = normalizedHireActivities.filter((row: any) =>
      String(row.dieselSource || "").toLowerCase() === "contractor" && Number(row.actualDiesel || 0) > 0,
    );
    if (!advances.length) return null;
    const litres = advances.reduce((total, row: any) => total + Number(row.actualDiesel || 0), 0);
    const purchases = hireActivityRows.filter((row: any) => row.source === "diesel_rate" && Number(row.rate) > 0 && Number(row.qtyPurchased) > 0);
    const quantity = purchases.reduce((total: number, row: any) => total + Number(row.qtyPurchased), 0);
    const rate = quantity > 0 ? purchases.reduce((total: number, row: any) => total + Number(row.rate) * Number(row.qtyPurchased), 0) / quantity : undefined;
    const dates = Array.from(new Set(advances.map((row: any) => row.businessDate))).sort();
    return { litres, rate, amount: rate == null ? undefined : Math.round(litres * rate * 100) / 100,
      reason: `DIESEL ADVANCE · ${dates.join(", ")} · ${litres.toFixed(2)} L` };
  }, [billType, hireActivityRows, normalizedHireActivities, periodFrom, periodTo, vendorName]);

  useEffect(() => {
    if (!contractorAdvanceSuggestion || isHistoricalHireEdit) return;
    const key = `${vendorName}|${periodFrom}|${periodTo}|${contractorAdvanceSuggestion.reason}`;
    if (contractorAdvanceSeedRef.current === key) return;
    // Wait for the monthly availability groups to seed, then put the recovery
    // in the existing per-hire snapshot adjustment bucket. A non-monthly
    // ordinary bill retains the established bill-level adjustment seam.
    const hasPendingMonthly = hireEquipment.some((equipment: any) => String(equipment.hireBillingBasis || "").toLowerCase() === "monthly");
    if (hasPendingMonthly && hireGroups.length === 0) return;
    contractorAdvanceSeedRef.current = key;
    const reason = contractorAdvanceSuggestion.rate == null
      ? `${contractorAdvanceSuggestion.reason} · MANUAL PRICE REQUIRED`
      : `${contractorAdvanceSuggestion.reason} · SUGGESTED @ ₹${contractorAdvanceSuggestion.rate.toFixed(2)}/L`;
    if (hireGroups.length) {
      setHireGroups(groups => groups.map((group, index) => index === 0 ? {
        ...group, adjustments: { ...(group.adjustments || {}), otherDebit: contractorAdvanceSuggestion.amount, otherDebitReason: reason },
      } : group));
    } else {
      setAdjustmentLabel(reason);
      setAdjustmentAmount(contractorAdvanceSuggestion.amount == null ? 0 : -contractorAdvanceSuggestion.amount);
      generatedBillAdjustmentRef.current = key;
    }
  }, [contractorAdvanceSuggestion, hireEquipment, hireGroups.length, isHistoricalHireEdit, periodFrom, periodTo, vendorName]);

  useEffect(() => {
    if (!generatedBillAdjustmentRef.current) return;
    const context = `${vendorName}|${periodFrom}|${periodTo}|`;
    if (!generatedBillAdjustmentRef.current.startsWith(context) || !["equipment", "all"].includes(billType)) {
      generatedBillAdjustmentRef.current = "";
      setAdjustmentLabel("");
      setAdjustmentAmount(0);
    }
  }, [billType, periodFrom, periodTo, vendorName]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vendor-bills", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Vendor bill created successfully" });
      resetForm();
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create bill", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/vendor-bills/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Vendor bill updated successfully" });
      resetForm();
      setEditingBillId(null);
      if (payablesReturnTo) {
        setSelectedBillId(variables.id);
        setView("detail");
      } else {
        setView("list");
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update bill", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/vendor-bills/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      if (selectedBillId) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills", selectedBillId] });
      }
      toast({ title: "Bill status updated" });
    },
    onError: (err: Error) => {
      toast({ ...vendorBillStatusError(err), variant: "destructive" });
    },
  });

  const billDateMutation = useMutation({
    mutationFn: ({ id, billDate, reason }: { id: number; billDate: string; reason: string }) =>
      apiRequest("PATCH", `/api/vendor-bills/${id}/bill-date`, {
        billDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs", { module: "vendor_bills", transactionId: variables.id }] });
      toast({ title: "Bill accounting date updated" });
      setShowBillDateDialog(false);
      setBillDateReason("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to change bill date", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("DELETE", `/api/vendor-bills/${id}`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Bill deleted" });
      setSelectedBillId(null);
      setShowDeleteConfirm(false);
      setPendingDeleteAction(null);
      setDeleteReason("");
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete bill", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    cancelActivePull();
    formGenerationRef.current++;
    activeEditingBillIdRef.current = null;
    activePullContextRef.current = "";
    setBillDate(format(new Date(), "yyyy-MM-dd"));
    setBillNo("");
    setBillType(FRESH_BILL_TYPE);
    setSelectedSiteId("all");
    setVendorName("");
    setPeriodFrom("");
    setPeriodTo("");
    setNotes("");
    setLineItems(isAdmin ? [defaultManualItem] : []);
    setHireGroups([]);
    monthlyHireSeedRef.current = "";
    setMonthlyHireSeedKey("");
    contractorAdvanceSeedRef.current = "";
    generatedBillAdjustmentRef.current = "";
    suppressedAutoItemsRef.current.clear();
    autoItemsContextRef.current = "";
    setAdjustmentLabel("");
    setAdjustmentAmount(0);
    setAdditionalAdjustments([]);
    setGstRateEquipment(0);
    setGstRateMaterial(0);
    setGstRateTransport(0);
    setGstRateLabour(0);
    setTdsRate(0);
    setEditingBillId(null);
    setEditingBillOriginalNo("");
    setHistoricalHireBillId(null);
    setVendorSearch("");
    setShowVendorDropdown(false);
    setShowVendorDiscovery(false);
    setShowSetRatesDialog(false);
    setShowBulkRateConfirmation(false);
  };

  const handleSelectDiscoveredVendor = (vendor: DiscoveredVendor) => {
    if (vendor.vendorName !== vendorName) {
      setHireGroups([]);
      monthlyHireSeedRef.current = "";
      setMonthlyHireSeedKey("");
    }
    updateActivePullContext(billType, vendor.vendorName, periodFrom, periodTo);
    setVendorName(vendor.vendorName);
    setVendorSearch(vendor.vendorName);
    setShowVendorDiscovery(false);
  };

  const handleEditExistingBill = (billId: number) => {
    const bill = bills?.find(b => b.id === billId);
    if (bill) {
      loadBillForEdit(bill);
      setShowVendorDiscovery(false);
    } else {
      setSelectedBillId(billId);
      setView("detail");
      setShowVendorDiscovery(false);
    }
  };

  const loadBillForEdit = (bill: VendorBillWithItems) => {
    if (hasFrozenTripDailyHire(bill as any)) {
      toast({ title: "Historical bill preserved", description: FROZEN_TRIP_DAILY_MESSAGE });
      setSelectedBillId(bill.id);
      setView("detail");
      return;
    }
    cancelActivePull();
    formGenerationRef.current++;
    activeEditingBillIdRef.current = bill.id;
    updateActivePullContext(bill.billType.toLowerCase(), bill.vendorName, bill.periodFrom || "", bill.periodTo || "");
    setBillDate(bill.billDate);
    setBillNo(bill.billNo);
    setBillType(bill.billType.toLowerCase());
    setSelectedSiteId((bill as any).siteId == null ? "all" : String((bill as any).siteId));
    setVendorName(bill.vendorName);
    setVendorSearch(bill.vendorName);
    setPeriodFrom(bill.periodFrom || "");
    setPeriodTo(bill.periodTo || "");
    setNotes(bill.notes || "");
    setLineItems(
      bill.items.filter(item => !item.hireStatementId && !["hire_statement", "hire_group"].includes((item.source || "").toLowerCase())).map(item => ({
        date: item.date || "",
        category: item.category || "other",
        description: item.description,
        equipmentLogEvidence: item.equipmentLogEvidence as EquipmentLogEvidence | null | undefined,
        qty: item.qty || 0,
        unit: item.unit || "HRS",
        rate: item.rate || 0,
        amount: item.amount || 0,
        source: item.source || "manual",
        sourceType: (item as any).sourceType ?? null,
        sourceId: (item as any).sourceId ?? null,
        equipmentId: item.equipmentId || null,
        leadDistance: item.leadDistance ?? null,
        transportPricing: item.transportPricing ?? null,
        arrangementPricing: item.arrangementPricing ?? null,
        siteName: inferSiteNameFromDescription(item.description, item.siteName) || null,
        suppliedTo: item.suppliedTo ?? null,
        transporter: item.transporter ?? null,
        vendorName: (item as any).vendorName ?? null,
      }))
    );
    const persisted = ((bill as any).hireStatements || []).map((s: any, index: number): HireGroup => {
      const snap = s.calculationSnapshot || {};
      return { id: `loaded-${s.id || index}`, hireStatementId: s.id ? Number(s.id) : undefined, equipmentId: Number(s.equipmentId), periodFrom: s.periodFrom || bill.periodFrom || "", periodTo: s.periodTo || bill.periodTo || "",
        basis: (s.billingBasis || snap.terms?.billingBasis || "daily") as HireGroup["basis"], rate: Number(s.rate ?? snap.terms?.rate ?? 0),
        savedTerms: snap.terms,
        monthlyDivisorType: snap.terms?.monthlyDivisorType || "30",
        monthlyDivisor: snap.terms?.monthlyDivisor ?? null,
        quantityOverride: snap.quantityOverride, grossAmountOverride: snap.grossAmountOverride, dailyDecisions: snap.dailyDecisions || [],
        tripDecisions: snap.tripDecisions || [], exceptionDecisions: snap.exceptionDecisions || [],
        dieselNormOverride: snap.dieselNormOverride, dieselNormBasisOverride: snap.dieselNormBasisOverride,
        dieselRecoveryDecision: snap.dieselRecoveryDecision ?? snap.diesel?.recoveryDecision,
        dieselRecoveryFinalAmount: snap.dieselRecoveryFinalAmount ?? snap.diesel?.finalRecoveryAmount,
         dieselRecoveryRemarks: snap.dieselRecoveryRemarks ?? snap.diesel?.remarks,
         breakdownHoursPerDay: snap.breakdownHoursPerDay ?? undefined,
          breakdownGraceDays: snap.breakdownGraceDays ?? snap.terms?.breakdownGraceDays ?? 0,
         projectSite: snap.projectSite ?? undefined,
         adjustments: snap.adjustments ?? undefined };
    });
    setHireGroups(persisted);
    // VB10 integrated statements remain in the shared Equipment/All form on
    // edit. Legacy statements alone use the historical straight-form editor.
    const isVb10 = ((bill as any).hireStatements || []).some((statement: any) =>
      statement.calculationSnapshot?.billingIntegration === "vb10_automatic");
    // Legacy behavior was: setHistoricalHireBillId(persisted.length > 0 ? bill.id : null);
    // VB10 markers deliberately keep their shared editor instead.
    setHistoricalHireBillId(persisted.length > 0 && !isVb10 ? bill.id : null);
    const savedAdjustmentLabel = (bill as any).adjustmentLabel || "";
    const savedAdjustmentAmount = (bill as any).adjustmentAmount || 0;
    // Itemized-only contractor diesel recovery has no hire-group snapshot.
    // Its exact generated evidence suffix is the durable marker; do not
    // classify a reviewer-written "diesel advance" label as generated.
    const isGeneratedContractorAdvance = savedAdjustmentLabel.includes("DIESEL ADVANCE · ") &&
      (savedAdjustmentLabel.includes(" · SUGGESTED @ ₹") || savedAdjustmentLabel.endsWith(" · MANUAL PRICE REQUIRED"));
    const savedContext = `${bill.billType.toLowerCase()}|${bill.vendorName}|${bill.periodFrom || ""}|${bill.periodTo || ""}`;
    const savedGeneratedReason = savedAdjustmentLabel
      .replace(/ · SUGGESTED @ ₹[^·]+\/L$/, "")
      .replace(/ · MANUAL PRICE REQUIRED$/, "");
    contractorAdvanceSeedRef.current = isGeneratedContractorAdvance ? `${bill.vendorName}|${bill.periodFrom || ""}|${bill.periodTo || ""}|${savedGeneratedReason}` : "";
    generatedBillAdjustmentRef.current = isGeneratedContractorAdvance ? `${bill.vendorName}|${bill.periodFrom || ""}|${bill.periodTo || ""}|${savedAdjustmentLabel}` : "";
    // A persisted edit must not be reseeded merely because its activity query
    // finishes after this form is populated.
    autoItemsContextRef.current = savedContext;
    setAdjustmentLabel(savedAdjustmentLabel);
    setAdjustmentAmount(savedAdjustmentAmount);
    setAdditionalAdjustments(normalizeAdditionalAdjustments(
      (bill as any).additionalAdjustments ?? (bill as any).additional_adjustments,
    ));
    setGstRateEquipment((bill as any).gstRateEquipment || 0);
    setGstRateMaterial((bill as any).gstRateMaterial || 0);
    setGstRateTransport((bill as any).gstRateTransport || 0);
    setGstRateLabour((bill as any).gstRateLabour || 0);
    setTdsRate((bill as any).tdsRate || 0);
    setEditingBillId(bill.id);
    setEditingBillStatus(bill.status);
    setEditingBillOriginalNo(bill.billNo);
    setView("form");
  };

  const handleAutoPopulate = async (items = availableOtherItems) => {
    // Guard the action itself as well as discovery/group/preflight projections.
    // Saved lineItems are deliberately not filtered by this discovery rule.
    const billableItems = billableTripCandidates(items);
    if (
      billableItems.length === 0 ||
      pullInFlightRef.current ||
      (availableOtherItems.length > 0 && (!duplicatePreflight.isSuccess || duplicatePreflight.isFetching))
    ) return;

    const pullContext = `${view}|${editingBillId ?? ""}|${billType}|${vendorName}|${periodFrom}|${periodTo}`;
    const pullGeneration = formGenerationRef.current;
    const pullEditingBillId = editingBillId;
    const pullToken = { context: pullContext, controller: new AbortController() };
    const isCurrentPull = () =>
      formGenerationRef.current === pullGeneration &&
      activeEditingBillIdRef.current === pullEditingBillId &&
      activePullContextRef.current === pullContext &&
      pullTokenRef.current === pullToken;

    pullTokenRef.current = pullToken;
    pullInFlightRef.current = true;
    setPullInFlight(true);

    try {
      let mapped: LineItem[] = billableItems.map(item => ({ ...item }));

      try {
        const rcRes = await fetch(`/api/vendor-rate-cards?vendorName=${encodeURIComponent(vendorName)}`, {
          signal: pullToken.controller.signal,
        });
        if (!isCurrentPull()) return;
        if (rcRes.ok) {
          const rateCards: any[] = await rcRes.json();
          if (!isCurrentPull()) return;
          let appliedCount = 0;
          let convertedCount = 0;
          let ambiguousConversionCount = 0;
          let manualConversionCount = 0;
          for (let i = 0; i < mapped.length; i++) {
            const item = mapped[i];
            if (item.arrangementPricing) continue;
            const priced = applyTransportCard(item, rateCards, vendorName);
            if (isSiteTripTransport(item)) {
              mapped[i] = priced;
              if (priced.transportPricing) appliedCount++;
              // Retain the helper's unpriced rate/note when no unique exact
              // card exists. Never try material conversion for this source.
              continue;
            }
            if (priced !== item) {
              mapped[i] = priced;
              appliedCount++;
              continue;
            }
            if (item.rate === 0) {
              const group = groupRateItems([item])[0];
              const conversion = group
                ? selectAutoMaterialRateConversion(item, group, rateCards, vendorName)
                : { status: "not_applicable" as const };
              if (conversion.status === "converted") {
                mapped[i] = {
                  ...item,
                  unit: conversion.targetUnit,
                  qty: conversion.quantity,
                  rate: conversion.rate,
                };
                mapped[i].amount = calcAmount(mapped[i]);
                appliedCount++;
                convertedCount++;
              } else if (conversion.status === "same_unit") {
                mapped[i] = { ...item, rate: conversion.rate };
                mapped[i].amount = calcAmount(mapped[i]);
                appliedCount++;
              } else if (conversion.status === "ambiguous") {
                ambiguousConversionCount++;
              } else if (conversion.status === "manual_conversion_required") {
                manualConversionCount++;
              }
            }
          }
          if (appliedCount > 0) {
            toast({
              title: `Applied ${appliedCount} rates from rate card`,
              description: convertedCount > 0
                ? `${convertedCount} row${convertedCount === 1 ? "" : "s"} converted to the configured billing unit.`
                : undefined,
            });
          }
          if (ambiguousConversionCount > 0) {
            toast({
              title: `Skipped automatic conversion for ${ambiguousConversionCount} row${ambiguousConversionCount === 1 ? "" : "s"}`,
              description: "Multiple matching rate cards are available. Use Set Rates to choose the billing unit.",
            });
          }
          if (manualConversionCount > 0) {
            toast({
              title: `Manual conversion needed for ${manualConversionCount} row${manualConversionCount === 1 ? "" : "s"}`,
              description: "A different-unit rate card exists, but the quantity cannot be derived safely. Logged quantity and unit were retained with rate ₹0; use Set Rates to confirm the billing quantity.",
            });
          }
        }
      } catch (_e) {
        // Rate-card lookup has always been advisory; the duplicate check below
        // remains authoritative for whether this pull may proceed.
      }

      // A rate-card response can resolve after the preparer has selected
      // another vendor or period. Never submit stale source evidence.
      if (!isCurrentPull()) return;

      const duplicatePayload = mapped.map(sourceQualifiedDuplicateBillItemPayload);
      const dupRes = await fetch("/api/vendor-bills/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: pullToken.controller.signal,
        body: JSON.stringify({
          vendorName,
          excludeBillId: editingBillId || undefined,
          items: duplicatePayload,
        }),
      });
      if (!isCurrentPull()) return;
      if (!dupRes.ok) {
        throw new Error((await dupRes.text()) || "Could not check duplicate billed items");
      }
      const duplicateBody: unknown = await dupRes.json();
      if (!Array.isArray(duplicateBody) || duplicateBody.some((match: any) =>
        !match || !Number.isInteger(match.index) || match.index < 0 || match.index >= mapped.length ||
        typeof match.billNo !== "string" || typeof match.billStatus !== "string"
      )) {
        throw new Error("Duplicate check returned an invalid response");
      }
      if (!isCurrentPull()) return;

      const dups = uniqueDuplicateBillMatches(duplicateBody as DuplicateBillItemMatch[]);
      for (const d of dups) {
        mapped[d.index] = { ...mapped[d.index], billedIn: { billNo: d.billNo, billStatus: d.billStatus } };
      }

      const uniqueMapped = mapped.filter((item, index, all) =>
        !suppressedAutoItemsRef.current.has(autoBillItemIdentity(item)) &&
        all.findIndex(candidate => autoBillItemIdentity(candidate) === autoBillItemIdentity(item)) === index
      );

      const pulledCount = uniqueMapped.length;
      if (pulledCount > 0) {
        uniqueMapped.sort((a, b) => {
          const catA = categoryOrder[a.category] ?? 3;
          const catB = categoryOrder[b.category] ?? 3;
          if (catA !== catB) return catA - catB;
          return (a.date || "").localeCompare(b.date || "");
        });
        mapped = uniqueMapped;
        setLineItems(prev => mergeOtherBillItems(
          // The initial manual row is only a blank editor affordance. Any
          // successful activity pull, not only a material pull, replaces it.
          prev.filter(item => !item.initialBlank),
          mapped,
        ));
      }

      toast({ title: `${pulledCount} item(s) added from records` });
    } catch (error: any) {
      // A failed duplicate preflight/fresh check must not fall through to a
      // merge: treating an unknown response as zero duplicates is unsafe.
      if (isCurrentPull()) {
        toast({
          title: "Could not check duplicate billed items",
          description: error?.message || "Retry the pull after the duplicate check succeeds.",
          variant: "destructive",
        });
      }
    } finally {
      if (pullTokenRef.current === pullToken) {
        pullTokenRef.current = null;
        pullInFlightRef.current = false;
        setPullInFlight(false);
      }
    }
  };

  const getDefaultCategory = () => {
    if (billType === "transport" || billType === "equipment" || billType === "material" || billType === "labour") return billType;
    return "other";
  };

  const getDefaultUnit = () => {
    if (billType === "transport") return "TRIP";
    if (billType === "labour") return "HEAD-DAY";
    return "HRS";
  };

  const addLineItem = () => {
    setLineItems(prev => [
      // The seeded row is only an untouched editor affordance. A deliberate
      // Add Item replaces it, while preserving any row the user has edited.
      ...prev.filter(item => !item.initialBlank),
      { date: "", category: getDefaultCategory(), description: "", qty: 0, unit: getDefaultUnit(), rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null, suppliedTo: null, transporter: null },
    ]);
  };

  const patchHireGroup = (id: string, patch: Partial<HireGroup>) => {
    const current = hireGroups.find(g => g.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (next.periodFrom && next.periodTo && next.periodFrom <= next.periodTo &&
        hireGroups.some(g => g.id !== id && g.equipmentId === next.equipmentId && next.periodFrom <= g.periodTo && next.periodTo >= g.periodFrom)) {
      toast({ title: "THIS EQUIPMENT HIRE PERIOD OVERLAPS ANOTHER SELECTION", variant: "destructive" });
      return;
    }
    const nextGroups = hireGroups.map(g => g.id === id ? next : g);
    setHireGroups(nextGroups);
    const covered = lineItems.filter(item => rawAutoItemCoveredByHireGroup(item, [next]));
    if (covered.length) {
      setLineItems(prev => prev.filter(item => !rawAutoItemCoveredByHireGroup(item, [next])));
      const equipment = hireEquipmentFor(next.equipmentId);
      toast({ title: `Removed ${covered.length} raw activity row${covered.length === 1 ? "" : "s"} now covered by ${equipment?.name || "equipment"} hire` });
    }
  };

  const removeLineItem = (index: number) => {
    unitEditGeneration.current++;
    setLineItems(prev => {
      const item = prev[index];
      if (item && String(item.source || "").toLowerCase().startsWith("auto")) {
        suppressedAutoItemsRef.current.add(autoBillItemIdentity(item));
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const removeItemGroup = (items: Array<{ item: LineItem; idx: number }>, label: string) => {
    if (items.some(({ item }) => ["hire_group", "hire_statement"].includes(item.source))) {
      toast({ title: "Remove generated hire items through their hire selection", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Remove all ${items.length} items from ${label}?`)) return;
    // Each functional update sees the prior removal. Descending original indices
    // keep later removals stable and reuse per-row auto-source suppression.
    [...items].sort((a, b) => b.idx - a.idx).forEach(({ idx }) => removeLineItem(idx));
  };

  const calcAmount = calcCandidateAmount;

  const hireEquipmentFor = (id: number) => hireEquipment.find((e: any) => Number(e.id) === id);
  const activityForGroup = (group: HireGroup) => normalizedHireActivities.filter((a: any) =>
    Number(a.equipmentId) === group.equipmentId && a.businessDate >= group.periodFrom && a.businessDate <= group.periodTo
  );
  const maintenanceForGroup = (group: HireGroup) => hireActivityRows.filter((a: any) =>
    a.source === "maintenance" && Number(a.equipmentId) === group.equipmentId && a.businessDate >= group.periodFrom && a.businessDate <= group.periodTo
  );
  const dieselPurchasesForGroup = (group: HireGroup) => hireActivityRows.filter((a: any) =>
    a.source === "diesel_rate" && (!a.businessDate || a.businessDate <= group.periodTo)
  ).map((a: any) => ({
    id: Number(a.sourceId),
    date: a.date || a.businessDate,
    rate: Number(a.rate),
    qtyPurchased: Number(a.qtyPurchased),
    purchasedAt: a.purchasedAt,
  }));
  const hireResult = (group: HireGroup) => {
    const eq = hireEquipmentFor(group.equipmentId) || {};
    return calculateHireGroup({
      terms: {
        ...calculationTermsForBill(group, eq),
        automaticMonthlyBreakdownDeductions: !isHistoricalHireEdit,
        includeNewOperationalStatusExceptions: !isHistoricalHireEdit,
        breakdownHoursPerDay: group.breakdownHoursPerDay,
        breakdownGraceDays: group.breakdownGraceDays ?? 0,
      },
      periodFrom: group.periodFrom, periodTo: group.periodTo, activities: activityForGroup(group),
      maintenance: maintenanceForGroup(group).map((m: any) => ({ id: m.sourceId, date: m.businessDate, eventType: m.eventType, description: m.description, downtimeHours: m.downtimeHours })),
      dailyDecisions: group.dailyDecisions, tripDecisions: group.tripDecisions,
      exceptionDecisions: group.exceptionDecisions, quantityOverride: group.quantityOverride, grossAmountOverride: group.grossAmountOverride,
      dieselNormOverride: group.dieselNormOverride, dieselNormBasisOverride: group.dieselNormBasisOverride,
      dieselPurchases: dieselPurchasesForGroup(group),
      // Keep preview and save on the same Plant Stock tank equation. The
      // server independently re-reads these source records before persisting.
      authoritativeDieselPeriod: String(eq.hireDieselResponsibility || "").toLowerCase() === "hlc"
        ? hclMonthlyDieselPeriod(activityForGroup(group), { ...eq, ...calculationTermsForBill(group, eq) })
        : undefined,
      dieselRecovery: group.dieselRecoveryDecision ? { decision: group.dieselRecoveryDecision, finalAmount: group.dieselRecoveryFinalAmount, remarks: group.dieselRecoveryRemarks } : undefined,
    });
  };
  const hireCalculated = useMemo(() => hireGroups.map(group => {
    try {
      const calculated = hireResult(group);
      const adjustments = group.adjustments;
      const netAdjustment = Number(adjustments?.otherCredit || 0) - Number(adjustments?.otherDebit || 0) - Number(adjustments?.advanceAdjustment || 0);
      return { group, result: { ...calculated, netAmount: Math.max(0, calculated.netAmount + netAdjustment) } };
    } catch { return { group, result: null }; }
  }), [hireGroups, hireActivityRows, hireEquipment, equipmentPerformanceRevision]);
  const includedHireGroups = useMemo(
    () => hireGroups.filter(group => group.includeInBill !== false),
    [hireGroups],
  );
  const includedHireCalculated = useMemo(
    () => hireCalculated.filter(({ group }) => group.includeInBill !== false),
    [hireCalculated],
  );
  const availableOtherItems = useMemo(
    () => availableOtherBillItems(billableAutoItems, lineItems, includedHireGroups)
      .filter(item => !suppressedAutoItemsRef.current.has(autoBillItemIdentity(item))),
    [billableAutoItems, lineItems, includedHireGroups],
  );
  const billedLineItemCount = useMemo(
    () => lineItems.filter(item => !!item.billedIn).length,
    [lineItems],
  );
  const duplicatePreflightItems = useMemo(
    () => availableOtherItems.map(sourceQualifiedDuplicateBillItemPayload),
    [availableOtherItems],
  );
  const duplicatePreflight = useQuery<DuplicateBillItemMatch[]>({
    // Include the exact candidate payload and bill identity in the key. A
    // changed vendor/period/edit target must never reuse an old preflight.
    queryKey: [
      "/api/vendor-bills/check-duplicates",
      "preflight",
      view,
      billType,
      selectedSiteId,
      vendorName,
      periodFrom,
      periodTo,
      editingBillId ?? null,
      duplicatePreflightItems,
    ],
    queryFn: async () => {
      const response = await fetch("/api/vendor-bills/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName,
          excludeBillId: editingBillId || undefined,
          items: duplicatePreflightItems,
        }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "Could not check duplicate billed items");
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body) || body.some((match: any) =>
        !match || !Number.isInteger(match.index) || match.index < 0 || match.index >= duplicatePreflightItems.length ||
        typeof match.billNo !== "string" || typeof match.billStatus !== "string"
      )) {
        throw new Error("Duplicate check returned an invalid response");
      }
      return uniqueDuplicateBillMatches(body as DuplicateBillItemMatch[]);
    },
    enabled: view === "form" && billType !== "other" && !!vendorName && !!periodFrom && !!periodTo && availableOtherItems.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const duplicatePreflightBlocked = availableOtherItems.length > 0 &&
    (!duplicatePreflight.isSuccess || duplicatePreflight.isFetching);
  const preflightBilledIdentities = useMemo(() => {
    if (!duplicatePreflight.isSuccess) return new Set<string>();
    return new Set(
      (duplicatePreflight.data || [])
        .map(match => availableOtherItems[match.index])
        .filter(Boolean)
        .map(item => autoBillItemIdentity(item)),
    );
  }, [availableOtherItems, duplicatePreflight.data, duplicatePreflight.isSuccess]);
  // Deleted source identities remain suppressed for this draft context.
  const candidatePullGroups = useMemo(() => {
    const candidates = availableOtherBillItems(billableAutoItems, [], includedHireGroups)
      .filter(item => !suppressedAutoItemsRef.current.has(autoBillItemIdentity(item)));
    return groupRateItems(candidates).map(group => ({
      ...group,
      pendingItems: availableOtherBillItems(group.items, lineItems, includedHireGroups),
      alreadyBilledCount: duplicatePreflight.isSuccess
        ? availableOtherBillItems(group.items, lineItems, includedHireGroups)
          .filter(item => preflightBilledIdentities.has(autoBillItemIdentity(item))).length
        : null,
      toPullCount: duplicatePreflight.isSuccess
        ? availableOtherBillItems(group.items, lineItems, includedHireGroups).length
        : null,
    })).sort((a, b) => {
      const categoryDifference = (categoryOrder[a.category] ?? 3) - (categoryOrder[b.category] ?? 3);
      return categoryDifference || a.groupName.localeCompare(b.groupName) || a.entryType.localeCompare(b.entryType);
    });
  }, [duplicatePreflight.isSuccess, includedHireGroups, lineItems, billableAutoItems, preflightBilledIdentities]);

  // Keep asynchronous Pull work scoped to the form identity that started it.
  useEffect(() => {
    const context = `${view}|${editingBillId ?? ""}|${billType}|${vendorName}|${periodFrom}|${periodTo}`;
    if (pullTokenRef.current && pullTokenRef.current.context !== context) {
      cancelActivePull();
    }
    activePullContextRef.current = context;
  }, [billType, editingBillId, periodFrom, periodTo, vendorName, view]);

  useEffect(() => {
    if (!vendorName || !periodFrom || !periodTo) return;
    const context = `${billType}|${vendorName}|${periodFrom}|${periodTo}`;
    const priorContext = autoItemsContextRef.current;
    const [priorType, priorVendor, priorFrom, priorTo] = priorContext.split("|");
    const keepsSharedEvidence = !!priorContext &&
      priorVendor === vendorName && priorFrom === periodFrom && priorTo === periodTo &&
      ["equipment", "all"].includes(priorType) && ["equipment", "all"].includes(billType);
    // Equipment and All present the same itemized evidence. A mode switch
    // therefore preserves saved ordinary rows; vendor/period changes remain
    // a genuine context change.
    const contextChanged = !!priorContext && priorContext !== context && !keepsSharedEvidence;
    autoItemsContextRef.current = context;
    if (contextChanged) {
      suppressedAutoItemsRef.current.clear();
    }
    setLineItems(previous => {
      // Auto source rows belong to their discovery context, including the
      // ordinary hourly/daily/trip rows which are not hire statements. VB-11
      // deliberately does not seed ordinary activity: it remains selectable in
      // the grouped Pull UI below.
      return contextChanged
        ? previous.filter(item => !isAutoLineSource(String(item.source || "").toLowerCase()))
        : previous;
    });
  }, [billType, periodFrom, periodTo, vendorName]);

  useEffect(() => {
    const generated = includedHireCalculated.filter(x => x.result).map(({ group, result }) => {
      const eq = hireEquipmentFor(group.equipmentId);
      const unit = group.basis === "monthly" ? "MONTHS" : group.basis === "daily" ? "DAYS" : group.basis === "hourly" ? "HRS" : "TRIPS";
      const effectiveFrom = result!.billablePeriodFrom || group.periodFrom;
      const effectiveTo = result!.billablePeriodTo || group.periodTo;
      const effectiveEnd = new Date(`${effectiveTo}T00:00:00`);
      const partMonth = group.basis === "monthly" && (
        effectiveFrom.slice(8, 10) !== "01" ||
        effectiveEnd.getDate() !== new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth() + 1, 0).getDate()
      );
      return { date: group.periodFrom, category: "equipment", equipmentId: group.equipmentId,
        description: `${eq?.name || "EQUIPMENT"} · ${formatDate(effectiveFrom)}–${formatDate(effectiveTo)} · ${group.basis.toUpperCase()} HIRE${partMonth ? " · PART-MONTH PRORATED" : ""}`,
        qty: result!.quantity, unit, rate: result!.netAmount / (result!.quantity || 1), amount: result!.netAmount,
        source: "hire_group", leadDistance: null, siteName: null, suppliedTo: null, transporter: null } as LineItem;
    });
    setLineItems(prev => {
      const withoutGenerated = prev.filter(i => !["hire_group", "hire_statement"].includes(i.source));
      // A generated monthly line is a real item, so remove only the untouched
      // seed. User-owned manual rows (including edited seed rows) stay intact.
      return generated.length
        ? [...withoutGenerated.filter(i => !i.initialBlank), ...generated]
        : withoutGenerated;
    });
  }, [includedHireCalculated.length, includedHireCalculated.map(x => `${x.group.id}:${x.group.basis}:${x.group.rate}:${x.group.periodFrom}:${x.group.periodTo}:${x.result?.netAmount}:${x.result?.quantity}`).join("|")]);

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    if (lineItems[index]?.arrangementPricing) return;
    unitEditGeneration.current++;
    if (field === "unit") {
      const before = lineItems[index];
      if (!before || !isDifferentBillingUnit(before.unit, value)) return;
      const generation = unitEditGeneration.current;
      const contextAtEdit = unitEditContextRef.current;
      const selectedVendor = before.vendorName?.trim() || vendorName;
      const warning = "Unit changed — qty/rate may no longer match this vendor's rate card; use Set Rates to review.";
      setLineItems(prev => prev.map((item, i) => i === index ? {
        ...item, unit: value, initialBlank: false,
        physicalQuantity: item.physicalQuantity ?? item.qty,
        physicalUnit: item.physicalUnit ?? item.unit,
        unitRateWarning: warning,
      } : item));
      const physicalUnit = before.physicalUnit ?? before.unit;
      const group = groupRateItems([{ ...before, unit: physicalUnit }])[0];
      if (!group || !selectedVendor) return;
      void (async () => {
        try {
          const response = await fetch(`/api/vendor-rate-cards?vendorName=${encodeURIComponent(selectedVendor)}`);
          if (!response.ok) throw new Error(`Rate-card lookup failed (${response.status})`);
          const cards: VendorRateCardRecord[] = await response.json();
          const matches = matchingRateCardsForGroup(group, value, cards, selectedVendor, { allowVendorAliases: true })
            .filter(card => Number(card.rate) > 0);
          if (matches.length !== 1) return;
          // Use VB-22/VB-25's conversion gate: one source trip can be
          // billed as one commercial trip; hours→days and CFT→MT cannot
          // be inferred. Returning to the physical unit restores its qty.
          const conversion = selectAutoMaterialRateConversion(
            { category: before.category, unit: physicalUnit, sourceType: before.sourceType },
            group, [matches[0]], selectedVendor,
          );
          const restoringPhysical = !isDifferentBillingUnit(physicalUnit, value);
          if (!restoringPhysical && (conversion.status !== "converted" || conversion.targetUnit !== normalizeRateCardPart(value))) return;
          if (generation !== unitEditGeneration.current || contextAtEdit !== unitEditContextRef.current) return;
          setLineItems(prev => prev.map((item, i) => {
            if (i !== index || item.unit !== value || item.source !== before.source ||
                item.sourceId !== before.sourceId || item.description !== before.description) return item;
            const next = {
              ...item,
              qty: restoringPhysical ? (item.physicalQuantity ?? before.qty) : defaultConvertedQuantity(value),
              rate: Number(matches[0].rate),
              unitRateWarning: undefined,
            };
            return { ...next, amount: calcAmount(next) };
          }));
        } catch {
          // Keep the explicit row warning when the advisory lookup fails.
        }
      })();
      return;
    }
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value, initialBlank: false };
      if (field === "qty" || field === "rate") {
        updated[index].unitRateWarning = undefined;
        if (field === "qty" && !updated[index].transportPricing) {
          updated[index].physicalQuantity = value;
          updated[index].physicalUnit = updated[index].unit;
        }
      }
      if (field === "category" && value !== "transport") {
        updated[index].leadDistance = null;
        updated[index].transportPricing = null;
      }
      if (field === "qty" || field === "rate" || field === "leadDistance" || field === "category") {
        updated[index].amount = calcAmount(updated[index]);
      }
      return updated;
    });
  };

  const totalAmount = useMemo(() => lineItems.reduce((sum, item) => sum + (item.amount || 0), 0), [lineItems]);

  const categorySubtotals = useMemo(() => {
    const cats: Record<string, number> = {};
    lineItems.forEach(item => {
      const cat = item.category || "other";
      cats[cat] = (cats[cat] || 0) + (item.amount || 0);
    });
    return cats;
  }, [lineItems]);

  const gstAmountEquipment = useMemo(() => gstRateEquipment ? (categorySubtotals["equipment"] || 0) * gstRateEquipment / 100 : 0, [categorySubtotals, gstRateEquipment]);
  const gstAmountMaterial = useMemo(() => gstRateMaterial ? (categorySubtotals["material"] || 0) * gstRateMaterial / 100 : 0, [categorySubtotals, gstRateMaterial]);
  const gstAmountTransport = useMemo(() => gstRateTransport ? (categorySubtotals["transport"] || 0) * gstRateTransport / 100 : 0, [categorySubtotals, gstRateTransport]);
  const gstAmountLabour = useMemo(() => gstRateLabour ? (categorySubtotals["labour"] || 0) * gstRateLabour / 100 : 0, [categorySubtotals, gstRateLabour]);
  const totalGstAmount = useMemo(() => gstAmountEquipment + gstAmountMaterial + gstAmountTransport + gstAmountLabour, [gstAmountEquipment, gstAmountMaterial, gstAmountTransport, gstAmountLabour]);
  // The shared itemized flow applies TDS to the same subtotal basis for every
  // new bill type, including Equipment Hire. Historical hire statements keep
  // their frozen calculation snapshot separately.
  const tdsAmount = useMemo(() => tdsRate ? totalAmount * tdsRate / 100 : 0, [totalAmount, tdsRate]);
  const additionalAdjustmentTotal = useMemo(
    () => additionalAdjustments.reduce((sum, adjustment) => sum + (Number(adjustment.amount) || 0), 0),
    [additionalAdjustments],
  );
  const netTotal = useMemo(
    () => totalAmount + totalGstAmount + (adjustmentAmount || 0) + additionalAdjustmentTotal - tdsAmount,
    [totalAmount, totalGstAmount, adjustmentAmount, additionalAdjustmentTotal, tdsAmount],
  );

  const calendarKey = (group: HireGroup) =>
    `form|${editingBillId ?? "new"}|${vendorName}|${group.id}|${group.equipmentId}|${group.periodFrom}|${group.periodTo}`;
  const getCurrentFormSnapshot = (): WholeBillSnapshot => {
    const labourRows = lineItems.filter(item => item.category === "labour");
    const showLabourFilter = labourRows.some(item => getLabourSource(item) === "site") &&
      labourRows.some(item => getLabourSource(item) === "plant");
    const shouldGroup = computeCategorySubTotals(lineItems).length > 1;
    const rates: Record<string, number> = {
      equipment: gstRateEquipment, material: gstRateMaterial, transport: gstRateTransport, labour: gstRateLabour,
    };
    const amounts: Record<string, number> = {
      equipment: gstAmountEquipment, material: gstAmountMaterial, transport: gstAmountTransport, labour: gstAmountLabour,
    };
    const groupedGst = billType === "all" || billType === "equipment";
    const gstCategories = groupedGst
      ? Object.keys(rates).filter(category => (categorySubtotals[category] || 0) !== 0)
      : ["material", "transport", "labour"].includes(billType) ? [billType] : [];
    const included = hireGroups.filter(group => group.includeInBill !== false);
    const hireOutputs = included.flatMap(group => {
      const output = renderedHireOutputs.current.get(calendarKey(group));
      return output ? [output] : [];
    });
    const sections = projectVendorBillPageItems({
      items: lineItems, subtotals: categorySubtotals, shouldGroup, labourFilter, showLabourFilter,
      billType, total: totalAmount,
      getLabourSource: item => getLabourSource({ siteName: item.siteName, description: item.description || "" }),
      getSiteLabel: item => parseSiteBadge({ ...item, description: item.description || "" })?.label || null,
      formatDate,
    });
    // Historical hire does not use the ordinary form adjustments path. Read
    // the very same output objects prepared by that rendered branch below.
    if (isHistoricalHireEdit && hireOutputs.length) {
      sections.unshift({
        category: "equipment", subtotal: hireOutputs.reduce((sum, output) => sum + output.grossHire, 0),
        groups: hireOutputs.map((output, index) => ({
          label: `${formatDate(output.periodFrom)} – ${formatDate(output.periodTo)}`,
          subtotal: output.grossHire,
          rows: [{
            date: output.periodFrom, category: "equipment", description: `${output.equipmentName} · ${output.hireBasis}`,
            qty: Number(hireCalculated.find(entry => entry.group.id === included[index]?.id)?.result?.quantity || 0),
            unit: included[index]?.basis || "", rate: output.rate || null, amount: output.grossHire,
          }],
        })),
      });
    }
    const filterNote = !isHistoricalHireEdit && labourFilter !== "all" &&
      (showLabourFilter || (shouldGroup && new Set(labourRows.map(getLabourSource)).size > 1))
      ? `Active labour view filter: ${labourFilter}. Exported rows follow the displayed filter; category subtotals, GST, TDS and net payable retain the broader whole-bill screen totals, including hidden rows.`
      : "";
    return {
      companyName: companyName || "HLC", vendorName, billNo, billDate, periodFrom, periodTo,
      site: selectedSiteId === "all" ? "All sites" : sites?.find(site => String(site.id) === selectedSiteId)?.name || "",
      billType, billTypeLabel: getBillTypeLabel(billType), saved: editingBillId !== null,
      status: editingBillId !== null ? editingBillStatus : "unsaved", generatedAt: new Date().toISOString(),
      sections,
      calendars: included.flatMap(group => {
        const calendar = readCalendars([calendarKey(group)])[0];
        return [calendar || {
          equipmentName: formatEquipmentOptionLabel(hireEquipmentFor(group.equipmentId) || {}),
          periodFrom: group.periodFrom, periodTo: group.periodTo, rows: [],
          unavailableReason: "Daily activity is not available in the current rendered bill.",
        }];
      }),
      totals: isHistoricalHireEdit ? displayedHireTotals(hireOutputs) : {
        subtotal: totalAmount, totalGst: totalGstAmount,
        gst: gstCategories.map(category => ({
          label: `${groupedGst ? `GST ON ${category.toUpperCase()}` : "GST"} @ ${rates[category]}%`,
          amount: amounts[category],
        })),
        adjustments: [
          { label: adjustmentLabel || "ADVANCE DEDUCTION", amount: adjustmentAmount },
          ...additionalAdjustments.map(adjustment => ({
            label: adjustment.label || "ADDITIONAL DEDUCTION / CREDIT", amount: adjustment.amount,
          })),
        ],
        tds: { label: `IT TDS @ ${tdsRate}%`, amount: -tdsAmount }, netPayable: netTotal,
      },
      notes: [notes, filterNote].filter(Boolean).join("\n"),
    };
  };

  const computeCategorySubTotals = (items: { category?: string | null; amount?: number | null }[]) => {
    const cats: Record<string, number> = {};
    items.forEach(item => {
      const cat = item.category || "other";
      cats[cat] = (cats[cat] || 0) + (item.amount || 0);
    });
    return Object.entries(cats).filter(([, amt]) => amt !== 0).sort(([a], [b]) => a.localeCompare(b));
  };

  const applyRateToSimilar = (sourceIdx: number) => {
    const source = lineItems[sourceIdx];
    if (source.transportPricing || source.arrangementPricing) return;
    if (!source.rate || source.rate <= 0) return;
    const sourceEntryType = source.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/)?.[1] || "";
    let applied = 0;
    let skipped = 0;
    setLineItems(prev => {
      const updated = [...prev];
      for (let i = 0; i < updated.length; i++) {
        if (i === sourceIdx) continue;
        if (updated[i].transportPricing || updated[i].arrangementPricing) continue;
        const itemEntryType = updated[i].description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/)?.[1] || "";
        const sameEquipment = source.equipmentId && updated[i].equipmentId === source.equipmentId;
        const sameType = sourceEntryType && itemEntryType === sourceEntryType;
        if (sameEquipment && sameType) {
          if (!updated[i].rate || updated[i].rate === 0) {
            const newItem = { ...updated[i], rate: source.rate };
            newItem.amount = calcAmount(newItem);
            updated[i] = newItem;
            applied++;
          } else {
            skipped++;
          }
        }
      }
      return updated;
    });
    toast({
      title: applied > 0 ? `Rate applied to ${applied} row${applied > 1 ? "s" : ""}` : "No matching rows to apply",
      description: skipped > 0 ? `${skipped} row${skipped > 1 ? "s" : ""} skipped (already have rates)` : undefined,
    });
  };

  const uniqueRateGroups = useMemo(() => {
    return groupRateItems(lineItems.filter(item => !item.arrangementPricing && !["hire_group", "hire_statement"].includes(item.source)));
  }, [lineItems]);
  const bulkUnitConversions = useMemo(() => uniqueRateGroups.flatMap(group => {
    const selection = bulkRates[group.key];
    if (!selection?.targetUnit || !isDifferentBillingUnit(selection.targetUnit, group.unit)) return [];
    const newTotal = group.items.reduce((sum, item) => sum + calcAmount({
      ...item,
      unit: selection.targetUnit,
      qty: defaultConvertedQuantity(selection.targetUnit),
      rate: selection.rate,
      leadDistance: item.category === "transport" && selection.leadDistance > 0
        ? selection.leadDistance
        : item.leadDistance,
    }), 0);
    const quantities = group.items.map(item => Number(item.qty) || 0);
    const sameQuantity = quantities.every(quantity => quantity === quantities[0]);
    const beforeQuantity = sameQuantity
      ? formatQty(quantities[0])
      : `${formatQty(Math.min(...quantities))}–${formatQty(Math.max(...quantities))}`;
    return [{
      group,
      selection,
      beforeQuantity,
      beforeTotal: group.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      newTotal,
    }];
  }), [bulkRates, uniqueRateGroups]);

  const openSetRatesDialog = async () => {
    const initialRates: Record<string, BulkRateSelection> = {};

    let rateCards: VendorRateCardRecord[] = [];
    if (vendorName) {
      try {
        const res = await fetch(`/api/vendor-rate-cards?vendorName=${encodeURIComponent(vendorName)}`);
        if (res.ok) rateCards = await res.json();
      } catch (_e) {}
    }

    uniqueRateGroups.forEach(group => {
      const currentUnit = normalizeRateCardPart(group.unit);
      const existing = group.items.find(item =>
        Number(item.rate) > 0 &&
        (!group.equipmentId || item.description.includes(group.entryType)),
      );
      const currentCards = matchingRateCardsForGroup(group, currentUnit, rateCards, vendorName, { allowVendorAliases: true });
      const currentCard = currentCards[0] ||
        matchingRateCardsForGroup(group, currentUnit, rateCards, vendorName, {
          allowBlankUnitFallback: true,
          allowVendorAliases: true,
        })[0];
      const currentRate = Number(existing?.rate) || Number(currentCard?.rate) || 0;
      const candidateUnits = Array.from(new Set(
        rateCards
          .filter(card => Number(card.rate) > 0)
          .map(card => normalizeRateCardPart(card.unit))
          .filter(unit => unit && matchingRateCardsForGroup(group, unit, rateCards, vendorName, { allowVendorAliases: true }).length > 0),
      ));
      const unitOptions: RateCardUnitOption[] = [
        { unit: currentUnit, rate: currentRate, card: currentCard || {} },
        ...candidateUnits
          .filter(unit => unit !== currentUnit)
          .map(unit => {
            const card = matchingRateCardsForGroup(group, unit, rateCards, vendorName, { allowVendorAliases: true })[0];
            return { unit, rate: Number(card?.rate) || 0, card };
          })
          .filter(option => option.rate > 0),
      ];
      initialRates[group.key] = {
        rate: currentRate,
        leadDistance: Number(existing?.leadDistance) || 0,
        targetUnit: currentUnit,
        unitOptions,
      };
    });
    setBulkRates(initialRates);
    setShowBulkRateConfirmation(false);
    setShowSetRatesDialog(true);
  };

  const applyBulkRates = () => {
    if (bulkUnitConversions.length > 0) {
      if (bulkUnitConversions.some(({ selection }) => selection.rate <= 0)) {
        toast({ title: "Enter a positive rate for every selected billing unit", variant: "destructive" });
        return;
      }
      setShowBulkRateConfirmation(true);
      return;
    }
    confirmBulkRateApplication();
  };

  const confirmBulkRateApplication = () => {
    unitEditGeneration.current++;
    let applied = 0;
    const hasUnitConversion = uniqueRateGroups.some(group => {
      const selection = bulkRates[group.key];
      return selection?.targetUnit && isDifferentBillingUnit(selection.targetUnit, group.unit);
    });
    const updated = [...lineItems];
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      if (item.transportPricing || item.arrangementPricing) continue;
      if (["hire_group", "hire_statement"].includes(String(item.source || "").toLowerCase())) continue;
      const key = groupRateItems([item])[0]?.key;
      if (!key) continue;
      const rateData = bulkRates[key];
      if (rateData && rateData.rate > 0) {
        const convertingUnit = rateData.targetUnit && isDifferentBillingUnit(rateData.targetUnit, item.unit);
        const newItem = {
          ...item,
          ...(convertingUnit ? {
            unit: rateData.targetUnit,
            qty: defaultConvertedQuantity(rateData.targetUnit),
            // Set Rates is itself a reviewed conversion. Retain the
            // original physical evidence for later inline restoration,
            // without changing its existing qty/rate/application rules.
            physicalQuantity: item.physicalQuantity ?? item.qty,
            physicalUnit: item.physicalUnit ?? item.unit,
          } : {}),
          rate: rateData.rate,
          unitRateWarning: undefined,
        };
        if (item.category === "transport" && rateData.leadDistance > 0) {
          newItem.leadDistance = rateData.leadDistance;
        }
        newItem.amount = calcAmount(newItem);
        updated[i] = newItem;
        applied++;
      }
    }
    setLineItems(updated);
    setShowSetRatesDialog(false);
    pendingRateToastRef.current = {
      title: hasUnitConversion
        ? `Rates and billing units applied to ${applied} item${applied !== 1 ? "s" : ""}`
        : `Rates applied to ${applied} item${applied !== 1 ? "s" : ""}`,
      description: hasUnitConversion ? "Changes remain in this bill until you save it." : undefined,
    };

    // Set Rates is a bill-editor operation only. Both rate-only and
    // unit-conversion selections stay in memory; the ordinary Save action
    // below is the single existing path that upserts the final rates.
  };

  const handleSubmit = () => {
    if (!vendorName || !billDate) {
      toast({ title: "Please fill vendor name and bill date", variant: "destructive" });
      return;
    }
    const missingAdditionalReasonIndex = additionalAdjustments.findIndex(adjustment =>
      Number(adjustment.amount) !== 0 && !adjustment.label.trim(),
    );
    if (missingAdditionalReasonIndex >= 0) {
      toast({
        title: "Additional adjustment needs a reason / reference",
        description: `Enter a reason/reference for additional adjustment ${missingAdditionalReasonIndex + 1}.`,
        variant: "destructive",
      });
      return;
    }
    if (includedHireGroups.some(group => !Number.isFinite(group.rate) || group.rate <= 0 ||
        (group.basis === "monthly" && group.monthlyDivisorType === "custom" && !(Number(group.monthlyDivisor) > 0)))) {
      toast({ title: "Enter a positive hire rate and valid monthly divisor for each equipment charge", variant: "destructive" });
      return;
    }
    // Historical hire edits are persisted through hireGroups/statements and
    // intentionally strip the generated hire line before those groups are
    // rehydrated. The itemized flow requires at least one meaningful row;
    // quantity-only/manual metadata and source evidence are not blank rows.
    if (includedHireGroups.length === 0 && (lineItems.length === 0 || lineItems.every(isTrulyBlankManualBillRow))) {
      toast({ title: "Please add at least one line item", variant: "destructive" });
      return;
    }
    if (includedHireGroups.some(group => !validHireDate(group.periodFrom) || !validHireDate(group.periodTo) || group.periodFrom > group.periodTo)) {
      toast({ title: "Correct the equipment hire date range", variant: "destructive" });
      return;
    }
    if (includedHireGroups.some(group => !isPerformanceReadyForHireSubmission(performanceForGroup(group)))) {
      toast({ title: "Wait for authoritative Equipment Performance data before saving equipment hire", variant: "destructive" });
      return;
    }
    if (includedHireCalculated.some(({ result }) => !result)) {
      toast({ title: "Complete every equipment hire review before saving", variant: "destructive" });
      return;
    }
    for (let i = 0; i < includedHireGroups.length; i++) {
      const group = includedHireGroups[i];
      if (includedHireGroups.some((other, j) => j !== i && other.equipmentId === group.equipmentId &&
          group.periodFrom <= other.periodTo && group.periodTo >= other.periodFrom)) {
        toast({ title: "Equipment hire periods cannot overlap", variant: "destructive" });
        return;
      }
      if ((group.dieselRecoveryDecision === "accept" || group.dieselRecoveryDecision === "edit") &&
          (group.dieselRecoveryFinalAmount === undefined || group.dieselRecoveryFinalAmount < 0)) {
        toast({ title: "Enter the final HSD recovery amount for every accepted or edited recovery", variant: "destructive" });
        return;
      }
      if (group.dieselRecoveryDecision === "edit" && !group.dieselRecoveryRemarks?.trim()) {
        toast({ title: "Enter a reason/reference for the manually edited HSD recovery", variant: "destructive" });
        return;
      }
      if (group.basis === "trip") {
        const tripCandidates = activityForGroup(group).filter(activity => activity.entryType === "trip_based");
        const unresolvedTripCandidate = tripCandidates.some(activity => {
          const decision = group.tripDecisions.find(item => item.source === activity.source && item.sourceId === activity.sourceId);
          return decision?.selected !== true && decision?.selected !== false;
        });
        if (unresolvedTripCandidate) {
          toast({ title: "Accept or explicitly exclude every trip candidate before saving", variant: "destructive" });
          return;
        }
        const unresolvedTripReason = tripCandidates.some(activity => {
          const decision = group.tripDecisions.find(item => item.source === activity.source && item.sourceId === activity.sourceId);
          const recorded = Number(activity.numberOfTrips || 0);
          const deliveryCandidate = activity.source === "site_material_trip" || activity.source === "bulk_transport_trip";
          return (deliveryCandidate || decision?.selected === false || (decision?.correctedTrips != null && Number(decision.correctedTrips) !== recorded)) && !decision?.remarks?.trim();
        });
        if (unresolvedTripReason) {
          toast({ title: "Enter a reason/reference for every delivery trip decision and every excluded or corrected trip", variant: "destructive" });
          return;
        }
        const unverifiedSeparateTrip = tripCandidates.some(activity => {
          if (activity.source !== "site_material_trip" && activity.source !== "bulk_transport_trip") return false;
          const operationalOnSameDay = hasIncludedOperationalTripOnSameDay(activityForGroup(group), group.tripDecisions, activity);
          const decision = group.tripDecisions.find(item => item.source === activity.source && item.sourceId === activity.sourceId);
          return operationalOnSameDay && decision?.selected === true && decision.separateFromOperational !== true;
        });
        if (unverifiedSeparateTrip) {
          toast({ title: "Confirm each accepted delivery is a separate trip from same-day operational usage, or exclude the duplicate", variant: "destructive" });
          return;
        }
      }
      if (group.exceptionDecisions.some((decision: any) => decision.decision === "hours") &&
          !(group.breakdownHoursPerDay && group.breakdownHoursPerDay >= 10 && group.breakdownHoursPerDay <= 12)) {
        toast({ title: "Choose an explicit 10–12 hour breakdown divisor before applying actual downtime hours", variant: "destructive" });
        return;
      }
      if (group.exceptionDecisions.some((decision: any) => decision.sourceType === "maintenance" && decision.decision === "manual" && !decision.remarks?.trim())) {
        toast({ title: "Enter a reason/reference for every manual breakdown deduction", variant: "destructive" });
        return;
      }
      const operatorExceptions = (includedHireCalculated.find(item => item.group.id === group.id)?.result?.exceptions || [])
        .filter((exception: any) => exception.exceptionType === "operator_unavailable");
      const unreviewedOperatorException = operatorExceptions.find((exception: any) =>
        !group.exceptionDecisions.some((decision: any) =>
          decision.sourceType === exception.sourceType &&
          decision.sourceId === exception.sourceId &&
          decision.exceptionType === exception.exceptionType &&
          decision.date === exception.date &&
          ["none", "full_day", "half_day", "manual"].includes(decision.decision)));
      if (unreviewedOperatorException) {
        toast({ title: `Choose or confirm the operator-unavailable deduction for ${formatDate(unreviewedOperatorException.date)}`, variant: "destructive" });
        return;
      }
      const unavailableSuggestedOperatorException = operatorExceptions.find((exception: any) => {
        const decision = group.exceptionDecisions.find((item: any) =>
          item.sourceType === exception.sourceType && item.sourceId === exception.sourceId &&
          item.exceptionType === exception.exceptionType && item.date === exception.date);
        return (decision?.decision === "full_day" || decision?.decision === "half_day") &&
          exception.suggestedDeductionAmount == null;
      });
      if (unavailableSuggestedOperatorException) {
        toast({ title: `No applicable daily rate/divisor is configured for ${formatDate(unavailableSuggestedOperatorException.date)}; choose no deduction or a manual amount`, variant: "destructive" });
        return;
      }
      if (group.exceptionDecisions.some((decision: any) =>
        decision.sourceType === "usage" && decision.exceptionType === "operator_unavailable" &&
        decision.decision === "manual" &&
        (!Number.isFinite(Number(decision.manualDeductionAmount)) || Number(decision.manualDeductionAmount) < 0))) {
        toast({ title: "Enter a non-negative manual operator-unavailability deduction", variant: "destructive" });
        return;
      }
      if (group.exceptionDecisions.some((decision: any) =>
        decision.sourceType === "usage" && decision.exceptionType === "operator_unavailable" &&
        decision.decision === "manual" && !decision.remarks?.trim())) {
        toast({ title: "Enter a reason/reference for every manual operator-unavailability deduction", variant: "destructive" });
        return;
      }
      const adjustments = group.adjustments;
      if ((Number(adjustments?.otherDebit || 0) > 0 && !adjustments?.otherDebitReason?.trim()) ||
          (Number(adjustments?.advanceAdjustment || 0) > 0 && !adjustments?.advanceAdjustmentReason?.trim()) ||
          (Number(adjustments?.otherCredit || 0) > 0 && !adjustments?.otherCreditReason?.trim())) {
        toast({ title: "Every manual adjustment needs a reason or reference", variant: "destructive" });
        return;
      }
    }

    // Generated monthly lines use the same itemized bill payload, with the
    // existing immutable hire-statement snapshot solely as their auditable
    // calculation evidence. Historical non-monthly groups retain their flow.
    const includeHireGroups = includedHireGroups.length > 0 &&
      (billType === "equipment" || billType === "all") && !!periodFrom && !!periodTo;
    const data = {
      billDate,
      billNo: billNo || `AUTO-${Date.now()}`,
      billType,
      siteId: selectedSiteId === "all" ? null : Number(selectedSiteId),
      vendorName: vendorName.toUpperCase(),
      ...(matchingBillingIdentities.length === 1 ? { billingVendorId: matchingBillingIdentities[0].id } : {}),
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      status: "draft",
      notes: notes ? notes.toUpperCase() : null,
      totalAmount,
      adjustmentLabel: adjustmentLabel || null,
      adjustmentAmount: adjustmentAmount || 0,
      additionalAdjustments: additionalAdjustments
        .filter(adjustment => adjustment.label.trim() !== "" || Number(adjustment.amount) !== 0)
        .map(adjustment => ({
          label: adjustment.label.trim(),
          amount: Number(adjustment.amount) || 0,
        })),
      gstRateEquipment: gstRateEquipment || null,
      gstRateMaterial: gstRateMaterial || null,
      gstRateTransport: gstRateTransport || null,
      gstRateLabour: gstRateLabour || null,
      tdsRate: tdsRate || null,
      hireBillingMode: !isHistoricalHireEdit && includedHireGroups.length > 0 ? "vb10_automatic" : "historical",
      ...(includeHireGroups ? { hireGroups: includedHireCalculated.map(({ group, result }) => ({
        hireStatementId: group.hireStatementId, equipmentId: group.equipmentId, periodFrom: group.periodFrom, periodTo: group.periodTo, basis: group.basis,
        rate: group.rate, dailyDecisions: group.dailyDecisions, tripDecisions: group.tripDecisions,
        monthlyDivisorType: group.monthlyDivisorType, monthlyDivisor: group.monthlyDivisor,
        exceptionDecisions: group.exceptionDecisions, quantityOverride: group.quantityOverride, grossAmountOverride: group.grossAmountOverride,
        dieselNormOverride: group.dieselNormOverride, dieselNormBasisOverride: group.dieselNormBasisOverride,
        dieselRecoveryDecision: group.dieselRecoveryDecision, dieselRecoveryFinalAmount: group.dieselRecoveryFinalAmount,
          dieselRecoveryRemarks: group.dieselRecoveryRemarks, breakdownHoursPerDay: group.breakdownHoursPerDay,
          breakdownGraceDays: group.breakdownGraceDays ?? 0,
          projectSite: group.projectSite,
         adjustments: group.adjustments, calculatedQuantity: result!.calculatedQuantity,
        calculatedGrossAmount: result!.calculatedGrossAmount, netAmount: result!.netAmount,
      })) } : {}),
      items: lineItems.filter(i => !isTrulyBlankManualBillRow(i)).map(item => ({
        date: item.date || null,
        category: item.category || null,
        description: item.description.toUpperCase(),
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        amount: item.amount,
        source: item.source,
        sourceType: item.sourceType ?? null,
        sourceId: item.sourceId ?? null,
        equipmentId: item.equipmentId,
        leadDistance: item.leadDistance,
        transportPricing: item.transportPricing ?? null,
        arrangementPricing: item.arrangementPricing ?? null,
        siteName: item.siteName ||
          (selectedSiteId === "all" ? null : sites.find(site => String(site.id) === selectedSiteId)?.name) ||
          null,
        suppliedTo: item.suppliedTo ?? null,
        transporter: item.transporter ?? null,
      })),
    };

    if (editingBillId !== null && ["verified", "approved", "paid"].includes(editingBillStatus)) {
      const confirmed = window.confirm(
        `Bill ${editingBillOriginalNo} is currently ${editingBillStatus}. Saving this edit will return it to draft, require it to be verified and approved again, and remove it from Payable now until it is approved again. Continue?`,
      );
      if (!confirmed) return;
    }

    const rateCardItems: any[] = [];
    lineItems.filter(i => i.description && i.rate > 0 && !i.transportPricing && !i.arrangementPricing && !["hire_group", "hire_statement"].includes(i.source)).forEach(item => {
      let itemKey = "";
      if (item.category === "transport") {
        const canonical = canonicalTransportName(item.description);
        const unit = (item.unit || "TRIP").toUpperCase();
        itemKey = `EQ_${canonical}_${unit}`;
      } else if (item.category === "material") {
        const mn = canonicalMatName(item.description);
        const unit = (item.unit || "NOS").toUpperCase();
        itemKey = `MAT_${mn}_${unit}`;
      } else if (item.category === "labour") {
        itemKey = deriveLabourKey(item.description);
      } else if (item.equipmentId) {
        const mn = canonicalMachineName(item.description);
        const unit = (item.unit || "HRS").toUpperCase();
        itemKey = `EQ_${mn}_${unit}`;
      } else {
        itemKey = stripSourceSuffix(item.description.trim().toUpperCase());
      }
      if (itemKey && !rateCardItems.some(rc => rc.itemKey === itemKey.toUpperCase() && rc.category === item.category)) {
        rateCardItems.push({
          vendorName: vendorName.toUpperCase(),
          category: item.category,
          itemKey: itemKey.toUpperCase(),
          itemLabel: item.description.split(" - ")[0]?.trim().toUpperCase() || item.description.toUpperCase(),
          unit: item.unit,
          rate: item.rate,
          notes: null,
        });
      }
    });
    if (rateCardItems.length > 0) {
      fetch("/api/vendor-rate-cards/bulk-upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rateCardItems }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      }).catch(() => {});
    }

    if (editingBillId) {
      updateMutation.mutate({ id: editingBillId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openBillDetail = (bill: VendorBillWithItems) => {
    setSelectedBillId(bill.id);
    setView("detail");
  };

  const handleStatusChange = (billId: number, newStatus: string) => {
    statusMutation.mutate({ id: billId, status: newStatus });
  };

  const handleEditBill = (bill: VendorBillWithItems) => {
    if (bill.isCancelled) {
      toast({ title: "Voided bills cannot be edited", variant: "destructive" });
      return;
    }
    loadBillForEdit(bill);
  };

  const handleDeleteBill = (bill: VendorBillWithItems) => {
    setPendingDeleteAction({ billId: bill.id, billNo: bill.billNo, status: bill.status });
    setDeleteReason("");
    setShowDeleteConfirm(true);
  };

  const partyNames = useMemo(() => {
    if (!bills) return [];
    const set = new Set<string>();
    bills.forEach(bill => bill.items?.forEach((it: any) => { if (it.suppliedTo) set.add(it.suppliedTo); }));
    return Array.from(set).sort();
  }, [bills]);

  const scopeIndependentBills = useMemo(() => {
    // Financial viewers use the very same authorised snapshot for list and totals.
    // Ordinary viewers retain their normal bill access and workflows.
    const source = canViewFinancials ? (financialReview.data || []) : (bills || []);
    return filterFinancialBills(source, {
      scope: "all", dateFrom: filterDateFrom, dateTo: filterDateTo, vendor: filterVendor,
      status: filterStatus, category: filterCategory, party: filterParty, site: filterSite,
    }, sites);
  }, [bills, financialReview.data, canViewFinancials, sites, filterDateFrom, filterDateTo, filterVendor, filterStatus, filterCategory, filterParty, filterSite]);
  const filteredBills = useMemo(() => billScope === "all" ? scopeIndependentBills : filterFinancialBills(
    canViewFinancials ? (financialReview.data || []) : (bills || []),
    {
      scope: billScope, dateFrom: filterDateFrom, dateTo: filterDateTo, vendor: filterVendor,
      status: filterStatus, category: filterCategory, party: filterParty, site: filterSite,
    }, sites,
  ), [scopeIndependentBills, bills, financialReview.data, canViewFinancials, billScope, sites, filterDateFrom, filterDateTo, filterVendor, filterStatus, filterCategory, filterParty, filterSite]);
  const billsHiddenByUnpaid = billScope === "unpaid" ? Math.max(0, scopeIndependentBills.length - filteredBills.length) : 0;

  const financialBills = useMemo(() => {
    if (!canViewFinancials || financialReview.isError) return [];
    const visibleIds = new Set(filteredBills.map(b => b.id));
    return (financialReview.data || []).filter(b => visibleIds.has(b.id));
  }, [canViewFinancials, financialReview.data, financialReview.isError, filteredBills]);
  const handleGstRegisterExport = async (fmt: "pdf" | "xlsx") => {
    if (!canViewFinancials || financialReview.isError) return;
    if (!filteredBills.length) {
      toast({ title: "Nothing to export", description: "Adjust the filters to include some bills." });
      return;
    }
    try {
      const params = new URLSearchParams();
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      if (filterVendor && filterVendor !== "all") params.set("vendor", filterVendor);
      if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
      if (filterCategory && filterCategory !== "all") params.set("category", filterCategory);
      if (filterParty !== "all") params.set("party", filterParty);
      if (filterSite) {
        const selectedSite = sites.find(site => siteMatchesPermitted(site.name, [filterSite]));
        if (!selectedSite) throw new Error("Select a registered site before exporting this site filter.");
        params.set("siteId", String(selectedSite.id));
      }
      params.set("format", fmt);
      params.set("report", "financial-summary");
      params.set("scope", billScope);
      params.set("billIds", filteredBills.map(b => b.id).join(","));
      const res = await fetch(`/api/vendor-bills/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const sortedDates = filteredBills.map(b => b.billDate).filter(Boolean).sort();
      const fromD = filterDateFrom || sortedDates[0] || "";
      const toD = filterDateTo || sortedDates[sortedDates.length - 1] || "";
      const range = !fromD && !toD ? "all-dates" : (fromD === toD ? fromD : `${fromD || "…"}_to_${toD || "…"}`);
      const isLedger = filterVendor && filterVendor !== "all";
      const scope = isLedger ? `vendor-ledger-${filterVendor}` : "taxes-register";
      const filename = `${scope}-${range}.${fmt}`.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_(pdf|xlsx)$/, ".$1");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: `Exported ${fmt.toUpperCase()}`,
        description: `${filteredBills.length} bill${filteredBills.length === 1 ? "" : "s"} included with summary cover.`,
      });
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  const escHtml = (str: string) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  const handlePrint = (bill: VendorBillWithItems) => {
    const hasLeadDistance = bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0);
    const hasSuppliedOrTransporter = canViewBills && bill.items.some((it: any) => it.suppliedTo || it.transporter);
    const catSubs = computeCategorySubTotals(bill.items);
    const shouldGroup = catSubs.length > 1;
    const printCategories = ["equipment", "material", "transport", "labour", "other"];
    const printCatLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", labour: "LABOUR", other: "OTHER" };
    const colCount = hasLeadDistance ? (hasSuppliedOrTransporter ? 11 : 9) : (hasSuppliedOrTransporter ? 10 : 8);
    const labelColCount = hasLeadDistance ? (hasSuppliedOrTransporter ? 10 : 8) : (hasSuppliedOrTransporter ? 9 : 7);

    const renderPrintRow = (item: any, i: number) => {
      const badge = parseSiteBadge(item);
      const siteHtml = badge ? `<div style="font-size:10px;color:#555;font-style:italic;margin-top:2px;">${escHtml(badge.label)}</div>` : "";
      return `
      <tr class="${i % 2 === 0 ? "even" : "odd"}">
        <td style="text-align:center">${i + 1}</td>
        <td>${escHtml(formatDate(item.date))}</td>
        <td style="text-align:center">${item.category ? escHtml(getCategoryLabel(item.category).toUpperCase()) : "-"}</td>
        <td>${escHtml(item.description)}${siteHtml}</td>
        ${hasSuppliedOrTransporter ? `<td>${item.suppliedTo ? escHtml(item.suppliedTo) : "—"}</td><td>${item.transporter ? escHtml(item.transporter) : "—"}</td>` : ""}
        <td style="text-align:center">${formatQty(item.qty)}</td>
        <td style="text-align:center">${item.unit || ""}</td>
        ${hasLeadDistance ? `<td style="text-align:center">${item.leadDistance ? `${formatQty(item.leadDistance)} (RT: ${formatQty(item.leadDistance * 2)})` : "-"}</td>` : ""}
        <td style="text-align:right">${formatCurrency(item.rate)}</td>
        <td style="text-align:right">${formatCurrency(item.amount)}</td>
      </tr>
    `;
    };

    let rows = "";
    if (shouldGroup) {
      for (const cat of printCategories) {
        const catItems = bill.items.filter((it: any) => it.category === cat).map((item: any, origIdx: number) => ({
          item, origIdx: bill.items.indexOf(item)
        }));
        if (catItems.length === 0) continue;
        const catTotal = catItems.reduce((sum: number, { item }: any) => sum + (item.amount || 0), 0);
        const catGstRate = cat === "equipment" ? (bill as any).gstRateEquipment : cat === "material" ? (bill as any).gstRateMaterial : cat === "transport" ? (bill as any).gstRateTransport : cat === "labour" ? (bill as any).gstRateLabour : 0;
        const catGstAmt = catGstRate ? catTotal * catGstRate / 100 : 0;
        rows += `<tr class="cat-header"><td colspan="${colCount}" style="background:#f0f0f0;font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding:8px;">${printCatLabels[cat]} (${catItems.length} items)</td></tr>`;
        rows += catItems.map(({ item, origIdx }: any) => renderPrintRow(item, origIdx)).join("");
        rows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right">${printCatLabels[cat]} Sub-total</td><td style="text-align:right">Rs. ${formatCurrency(catTotal)}</td></tr>`;
        if (cat === "labour") {
          let siteAmt = 0, plantAmt = 0;
          for (const { item } of catItems as any[]) {
            const src = getLabourSource(item);
            if (src === "site") siteAmt += item.amount || 0;
            else if (src === "plant") plantAmt += item.amount || 0;
          }
          if (siteAmt > 0 && plantAmt > 0) {
            rows += `<tr class="summary-row"><td colspan="${colCount}" style="text-align:right;font-weight:normal;font-style:italic;font-size:11px;color:#444;">of which DPR Site: Rs. ${formatCurrency(siteAmt)} &nbsp;·&nbsp; Plant Shift: Rs. ${formatCurrency(plantAmt)}</td></tr>`;
          }
        }
        if (catGstRate > 0) {
          rows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#15803d;">GST ON ${printCatLabels[cat]} @ ${catGstRate}%</td><td style="text-align:right;color:#15803d;">+ Rs. ${formatCurrency(catGstAmt)}</td></tr>`;
        }
      }
    } else {
      rows = bill.items.map((item: any, i: number) => renderPrintRow(item, i)).join("");
      const onlyLabour = bill.items.length > 0 && bill.items.every((it: any) => (it.category || "other") === "labour");
      if (onlyLabour) {
        let siteAmt = 0, plantAmt = 0;
        for (const item of bill.items as any[]) {
          const src = getLabourSource(item);
          if (src === "site") siteAmt += item.amount || 0;
          else if (src === "plant") plantAmt += item.amount || 0;
        }
        if (siteAmt > 0 && plantAmt > 0) {
          rows += `<tr class="summary-row"><td colspan="${colCount}" style="text-align:right;font-weight:normal;font-style:italic;font-size:11px;color:#444;">of which DPR Site: Rs. ${formatCurrency(siteAmt)} &nbsp;·&nbsp; Plant Shift: Rs. ${formatCurrency(plantAmt)}</td></tr>`;
        }
      }
    }

    const totalQty = bill.items.reduce((s: number, it: any) => s + (it.qty || 0), 0);
    const totalItems = bill.items.length;

    const printContent = `
      <!DOCTYPE html><html><head><title>Vendor Bill - ${bill.billNo}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 24px; color: #000; }
        .header { text-align: center; margin-bottom: 16px; border-bottom: 3px solid #d97706; padding-bottom: 12px; }
        .header img { height: 50px; margin-bottom: 5px; }
        .header h1 { font-size: 22px; letter-spacing: 2px; margin-bottom: 4px; color: #000; }
        .header .subtitle { font-size: 14px; color: #333; text-transform: uppercase; letter-spacing: 1px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .meta-grid .item { padding: 4px 0; }
        .meta-grid .label { color: #333; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; font-weight: bold; }
        .meta-grid .value { font-weight: bold; font-size: 13px; color: #000; }
        .status-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; background: #d97706; color: white; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 12px; color: #000; }
        th { background: #d97706; color: white; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        tr.odd { background: #f9f9f9; }
        .cat-header td { border-left: 4px solid #d97706; }
        .summary-row td { font-weight: bold; font-size: 12px; background: #f5f5f5; color: #000; border-color: #999; }
        .total-row { background: #d97706 !important; }
        .total-row td { color: white; font-weight: bold; font-size: 13px; border-color: #b45309; }
        .notes { margin-top: 16px; padding: 10px 14px; background: #fffbeb; border-left: 3px solid #d97706; font-size: 12px; color: #000; }
        .notes strong { font-size: 11px; text-transform: uppercase; color: #92400e; }
        .signatures { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-start; page-break-inside: avoid; }
        .sig-block { width: 220px; text-align: center; }
        .sig-block.vendor { margin-top: 30px; }
        .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 6px; font-size: 11px; color: #000; }
        .sig-label { font-size: 11px; font-weight: bold; color: #000; }
        .footer { margin-top: 30px; font-size: 10px; color: #555; text-align: center; border-top: 1px solid #ccc; padding-top: 8px; }
        @media print { body { padding: 12px; } .signatures { page-break-inside: avoid; } }
      </style></head><body>
      <div class="header">
        <img src="${window.location.origin}/${logoFile}" style="height: 50px; margin-bottom: 6px;" onerror="this.style.display='none'" />
        <h1>${companyName.toUpperCase()}</h1>
        <div class="subtitle">Vendor Bill</div>
      </div>
      <div class="meta-grid">
        <div class="item"><div class="label">Bill Number</div><div class="value">${escHtml(bill.billNo)}</div></div>
        <div class="item"><div class="label">Bill Date</div><div class="value">${escHtml(formatDate(bill.billDate))}</div></div>
        <div class="item"><div class="label">Vendor</div><div class="value">${escHtml(bill.vendorName)}</div></div>
        <div class="item"><div class="label">Bill Type</div><div class="value">${escHtml(getBillTypeLabel(bill.billType))}</div></div>
        ${bill.periodFrom && bill.periodTo ? `<div class="item"><div class="label">Period</div><div class="value">${escHtml(formatDate(bill.periodFrom))} to ${escHtml(formatDate(bill.periodTo))}</div></div>` : ""}
        <div class="item"><div class="label">Status</div><div class="value"><span class="status-badge">${escHtml(bill.status.toUpperCase())}</span></div></div>
      </div>
      <table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th>${hasSuppliedOrTransporter ? "<th>Supplied To</th><th>Transporter</th>" : ""}<th>Qty</th><th>Unit</th>${hasLeadDistance ? "<th>Lead (KM)</th>" : ""}<th style="text-align:right">Rate (₹)</th><th style="text-align:right">Amount (₹)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="summary-row"><td colspan="${(hasLeadDistance ? 5 : 4) + (hasSuppliedOrTransporter ? 2 : 0)}" style="text-align:right">TOTAL ITEMS: ${totalItems}</td><td style="text-align:center">${formatQty(totalQty)}</td><td colspan="${hasLeadDistance ? 4 : 3}"></td></tr>
        <tr class="total-row"><td colspan="${labelColCount}" style="text-align:right">TOTAL AMOUNT</td><td style="text-align:right">Rs. ${formatCurrency(bill.totalAmount)}</td></tr>
        ${(() => {
          const pb = bill as any;
          const pCatSubs: Record<string, number> = {};
          bill.items.forEach((it: any) => { const c = it.category || "other"; pCatSubs[c] = (pCatSubs[c] || 0) + (it.amount || 0); });
          const pGstEq = pb.gstRateEquipment ? (pCatSubs["equipment"] || 0) * pb.gstRateEquipment / 100 : 0;
          const pGstMat = pb.gstRateMaterial ? (pCatSubs["material"] || 0) * pb.gstRateMaterial / 100 : 0;
          const pGstTr = pb.gstRateTransport ? (pCatSubs["transport"] || 0) * pb.gstRateTransport / 100 : 0;
          const pGstLab = pb.gstRateLabour ? (pCatSubs["labour"] || 0) * pb.gstRateLabour / 100 : 0;
          const pIsAllType = bill.billType?.toLowerCase() === "all";
          const pUsePerGroupGst = pIsAllType || shouldGroup;
          const pSingleGstRate = !pUsePerGroupGst
            ? (bill.billType?.toLowerCase() === "equipment" ? pb.gstRateEquipment
              : bill.billType?.toLowerCase() === "material" ? pb.gstRateMaterial
              : bill.billType?.toLowerCase() === "transport" ? pb.gstRateTransport
              : bill.billType?.toLowerCase() === "labour" ? pb.gstRateLabour : 0) || 0
            : 0;
          const pSingleGstAmt = pSingleGstRate ? (bill.totalAmount || 0) * pSingleGstRate / 100 : 0;
          const pTotalGst = pUsePerGroupGst ? pGstEq + pGstMat + pGstTr + pGstLab : pSingleGstAmt;
          const pAdvAmt = pb.adjustmentAmount || 0;
          const pAdvLabel = pb.adjustmentLabel || "ADVANCE DEDUCTION";
          const pAdditionalAdjustments = billAdditionalAdjustments(pb);
          const pAdditionalTotal = pAdditionalAdjustments.reduce((sum, adjustment) => sum + (Number(adjustment.amount) || 0), 0);
          const pTdsR = pb.tdsRate || 0;
          const pTdsAmt = pTdsR ? (bill.totalAmount || 0) * pTdsR / 100 : 0;
          const pHasAny = pTotalGst !== 0 || pAdvAmt !== 0 || pAdditionalAdjustments.length > 0 || pTdsAmt !== 0;
          if (!pHasAny) return "";
          const pNetTotal = (bill.totalAmount || 0) + pTotalGst + pAdvAmt + pAdditionalTotal - pTdsAmt;
          let adjRows = "";
          if (!pUsePerGroupGst && pSingleGstRate > 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#15803d;">GST @ ${pSingleGstRate}%</td><td style="text-align:right;color:#15803d;">+ Rs. ${formatCurrency(pSingleGstAmt)}</td></tr>`;
          }
          if (pUsePerGroupGst && pTotalGst > 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#15803d;">TOTAL GST</td><td style="text-align:right;color:#15803d;">+ Rs. ${formatCurrency(pTotalGst)}</td></tr>`;
          }
          if (pAdvAmt !== 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right">${escHtml(pAdvLabel)}</td><td style="text-align:right">Rs. ${formatCurrency(pAdvAmt)}</td></tr>`;
          }
          pAdditionalAdjustments.forEach((adjustment, index) => {
            const label = adjustment.label || "ADDITIONAL DEDUCTION / CREDIT";
            adjRows += `<tr class="summary-row" data-additional-adjustment="${index}"><td colspan="${labelColCount}" style="text-align:right">${escHtml(label)}</td><td style="text-align:right">Rs. ${formatCurrency(adjustment.amount)}</td></tr>`;
          });
          if (pTdsAmt > 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#dc2626;">IT TDS @ ${pTdsR}%</td><td style="text-align:right;color:#dc2626;">- Rs. ${formatCurrency(pTdsAmt)}</td></tr>`;
          }
          adjRows += `<tr class="total-row"><td colspan="${labelColCount}" style="text-align:right">NET TOTAL</td><td style="text-align:right">Rs. ${formatCurrency(pNetTotal)}</td></tr>`;
          return adjRows;
        })()}
      </tfoot>
      </table>
      ${bill.notes ? `<div class="notes"><strong>Notes / Remarks:</strong><br/>${escHtml(bill.notes)}</div>` : ""}
      <div class="signatures">
        <div class="sig-block vendor">
          <div class="sig-label">Vendor Acknowledgement</div>
          <div class="sig-line">${escHtml(bill.vendorName)}</div>
        </div>
        <div class="sig-block">
          <div class="sig-label">For ${companyName.toUpperCase()}</div>
          <div class="sig-line">Authorized Signatory</div>
        </div>
      </div>
      <div class="footer">Generated on ${new Date().toLocaleString("en-IN")} | ${companyName.toUpperCase()}</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
      </body></html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';

    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 30000);
  };

  const renderStatusSteps = (currentStatus: string, meta?: {
    createdAt?: string | Date | null;
    authorName?: string | null;
    verifiedAt?: string | null;
    verifiedBy?: string | null;
    approvedAt?: string | null;
    approvedBy?: string | null;
    paidAt?: string | null;
    paymentRecordedBy?: string | null;
    paymentAccountKey?: string | null;
  }) => {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus as any);
    const stepMeta: Record<string, { timestamp?: string | null; actor?: string | null }> = {
      draft: {
        timestamp: formatTimestamp(meta?.createdAt),
        actor: meta?.authorName?.trim() || "author not recorded",
      },
      verified: { timestamp: formatTimestamp(meta?.verifiedAt), actor: meta?.verifiedBy?.trim() || "not recorded" },
      approved: { timestamp: formatTimestamp(meta?.approvedAt), actor: meta?.approvedBy?.trim() || "not recorded" },
      // 06M-F §7A: show who marked it paid, same as verified/approved actors.
      paid: { timestamp: formatTimestamp(meta?.paidAt), actor: meta?.paymentRecordedBy?.trim() || "not recorded" },
    };
    return (
      <div className="flex items-start gap-1 flex-wrap" data-testid="status-steps">
        {STATUS_ORDER.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          const sm = stepMeta[step];
          return (
            <div key={step} className="flex items-start gap-1">
              {idx > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground mt-1.5" />}
              <div className="flex flex-col items-center gap-0.5">
                <Badge
                  variant={isDone ? "default" : isActive ? "secondary" : "outline"}
                  className={`text-sm uppercase ${isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate" : ""}`}
                  data-testid={`status-step-${step}`}
                >
                  {isDone && <Check className="w-3 h-3 mr-1" />}
                  {isActive && <Circle className="w-2 h-2 mr-1 fill-current" />}
                  {step}
                </Badge>
                {(isDone || isActive) && (
                  <span className="text-[12px] text-muted-foreground whitespace-nowrap leading-tight">{sm.timestamp}</span>
                )}
                {(isDone || isActive) && (
                  <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap leading-tight">{sm.actor}</span>
                )}
                {step === "paid" && (isDone || isActive) && <VendorBillPaidAccount paymentAccountKey={meta?.paymentAccountKey} />}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (view === "form") {
    return (
      <>
      {showDraftRateCards && <RateCards draftVendor={vendorName} onReturnToDraft={() => {
        setShowDraftRateCards(false);
        requestAnimationFrame(() => window.scrollTo(0, draftScrollRef.current));
      }} />}
      {/* Keep the complete editor subtree mounted, including child-local state,
          refs and unsaved inputs. No route change or dirty-guard bypass. */}
      <div className="max-w-5xl mx-auto space-y-4 p-4" hidden={showDraftRateCards}>
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => { resetForm(); setView("list"); }} data-testid="button-back-form">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-form-title">
            {editingBillId ? "EDIT VENDOR BILL" : "NEW VENDOR BILL"}
          </h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">BILL DETAILS</CardTitle>
            <Badge variant="secondary" className="uppercase" data-testid="badge-status-draft">DRAFT</Badge>
            <WholeBillExportButtons canExport={canExport} isFieldEngineer={user?.isFieldEngineer}
              isAdmin={user?.isAdmin} isOwner={user?.isOwner}
              position="header" getSnapshot={getCurrentFormSnapshot} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm uppercase">{isHistoricalHireEdit ? "Invoice Date" : "Bill Date"}</Label>
                <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} data-testid="input-bill-date" />
              </div>
              <div>
                <Label className="text-sm uppercase">{isHistoricalHireEdit ? "Vendor Invoice No." : "Bill Number"}</Label>
                <Input value={billNo} onChange={e => setBillNo(e.target.value)} onBlur={e => setBillNo(e.target.value.toUpperCase())} placeholder="AUTO-GENERATED" className="uppercase" data-testid="input-bill-no" />
              </div>
              <div>
                <Label className="text-sm uppercase">Bill Type</Label>
                  <Select value={billType} disabled={isHistoricalHireEdit} onValueChange={(val) => {
                  updateActivePullContext(val, vendorName, periodFrom, periodTo);
                  setBillType(val);
                  const newCat = (val === "transport" || val === "equipment" || val === "material" || val === "labour") ? val : "other";
                  const newUnit = val === "transport" ? "TRIP" : val === "labour" ? "HEAD-DAY" : undefined;
                  setLineItems(prev => prev.map(item => {
                    if (item.source === "manual") {
                      const updated = { ...item, category: newCat };
                      if (newUnit) updated.unit = newUnit;
                      if (newCat !== "transport") { updated.leadDistance = null; updated.transportPricing = null; }
                      updated.amount = calcAmount(updated);
                      return updated;
                    }
                    return item;
                  }));
                }}>
                  <SelectTrigger data-testid="select-bill-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILL_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm uppercase">Site</Label>
                <Select value={selectedSiteId} onValueChange={(value) => {
                  cancelActivePull();
                  const selectedName = sites.find(site => String(site.id) === value)?.name ?? null;
                  setSelectedSiteId(value);
                  setLineItems(items => items
                    .filter(item => !isGeneratedEvidenceLine(item.source))
                    .map(item => item.initialBlank && !item.siteName
                      ? { ...item, siteName: selectedName }
                      : item));
                }}>
                  <SelectTrigger data-testid="select-bill-site">
                    <SelectValue placeholder="ALL SITES" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL SITES</SelectItem>
                    {sites.map(site => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Label className="text-sm uppercase">Vendor / Supplier Name</Label>
                <Input
                  value={(vendorName && isHireVendorDisplay ? selectedHireVendorLabel : vendorName) || vendorSearch}
                  disabled={isHistoricalHireEdit}
                  onChange={e => {
                    const v = e.target.value.toUpperCase();
                    updateActivePullContext(billType, "", periodFrom, periodTo);
                    setVendorSearch(v);
                    setVendorName("");
                    setHireGroups([]);
                    monthlyHireSeedRef.current = "";
                    setMonthlyHireSeedKey("");
                    setShowVendorDropdown(true);
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowVendorDropdown(false), 200);
                    if (!vendorName && vendorSearch.trim()) {
                      const selectedVendor = vendorSearch.trim().toUpperCase();
                      updateActivePullContext(billType, selectedVendor, periodFrom, periodTo);
                      setVendorName(selectedVendor);
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !vendorName && vendorSearch.trim()) {
                      const selectedVendor = vendorSearch.trim().toUpperCase();
                      updateActivePullContext(billType, selectedVendor, periodFrom, periodTo);
                      setVendorName(selectedVendor);
                      setShowVendorDropdown(false);
                    }
                  }}
                  placeholder="SEARCH VENDOR..."
                  className="uppercase"
                  data-testid="input-vendor-name"
                />
                {showVendorDropdown && filteredVendorNames.length > 0 && !vendorName && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-zinc-900 border rounded-md shadow-lg" data-testid="vendor-dropdown">
                    {filteredVendorNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 truncate"
                        onMouseDown={() => {
                          updateActivePullContext(billType, name, periodFrom, periodTo);
                          setVendorName(name);
                          setVendorSearch(name);
                          setShowVendorDropdown(false);
                        }}
                        data-testid={`vendor-option-${name}`}
                      >
                        {isHireVendorDisplay ? vendorBillingIdentityLabel(name, billingIdentities.data) : name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-sm uppercase">Period From</Label>
                <Input type="date" value={periodFrom} onChange={e => {
                  const value = e.target.value;
                   updateActivePullContext(billType, vendorName, value, periodTo);
                  setPeriodFrom(value);
                  if (isHistoricalHireEdit) {
                    setHireGroups(prev => prev.map(group => ({ ...group, periodFrom: value })));
                  }
                }} data-testid="input-period-from" />
              </div>
              <div>
                <Label className="text-sm uppercase">Period To</Label>
                <Input type="date" value={periodTo} onChange={e => {
                  const value = e.target.value;
                   updateActivePullContext(billType, vendorName, periodFrom, value);
                  setPeriodTo(value);
                  if (isHistoricalHireEdit) {
                    setHireGroups(prev => prev.map(group => ({ ...group, periodTo: value })));
                  }
                }} data-testid="input-period-to" />
              </div>
            </div>
             {discoveryPeriodReady && billType !== "other" && !vendorName && (
              <div className="border-t pt-4">
                <Button
                  variant="default"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => setShowVendorDiscovery(true)}
                  disabled={discoveryLoading}
                  data-testid="button-show-vendors"
                >
                  {discoveryLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  SHOW AVAILABLE VENDORS
                </Button>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Bill Status</p>
              {renderStatusSteps("draft")}
            </div>
          </CardContent>
        </Card>

        {showVendorDiscovery && discoveryPeriodReady && billType !== "other" && (
          <Card data-testid="card-vendor-discovery">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">AVAILABLE VENDORS</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowVendorDiscovery(false)} data-testid="button-close-discovery">
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {discoveryLoading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                  <span className="text-sm text-muted-foreground">Scanning records...</span>
                </div>
              ) : !discoveredVendors || discoveredVendors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-vendors">
                  No records found for this type and period
                </div>
              ) : (
                <div className="space-y-2">
                  {discoveredVendors.map((vendor) => (
                    <div
                      key={vendor.vendorName}
                      className="flex items-center justify-between gap-3 p-3 border rounded-md flex-wrap"
                      data-testid={`row-vendor-${vendor.vendorName}`}
                    >
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="font-semibold text-sm truncate" data-testid={`text-vendor-name-${vendor.vendorName}`}>
                           {isHireVendorDisplay ? vendorBillingIdentityLabel(vendor.vendorName, billingIdentities.data) : vendor.vendorName}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                           <span className="text-sm text-muted-foreground" data-testid={`text-record-count-${vendor.vendorName}`}>
                            {`${vendor.recordCount || 0} record${vendor.recordCount !== 1 ? "s" : ""}`}
                           </span>
                          {(vendor.categories || []).map(cat => (
                            <Badge
                              key={cat}
                              variant="outline"
                              className={`text-[12px] ${getCategoryBadgeClass(cat)} no-default-hover-elevate no-default-active-elevate`}
                              data-testid={`badge-cat-${vendor.vendorName}-${cat}`}
                            >
                              {getCategoryLabel(cat)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {vendor.existingBill ? (
                          <>
                            <Badge
                              variant="outline"
                              className={`text-sm uppercase ${getStatusBadgeClass(vendor.existingBill.status)} no-default-hover-elevate no-default-active-elevate`}
                              data-testid={`badge-bill-status-${vendor.vendorName}`}
                            >
                              {vendor.existingBill.status} - {vendor.existingBill.billNo}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditExistingBill(vendor.existingBill!.id)}
                              data-testid={`button-edit-bill-${vendor.vendorName}`}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              EDIT
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-muted-foreground">NO BILL</span>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleSelectDiscoveredVendor(vendor)}
                              data-testid={`button-select-vendor-${vendor.vendorName}`}
                            >
                              <PlusCircle className="w-3 h-3 mr-1" />
                              SELECT &amp; CREATE
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {hireActivitiesError && ["equipment", "all"].includes(billType) && (
          <p role="alert">Could not load equipment activity. <Button type="button" onClick={() => reloadHireActivities()}>Retry</Button></p>
        )}

        {/* The former equipment-only guard was
            isHistoricalHireEdit && billType === "equipment"; ALL bills with
            legacy hire statements must retain the same read-only evidence. */}
        {isHistoricalHireEdit && ["equipment", "all"].includes(billType) && (
          <Card className="border-orange-200 dark:border-orange-800" data-testid="equipment-hire-straight-form">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider"><Calculator className="h-4 w-4 text-orange-600" />Equipment Hire</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {!vendorName || !periodFrom || !periodTo ? (
                <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">Choose the vendor and bill period, then select one equipment item. Its stored hire terms will be prepared automatically.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <Label className="text-xs uppercase">Equipment</Label>
                    <Select value={selectedHireEquipmentId ? String(selectedHireEquipmentId) : ""} disabled>
                      <SelectTrigger data-testid="select-equipment-hire"><SelectValue placeholder={hireActivitiesLoading ? "Loading equipment…" : "Select equipment"} /></SelectTrigger>
                      <SelectContent>
                        {hireEquipment.map((equipment: any) => {
                          return <SelectItem key={equipment.id} value={String(equipment.id)}>{formatEquipmentOptionLabel(equipment)}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    {!hireActivitiesLoading && !hireEquipment.length && <p className="mt-1 text-xs text-muted-foreground">No hired equipment is linked to this vendor for the selected period.</p>}
                  </div>
                  {hireGroups.length > 0 && !isHistoricalHireEdit && <Button type="button" variant="ghost" size="sm" onClick={() => {
                    contractorAdvanceSeedRef.current = "";
                    setHireGroups([]);
                  }} data-testid="button-clear-equipment-hire">Clear equipment</Button>}
                </div>
              )}
              {hireGroups.map((selection, index) => {
                const equipment = hireEquipmentFor(selection.equipmentId);
                const result = hireCalculated[index]?.result;
                const equipmentPerformance = performanceForGroup(selection);
                const maintenance = maintenanceForGroup(selection);
                const hireExceptions = (result?.exceptions || []).filter((exception: any) =>
                  exception.exceptionType === "breakdown" || exception.exceptionType === "operator_unavailable");
                const operatorDates = Array.from(new Set(hireExceptions
                  .filter((exception: any) => exception.exceptionType === "operator_unavailable" && exception.suggestedDeductionAmount != null)
                  .map((exception: any) => exception.date).filter(Boolean)));
                const possibleAdjustmentOverlap = operatorDates.length > 0
                  ? additionalAdjustments.filter(adjustment => adjustment.label.trim() !== "" || Number(adjustment.amount) !== 0)
                  : [];
                const diesel = result?.diesel;
                const recoveryAcceptUnavailable = diesel?.rateUnavailable || diesel?.expectedDieselAvailable === false;
                const dailyRows = buildBillingDailyRows(
                  equipmentPerformance.data?.fleet.find(row => row.equipmentId === selection.equipmentId)?.dailyRows || [],
                  selection.periodFrom,
                  selection.periodTo,
                  maintenance,
                );
                const projectSites = Array.from(new Set(dailyRows.map(row => row.performance?.projectSite).filter((value): value is string => !!value)));
                const adjustments = selection.adjustments || {};
                const hsdRecovery = Number(selection.dieselRecoveryFinalAmount || 0);
                const otherDebit = Number(adjustments.otherDebit || 0);
                const advanceAdjustment = Number(adjustments.advanceAdjustment || 0);
                const otherCredit = Number(adjustments.otherCredit || 0);
                 const financials = calculateEquipmentHireFinancials({
                   grossHire: Number(result?.grossAmount || 0),
                   breakdownDeduction: Number(result?.deductionAmount || 0),
                   hsdRecovery, otherDebit, advanceAdjustment, otherCredit,
                   gstRate: gstRateEquipment, tdsRate, paid: 0,
                 });
                const exportData: EquipmentHireExportData = {
                  billNo, vendorName, equipmentName: formatEquipmentOptionLabel(equipment || {}), projectSite: selection.projectSite,
                  periodFrom: selection.periodFrom, periodTo: selection.periodTo, hireBasis: HIRE_BASIS_LABELS[selection.basis],
                  rate: selection.rate, grossHire: Number(result?.grossAmount || 0), breakdownDeduction: Number(result?.deductionAmount || 0),
                  hsdRecovery, otherDebit, otherDebitReason: adjustments.otherDebitReason, advanceAdjustment,
                  advanceAdjustmentReason: adjustments.advanceAdjustmentReason, otherCredit, otherCreditReason: adjustments.otherCreditReason,
                   gstRate: financials.gstRate, gstAmount: financials.gstAmount, taxableAmount: financials.taxableAmount,
                   invoiceTotal: financials.invoiceTotal, tdsRate: financials.tdsRate, tdsAmount: financials.tdsAmount,
                   netPayable: financials.netPayable, paid: financials.paid,
                   dieselResponsibility: equipment?.hireDieselResponsibility, consumptionNorm: equipment?.consumptionNorm,
                };
                renderedHireOutputs.current.set(calendarKey(selection), exportData);
                rememberCalendar(calendarKey(selection), {
                  equipmentName: exportData.equipmentName, periodFrom: selection.periodFrom, periodTo: selection.periodTo,
                  rows: dailyRows, dieselResponsibility: exportData.dieselResponsibility,
                  consumptionNorm: exportData.consumptionNorm,
                  unavailableReason: equipmentPerformance.isFetching ? "Loading daily equipment activity…" : undefined,
                });
                return <div key={selection.id} className="space-y-4 rounded border bg-muted/20 p-3">
                  <div className="grid gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Hire Basis</p><p className="font-semibold">{HIRE_BASIS_LABELS[selection.basis]}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Rate</p><p className="font-semibold">₹{formatCurrency(selection.rate)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Hire Period</p><p className="font-semibold">{formatDate(selection.periodFrom)} – {formatDate(selection.periodTo)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Gross Hire</p><p className="font-semibold text-orange-700">₹{formatCurrency(result?.grossAmount || 0)}</p></div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-full sm:w-72"><Label className="text-[10px] uppercase">Project / Site (optional)</Label><Select value={selection.projectSite || "__all__"} onValueChange={value => patchHireGroup(selection.id, { projectSite: value === "__all__" ? undefined : value })}><SelectTrigger data-testid="select-equipment-hire-project"><SelectValue placeholder="All report sites" /></SelectTrigger><SelectContent><SelectItem value="__all__">All report sites</SelectItem>{projectSites.map(projectSite => <SelectItem key={projectSite} value={projectSite}>{projectSite}</SelectItem>)}</SelectContent></Select></div>
                    {selection.projectSite && <Button type="button" variant="ghost" size="sm" onClick={() => patchHireGroup(selection.id, { projectSite: undefined })}>Clear site</Button>}
                  </div>
                  <div className="rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Master terms · {String(equipment?.hireDieselResponsibility || "").toLowerCase() === "vendor" ? "Fuel / Diesel: Contractor Scope" : `Diesel: ${String(equipment?.hireDieselResponsibility || "Not recorded")}`} · Breakdown deductions: {equipment?.hireBreakdownDeductionEnabled ? "Enabled" : "Not enabled"}
                  </div>
                  {billType === "equipment" ? (
                    <DraftEquipmentHireCalendar
                      onExportSnapshot={calendar => rememberCalendar(calendarKey(selection), calendar)}
                      equipmentId={selection.equipmentId}
                      equipmentName={formatEquipmentOptionLabel(equipment || {})}
                      periodFrom={selection.periodFrom}
                      periodTo={selection.periodTo}
                      maintenance={maintenance}
                      dieselResponsibility={equipment?.hireDieselResponsibility}
                      consumptionNorm={equipment?.consumptionNorm}
                      exceptionDecisions={selection.exceptionDecisions}
                      dieselRecoveryDecision={selection.dieselRecoveryDecision}
                      exportData={exportData}
                      canExport={canExport}
                      disabled={equipmentPerformance.isFetching}
                      mode="detail"
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowEquipmentDailyActivity(true)} disabled={equipmentPerformance.isFetching} data-testid="button-view-daily-activity">{equipmentPerformance.isFetching ? "Loading daily activity…" : "View Daily Activity"}</Button>
                        {canExport && <Button type="button" variant="outline" size="sm" disabled={equipmentPerformance.isFetching} onClick={() => exportEquipmentHireBill(exportData, dailyRows, "pdf")} data-testid="button-export-equipment-hire-pdf">EXPORT PDF</Button>}
                        {canExport && <Button type="button" variant="outline" size="sm" disabled={equipmentPerformance.isFetching} onClick={() => exportEquipmentHireBill(exportData, dailyRows, "xlsx")} data-testid="button-export-equipment-hire-excel">EXPORT EXCEL</Button>}
                      </div>
                      <EquipmentHireDailyActivity open={showEquipmentDailyActivity} onOpenChange={setShowEquipmentDailyActivity} rows={dailyRows} dieselResponsibility={equipment?.hireDieselResponsibility} consumptionNorm={equipment?.consumptionNorm} />
                    </>
                  )}
                  {selection.basis === "trip" && <div className="space-y-2 border-t pt-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wide">Trip Candidate Review</p><p className="text-xs text-muted-foreground">Confirm each recorded trip before it is billed. If you exclude or correct a trip count, enter the reason/reference.</p></div>
                    {activityForGroup(selection).filter(activity => activity.entryType === "trip_based").map((activity: any) => {
                      const current = selection.tripDecisions.find(decision => decision.source === activity.source && decision.sourceId === activity.sourceId);
                      const without = selection.tripDecisions.filter(decision => !(decision.source === activity.source && decision.sourceId === activity.sourceId));
                      const selected = current?.selected === true;
                      const recordedTrips = Number(activity.numberOfTrips || 0);
                      const operationalOnSameDay = (activity.source === "site_material_trip" || activity.source === "bulk_transport_trip") &&
                        hasIncludedOperationalTripOnSameDay(activityForGroup(selection), selection.tripDecisions, activity);
                      const update = (patch: Partial<HireGroup["tripDecisions"][number]>) => patchHireGroup(selection.id, {
                        tripDecisions: [...without, { ...current, source: activity.source, sourceId: activity.sourceId, selected: current?.selected ?? false, ...patch }],
                      });
                      return <div key={`${activity.source}:${activity.sourceId}`} className="grid gap-2 rounded border p-2 text-xs sm:grid-cols-[minmax(0,1fr)_88px_80px_110px_minmax(160px,1fr)] sm:items-end">
                        <label className="flex items-start gap-2"><input type="checkbox" checked={selected} onChange={event => update({ selected: event.target.checked })} data-testid={`checkbox-trip-candidate-${activity.sourceId}`} /><span><strong>{formatDate(activity.businessDate)} · {activity.description || "Recorded trip"}</strong><span className="block text-muted-foreground">Recorded: {recordedTrips} trip{recordedTrips === 1 ? "" : "s"} · {String(activity.source).replace(/_/g, " ")}</span><span className="block font-semibold">{current?.selected === true ? "Accepted for billing" : current?.selected === false ? "Explicitly excluded" : "Review required"}</span></span></label>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => update({ selected: false })} disabled={current?.selected === false}>Exclude</Button>
                        <div><Label className="text-[10px] uppercase">Recorded</Label><p className="h-9 pt-2 font-semibold">{recordedTrips}</p></div>
                        <div><Label className="text-[10px] uppercase">Billable trips</Label><Input type="number" min="0" step="1" value={current?.correctedTrips ?? ""} placeholder={String(recordedTrips)} disabled={!selected} onChange={event => update({ correctedTrips: event.target.value === "" ? undefined : Number(event.target.value) })} /></div>
                        <div><Label className="text-[10px] uppercase">Decision reason / reference</Label><Input value={current?.remarks || ""} placeholder={activity.source === "site_material_trip" || activity.source === "bulk_transport_trip" ? "Required for every decision" : selected ? "Required if corrected" : "Required if excluded"} onChange={event => update({ remarks: event.target.value.toUpperCase() })} />{operationalOnSameDay && <label className="mt-2 flex items-start gap-2 font-medium"><input type="checkbox" checked={current?.separateFromOperational === true} disabled={!selected} onChange={event => update({ separateFromOperational: event.target.checked })} data-testid={`checkbox-separate-trip-${activity.sourceId}`} /><span>Verified: this delivery is a separate trip from same-day operational usage</span></label>}</div>
                      </div>;
                    })}
                  </div>}
                  {hireExceptions.length > 0 && <div className="space-y-3 border-t pt-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide">Availability / Breakdown Exception Review</p>
                      <p className="text-xs text-muted-foreground">No amount is deducted unless a deduction decision is recorded. Idle · No Work Available and dates without recorded status remain deduction-free.</p>
                    </div>
                    {equipment?.hireBreakdownDeductionEnabled && hireExceptions.some((exception: any) => exception.exceptionType === "breakdown" && exception.downtimeHours != null) && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Actual downtime divisor</span><Select value={selection.breakdownHoursPerDay ? String(selection.breakdownHoursPerDay) : ""} onValueChange={value => patchHireGroup(selection.id, { breakdownHoursPerDay: Number(value) })}><SelectTrigger className="h-8 w-48"><SelectValue placeholder="Choose 10–12 hours / day" /></SelectTrigger><SelectContent><SelectItem value="10">10 hours / day</SelectItem><SelectItem value="11">11 hours / day</SelectItem><SelectItem value="12">12 hours / day</SelectItem></SelectContent></Select><span className="text-muted-foreground">Required before actual downtime deduction.</span></div>}
                    {possibleAdjustmentOverlap.length > 0 && <div className="rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950" role="alert" data-testid={`operator-adjustment-warning-${selection.id}`}>
                      <strong>Possible double-counting:</strong> operator-unavailable suggestions for {operatorDates.map(formatDate).join(", ")} appear alongside these manual bill adjustments: {possibleAdjustmentOverlap.map(adjustment => `${adjustment.label || "Unlabelled adjustment"} (₹${formatCurrency(Number(adjustment.amount) || 0)})`).join("; ")}. Review both lines; neither has been suppressed.
                    </div>}
                    {hireExceptions.map((exception: any) => {
                      const sourceType = exception.sourceType as "usage" | "maintenance";
                      const exceptionType = exception.exceptionType as "breakdown" | "operator_unavailable";
                      const current = selection.exceptionDecisions.find((decision: any) =>
                        decision.sourceType === sourceType && decision.sourceId === exception.sourceId &&
                        decision.exceptionType === exceptionType && decision.date === exception.date);
                      const without = selection.exceptionDecisions.filter((decision: any) =>
                        !(decision.sourceType === sourceType && decision.sourceId === exception.sourceId &&
                          decision.exceptionType === exceptionType && decision.date === exception.date));
                      const setDecision = (decision: string, patch: Record<string, any> = {}) => patchHireGroup(selection.id, {
                        exceptionDecisions: [...without, {
                          ...current, sourceType, sourceId: exception.sourceId, exceptionType, date: exception.date, ...patch, decision,
                        }],
                      });
                      const isOperator = exceptionType === "operator_unavailable";
                      const choiceRequired = isOperator && !current?.decision;
                      const currentDecision = isOperator
                        ? current?.decision ?? "__review__"
                        : current?.decision ?? exception.decision ?? "none";
                      const duplicate = String(exception.remarks || "").startsWith("DUPLICATE BREAKDOWN SOURCE");
                      const relatedMaintenance = sourceType === "maintenance"
                        ? maintenance.find((row: any) => Number(row.sourceId) === Number(exception.sourceId))
                        : undefined;
                      const workings = exception.suggestionWorkings;
                      const unavailable = workings?.unavailableReason;
                      const sourceName = sourceType === "maintenance" ? "Maintenance log" : "Recorded DPR / Plant status";
                      return <div key={`${sourceType}:${exception.sourceId}:${exceptionType}:${exception.date}`} className="space-y-2 rounded border bg-white p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{formatDate(exception.date)} · {isOperator ? "Operator / Driver Unavailable" : "Breakdown"}</strong>
                          <span className="rounded border px-2 py-0.5 text-[10px] text-slate-600">{sourceName}</span>
                          {relatedMaintenance?.downtimeHours != null && <span className="text-muted-foreground">{Number(relatedMaintenance.downtimeHours)} actual downtime hours{relatedMaintenance.fromTime || relatedMaintenance.toTime ? ` · ${relatedMaintenance.fromTime || "?"}–${relatedMaintenance.toTime || "?"}` : ""}</span>}
                        </div>
                        <p className="text-muted-foreground">{exception.description}</p>
                        {workings?.amount != null && <p className="rounded bg-slate-50 p-2" data-testid={`hire-exception-workings-${sourceType}-${exception.sourceId}`}>
                          <strong>Suggestion workings — {workings.date}:</strong>{" "}
                          {isOperator
                            ? workings.divisorLabel?.includes("no conversion")
                              ? `Agreed rate ₹${formatCurrency(workings.contractRate)} used directly; resulting amount ₹${formatCurrency(workings.amount)}.`
                              : `Day rate ₹${formatCurrency(workings.dayRate)} = contract rate ₹${formatCurrency(workings.contractRate)} ÷ ${workings.divisor} (${workings.divisorLabel}); suggested amount ₹${formatCurrency(workings.amount)}.`
                            : `${workings.rateCalculation}; day rate ₹${formatCurrency(workings.dayRate)} from contract rate ₹${formatCurrency(workings.contractRate)}; divisor ${workings.divisorLabel}; actual downtime ${workings.hours} hours; suggested amount ₹${formatCurrency(workings.amount)}.`}
                        </p>}
                        {unavailable && <p className="rounded bg-amber-50 p-2 text-amber-900">No amount suggested for {formatDate(exception.date)}. {unavailable} Choose no deduction or enter a manual amount; a half/full-day suggestion cannot be accepted.</p>}
                        {duplicate ? <p className="font-semibold text-amber-800">{exception.remarks} · No second deduction is applied.</p> : (
                          <div className="grid gap-2 sm:grid-cols-[minmax(170px,220px)_minmax(150px,1fr)_minmax(180px,1fr)] sm:items-end">
                            <Select value={currentDecision} onValueChange={value => setDecision(value)} disabled={exceptionType === "breakdown" && !equipment?.hireBreakdownDeductionEnabled}>
                              <SelectTrigger className="h-8"><SelectValue placeholder="Choose or confirm a decision" /></SelectTrigger>
                              <SelectContent>
                                {choiceRequired && <SelectItem value="__review__" disabled>Choose or confirm a decision</SelectItem>}
                                <SelectItem value="none">No deduction</SelectItem>
                                {isOperator ? <>
                                  <SelectItem value="half_day">Half day</SelectItem>
                                  <SelectItem value="full_day">Full day</SelectItem>
                                  <SelectItem value="manual">Manual amount</SelectItem>
                                </> : <>
                                  <SelectItem value="hours" disabled={sourceType !== "maintenance" || !selection.breakdownHoursPerDay || relatedMaintenance?.downtimeHours == null}>Actual downtime</SelectItem>
                                  <SelectItem value="half_day">Half day</SelectItem>
                                  <SelectItem value="full_day">Full day</SelectItem>
                                  <SelectItem value="manual">Manual amount</SelectItem>
                                </>}
                              </SelectContent>
                            </Select>
                            {choiceRequired && <p className="text-amber-800">No deduction is currently applied. Confirm “No deduction” or choose a deduction before saving.</p>}
                            {currentDecision === "manual" && <Input type="number" min="0" step="0.01" placeholder="Manual deduction ₹" value={current?.manualDeductionAmount ?? ""} onChange={event => setDecision("manual", { manualDeductionAmount: event.target.value === "" ? undefined : Number(event.target.value) })} />}
                            {currentDecision === "manual" && <Input placeholder="Reason / reference" value={current?.remarks || ""} onChange={event => setDecision("manual", { remarks: event.target.value.toUpperCase() })} />}
                            {currentDecision !== "manual" && exception.deductionAmount > 0 && <p className="font-semibold text-slate-700">Applied deduction: ₹{formatCurrency(exception.deductionAmount)}</p>}
                          </div>
                        )}
                      </div>;
                    })}
                  </div>}
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide">Adjustments / Recoveries</p>
                    {String(equipment?.hireDieselResponsibility || "").toLowerCase() === "hlc" && <div className="space-y-3 rounded border p-3 text-xs">
                      <strong>HSD supplied by HLC</strong>
                      <div className="grid gap-2 sm:grid-cols-5">
                        <div><span className="text-muted-foreground">Actual Diesel Consumed</span><strong className="block">{diesel?.actualDiesel == null ? "Tank Readings N/A" : `${Number(diesel.actualDiesel).toFixed(2)} L`}</strong></div>
                        <div><span className="text-muted-foreground">Expected Diesel</span><strong className="block">{diesel?.expectedDieselAvailable === false || diesel?.expectedDiesel == null ? "Tank Readings N/A" : `${Number(diesel.expectedDiesel).toFixed(2)} L`}</strong></div>
                        <div><span className="text-muted-foreground">Net Excess</span><strong className="block">{diesel?.expectedDieselAvailable === false ? "Tank Readings N/A" : `${Number(diesel?.suggestedExcess || 0).toFixed(2)} L`}</strong></div>
                        <div><span className="text-muted-foreground">Applicable HSD Rate</span><strong className="block">{diesel?.rateUnavailable ? "Rate unavailable" : diesel?.applicableRate == null ? "Rate unavailable" : `₹${formatCurrency(diesel.applicableRate)} / L`}</strong></div>
                        <div><span className="text-muted-foreground">Suggested HSD Recovery</span><strong className="block">{diesel?.expectedDieselAvailable === false ? "Tank Readings N/A" : diesel?.rateUnavailable ? "Rate unavailable" : `₹${formatCurrency(diesel?.suggestedRecoveryAmount || 0)}`}</strong></div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant={selection.dieselRecoveryDecision === "accept" ? "default" : "outline"} disabled={recoveryAcceptUnavailable || !diesel?.suggestedRecoveryAmount} onClick={() => patchHireGroup(selection.id, { dieselRecoveryDecision: "accept", dieselRecoveryFinalAmount: Number(diesel?.suggestedRecoveryAmount || 0) })}>Accept Suggested</Button>
                        <Button type="button" size="sm" variant={selection.dieselRecoveryDecision === "edit" ? "default" : "outline"} onClick={() => patchHireGroup(selection.id, { dieselRecoveryDecision: "edit" })}>Edit</Button>
                        <Button type="button" size="sm" variant={selection.dieselRecoveryDecision === "ignore" || !selection.dieselRecoveryDecision ? "default" : "outline"} onClick={() => patchHireGroup(selection.id, { dieselRecoveryDecision: "ignore", dieselRecoveryFinalAmount: 0 })}>No Recovery</Button>
                      </div>
                      {selection.dieselRecoveryDecision === "edit" && <div className="grid gap-2 sm:grid-cols-2"><div><Label className="text-[10px] uppercase">Final Recovery ₹</Label><Input type="number" min="0" placeholder="Enter agreed ₹ amount" value={selection.dieselRecoveryFinalAmount ?? ""} onChange={event => patchHireGroup(selection.id, { dieselRecoveryFinalAmount: event.target.value === "" ? undefined : Number(event.target.value) })} /></div><div><Label className="text-[10px] uppercase">Reason / reference (required)</Label><Input value={selection.dieselRecoveryRemarks || ""} onChange={event => patchHireGroup(selection.id, { dieselRecoveryRemarks: event.target.value.toUpperCase() })} /></div></div>}
                    </div>}
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[["Other Debit / Recovery", "otherDebit", "otherDebitReason"], ["Advance Adjustment", "advanceAdjustment", "advanceAdjustmentReason"], ["Other Credit", "otherCredit", "otherCreditReason"]].map(([label, amountKey, reasonKey]) => <div key={amountKey}><Label className="text-[10px] uppercase">{label} ₹</Label><Input type="number" min="0" step="0.01" value={(adjustments as any)[amountKey] ?? ""} onChange={event => patchHireGroup(selection.id, { adjustments: { ...adjustments, [amountKey]: event.target.value === "" ? undefined : Number(event.target.value) } })} /><Input className="mt-1" placeholder="Reason / reference" value={(adjustments as any)[reasonKey] || ""} onChange={event => patchHireGroup(selection.id, { adjustments: { ...adjustments, [reasonKey]: event.target.value.toUpperCase() } })} /></div>)}
                    </div>
                  </div>
                  <div className="grid gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20 sm:grid-cols-2">
                    <div className="space-y-1">
                      {[["Gross Hire", financials.grossHire], ["− Breakdown Deduction", financials.breakdownDeduction], ...(String(equipment?.hireDieselResponsibility || "").toLowerCase() === "vendor" ? [] : [["− HSD Recovery", financials.hsdRecovery]]), ["− Other Debit / Recovery", financials.otherDebit], ["− Advance Adjustment", financials.advanceAdjustment], ["+ Other Credit", financials.otherCredit], ["= Taxable / Bill Amount", financials.taxableAmount], [`+ GST @ ${financials.gstRate}%`, financials.gstAmount], ["= Invoice Total", financials.invoiceTotal], [`− TDS @ ${financials.tdsRate}%`, financials.tdsAmount], ["= NET PAYABLE", financials.netPayable], ["Paid", financials.paid], ["= BALANCE THIS BILL", financials.balanceThisBill]].map(([label, amount]) => <div key={String(label)} className="flex justify-between"><span>{label}</span><strong>₹{formatCurrency(Number(amount))}</strong></div>)}
                    </div>
                    <div className="space-y-3">
                      <div><Label className="text-[10px] uppercase">GST Rate %</Label><Input type="number" min="0" step="0.01" value={gstRateEquipment || ""} placeholder="0" onChange={event => setGstRateEquipment(Number(event.target.value) || 0)} data-testid="input-gst-equipment-rate" /></div>
                      <div><Label className="text-[10px] uppercase">TDS Rate %</Label><Input type="number" min="0" step="0.01" value={tdsRate || ""} placeholder="0" onChange={event => setTdsRate(Number(event.target.value) || 0)} data-testid="input-tds-rate" /></div>
                    </div>
                  </div>
                </div>;
              })}
            </CardContent>
          </Card>
        )}

        {!isHistoricalHireEdit && (hireGroups.some(g => g.basis === "monthly") || monthlyHireExclusions.length > 0) && (
          <Card className="border-orange-200 dark:border-orange-800" data-testid="monthly-hire-auto-summary">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider"><Calculator className="h-4 w-4 text-orange-600" />Auto-generated monthly hire</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <p className="text-xs text-muted-foreground">Monthly equipment is billed for its active hire-date overlap even with no DPR/Plant log. Only recorded breakdowns reduce the line; the server recalculates and freezes this evidence on save.</p>
              {monthlyHireExclusions.length > 0 && <div className="rounded border border-orange-200 bg-orange-50 p-3 text-xs dark:bg-orange-950/20" data-testid="monthly-hire-exclusions">
                <p className="font-semibold">Monthly equipment not auto-added</p>
                <ul className="mt-2 space-y-1">
                  {monthlyHireExclusions.map(item => <li key={item.id} data-testid={`monthly-hire-excluded-item-${item.id}`}>
                    <strong>{item.name}</strong>: {item.reason}
                  </li>)}
                </ul>
                <p className="mt-2 text-muted-foreground">These notices explain the current bill-period filter; they do not change Equipment Master or bill-seeding rules.</p>
              </div>}
              {hireGroups.filter(g => g.basis === "monthly").map((group) => {
                const equipment = hireEquipmentFor(group.equipmentId);
                const result = hireCalculated.find(c => c.group.id === group.id)?.result;
                const isMultiMonth = hireGroups.filter(candidate =>
                  candidate.equipmentId === group.equipmentId && candidate.basis === "monthly",
                ).length > 1;
                const monthlyTestSuffix = isMultiMonth ? `${group.equipmentId}-${group.periodFrom}` : String(group.equipmentId);
                const maintenance = maintenanceForGroup(group);
                const diesel = result?.diesel;
                const activeFrom = result?.billablePeriodFrom || group.periodFrom;
                const activeTo = result?.billablePeriodTo || group.periodTo;
                const calendar = buildHireActivityDays(activeFrom, activeTo, activityForGroup(group), maintenance.map((row: any) => ({
                  id: row.sourceId, date: row.businessDate, eventType: row.eventType, description: row.description, downtimeHours: row.downtimeHours,
                })));
                 const adjustments = group.adjustments || {};
                 const hsdRecovery = Number(group.dieselRecoveryFinalAmount || 0);
                 const otherDebit = Number(adjustments.otherDebit || 0);
                 const advanceAdjustment = Number(adjustments.advanceAdjustment || 0);
                 const otherCredit = Number(adjustments.otherCredit || 0);
                 const financials = calculateEquipmentHireFinancials({
                   grossHire: Number(result?.grossAmount || 0),
                   breakdownDeduction: Number(result?.deductionAmount || 0),
                   hsdRecovery, otherDebit, advanceAdjustment, otherCredit,
                   gstRate: gstRateEquipment, tdsRate, paid: 0,
                 });
                 const vendorDieselScope = String(equipment?.hireDieselResponsibility || "").toLowerCase() === "vendor";
                 const groupActivities = activityForGroup(group);
                 const tripApplicable = group.basis === "trip" || groupActivities.some(activity =>
                   String(activity.entryType || "").toLowerCase().replace(/[\s-]+/g, "_") === "trip_based" ||
                   activity.source === "site_material_trip" ||
                   activity.source === "bulk_transport_trip"
                 );
                 const suggestedExcess = Number.isFinite(Number(diesel?.suggestedExcess)) && Number(diesel?.suggestedExcess) > 0
                   ? Number(diesel?.suggestedExcess)
                   : undefined;
                 const suggestedRecoveryAmount = Number.isFinite(Number(diesel?.suggestedRecoveryAmount))
                   ? Number(diesel?.suggestedRecoveryAmount)
                   : undefined;
                 // Use only the recovery suggestion returned by the shared
                 // calculation. Never infer a price from raw diesel rows.
                 const suggestedRate = suggestedExcess && suggestedRecoveryAmount != null && suggestedRecoveryAmount > 0
                   ? suggestedRecoveryAmount / suggestedExcess
                   : undefined;
                 const excessFuelQuantity = suggestedExcess == null ? "Qty unavailable" : `${suggestedExcess.toFixed(2)} L`;
                 const excessFuelRate = suggestedRate == null || suggestedRate <= 0
                   ? "Rate unavailable"
                   : `₹${formatCurrency(suggestedRate)}`;
                 const showExcessFuelLine = !vendorDieselScope && financials.hsdRecovery > 0;
                 const exportData: EquipmentHireExportData = {
                   billNo, vendorName, equipmentName: formatEquipmentOptionLabel(equipment || {}),
                   periodFrom: group.periodFrom, periodTo: group.periodTo,
                   hireBasis: HIRE_BASIS_LABELS[group.basis], rate: group.rate,
                   grossHire: Number(result?.grossAmount || 0),
                   breakdownDeduction: Number(result?.deductionAmount || 0),
                   hsdRecovery, otherDebit, otherDebitReason: adjustments.otherDebitReason,
                   advanceAdjustment, advanceAdjustmentReason: adjustments.advanceAdjustmentReason,
                   otherCredit, otherCreditReason: adjustments.otherCreditReason,
                   gstRate: financials.gstRate, gstAmount: financials.gstAmount,
                   taxableAmount: financials.taxableAmount, invoiceTotal: financials.invoiceTotal,
                   tdsRate: financials.tdsRate, tdsAmount: financials.tdsAmount,
                   netPayable: financials.netPayable, paid: financials.paid,
                   dieselResponsibility: equipment?.hireDieselResponsibility,
                   consumptionNorm: equipment?.consumptionNorm,
                 };
                 if (billType !== "equipment") {
                   rememberCalendar(calendarKey(group), {
                     equipmentName: exportData.equipmentName, periodFrom: group.periodFrom, periodTo: group.periodTo,
                     rows: [], dieselResponsibility: equipment?.hireDieselResponsibility,
                     consumptionNorm: diesel?.consumptionNorm ?? equipment?.consumptionNorm,
                     meterType: equipment?.meterType,
                     breakdown: hireActivityBreakdownSheetRows({
                       days: calendar, consumptionNorm: diesel?.consumptionNorm ?? equipment?.consumptionNorm,
                       normBasis: diesel?.normBasis ?? group.dieselNormBasisOverride, meterType: equipment?.meterType,
                       tripApplicable, showFuel: !vendorDieselScope, formatDate: date => formatDate(date),
                     }),
                   });
                 }
                return (
                  <div
                    key={group.id}
                    className={`rounded border p-3 space-y-3 ${group.includeInBill === false ? "bg-muted/30 opacity-75" : ""}`}
                    data-testid={`monthly-hire-${monthlyTestSuffix}`}
                  >
                    {isMultiMonth && (
                      <label className="flex w-fit items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={group.includeInBill !== false}
                          onChange={event => patchHireGroup(group.id, { includeInBill: event.target.checked })}
                          data-testid={`checkbox-include-monthly-hire-${group.equipmentId}-${group.periodFrom}`}
                        />
                        Include in this bill
                      </label>
                    )}
                    <div className="grid gap-2 text-sm sm:grid-cols-4">
                      <div><span className="block text-[10px] uppercase text-muted-foreground">Machine</span><strong>{formatEquipmentOptionLabel(equipment || {})}</strong></div>
                      <div><span className="block text-[10px] uppercase text-muted-foreground">Active billable range</span><strong>{formatDate(activeFrom)} – {formatDate(activeTo)}</strong></div>
                      <div><span className="block text-[10px] uppercase text-muted-foreground">Monthly rate</span><strong>₹{formatCurrency(group.rate)}</strong></div>
                       <div><span className="block text-[10px] uppercase text-muted-foreground">Generated taxable / bill amount</span><strong className="text-orange-700" data-testid={`monthly-hire-net-${monthlyTestSuffix}`}>₹{formatCurrency(financials.taxableAmount)}</strong></div>
                    </div>
                    <div className="max-w-xs">
                      <Label className="text-[10px] uppercase">Breakdown grace days for this bill period</Label>
                      <Input type="number" min="0" step="1" value={group.breakdownGraceDays ?? 0}
                        onChange={event => patchHireGroup(group.id, { breakdownGraceDays: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
                         data-testid={`input-monthly-grace-${monthlyTestSuffix}`} />
                      <p className="mt-1 text-[11px] text-muted-foreground">Total allowance per machine; default 0. Saved in this bill snapshot, not Equipment Master.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3" data-testid={`monthly-hire-adjustments-${monthlyTestSuffix}`}>
                      {[["Other Debit / Recovery", "otherDebit", "otherDebitReason"], ["Advance Adjustment", "advanceAdjustment", "advanceAdjustmentReason"], ["Other Credit", "otherCredit", "otherCreditReason"]].map(([label, amountKey, reasonKey]) => (
                        <div key={amountKey}>
                          <Label className="text-[10px] uppercase">{label} ₹</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={(adjustments as any)[amountKey] ?? ""}
                            onChange={event => patchHireGroup(group.id, { adjustments: { ...adjustments, [amountKey]: event.target.value === "" ? undefined : Number(event.target.value) } })}
                          />
                          <Input
                            className="mt-1"
                            placeholder="Reason / reference"
                            value={(adjustments as any)[reasonKey] || ""}
                            onChange={event => patchHireGroup(group.id, { adjustments: { ...adjustments, [reasonKey]: event.target.value.toUpperCase() } })}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="rounded border border-amber-300 bg-amber-50/60 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/20" data-testid={`monthly-hire-financial-breakdown-${monthlyTestSuffix}`}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Monthly hire financial breakdown</p>
                      <div className="space-y-1">
                        <div className="flex justify-between gap-3"><span>Gross Hire</span><strong>₹{formatCurrency(financials.grossHire)}</strong></div>
                        {financials.breakdownDeduction > 0 && <div className="flex justify-between gap-3"><span>− Breakdown Deduction</span><strong>₹{formatCurrency(financials.breakdownDeduction)}</strong></div>}
                        {showExcessFuelLine && <div className="flex justify-between gap-3" data-testid={`monthly-hire-excess-fuel-${monthlyTestSuffix}`}>
                          <span>
                            − Excess Fuel Consumed ({excessFuelQuantity} × {excessFuelRate})
                            {group.dieselRecoveryDecision === "edit" && (
                              <span className="block text-[11px] text-muted-foreground">
                                Original suggested: {suggestedRecoveryAmount == null ? "Unavailable" : `₹${formatCurrency(suggestedRecoveryAmount)}`}
                              </span>
                            )}
                          </span>
                          <strong>₹{formatCurrency(financials.hsdRecovery)}</strong>
                        </div>}
                        {financials.otherDebit > 0 && <div className="flex justify-between gap-3"><span>− Other Debit / Recovery</span><strong>₹{formatCurrency(financials.otherDebit)}</strong></div>}
                        {financials.advanceAdjustment > 0 && <div className="flex justify-between gap-3"><span>− Advance Adjustment</span><strong>₹{formatCurrency(financials.advanceAdjustment)}</strong></div>}
                        {financials.otherCredit > 0 && <div className="flex justify-between gap-3"><span>+ Other Credit</span><strong>₹{formatCurrency(financials.otherCredit)}</strong></div>}
                        <div className="flex justify-between gap-3 border-t pt-1 font-semibold"><span>= Net line (pre-GST / TDS)</span><strong data-testid={`monthly-hire-taxable-${monthlyTestSuffix}`}>₹{formatCurrency(financials.taxableAmount)}</strong></div>
                      </div>
                    </div>
                    {hireGroups.find(g => g.basis === "monthly")?.id === group.id && contractorAdvanceSuggestion && (
                      <div className="rounded border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
                        <Label className="text-[10px] uppercase">Other Debit / Recovery — Contractor Diesel Advance</Label>
                        <p className="text-[11px] text-muted-foreground">{contractorAdvanceSuggestion.amount == null
                          ? `${contractorAdvanceSuggestion.litres.toFixed(2)} L recorded; purchased diesel rate unavailable. Enter an agreed recovery or remove it.`
                          : `${contractorAdvanceSuggestion.litres.toFixed(2)} L at the period-weighted purchased diesel rate. This is an editable suggestion, not a silent deduction.`}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Input type="number" min="0" step="0.01" value={group.adjustments?.otherDebit ?? ""}
                            placeholder="Recovery amount ₹ (0 to remove)"
                            onChange={event => patchHireGroup(group.id, { adjustments: { ...(group.adjustments || {}), otherDebit: event.target.value === "" ? undefined : Number(event.target.value) } })} />
                          <Input value={group.adjustments?.otherDebitReason || ""} placeholder="Reason / reference"
                            onChange={event => patchHireGroup(group.id, { adjustments: { ...(group.adjustments || {}), otherDebitReason: event.target.value.toUpperCase() } })} />
                        </div>
                      </div>
                    )}
                    {String(equipment?.hireDieselResponsibility || "").toLowerCase() === "hlc" && (
                      <div className="rounded bg-muted/50 p-2 text-xs">
                        <strong>HLC diesel reconciliation</strong>
                        <div className="mt-2 grid gap-2 sm:grid-cols-4">
                          <span>Expected: <strong>{diesel?.expectedDieselAvailable === false ? "Tank Readings N/A" : `${Number(diesel?.expectedDiesel || 0).toFixed(2)} L`}</strong></span>
                          <span>Actual: <strong>{diesel?.expectedDieselAvailable === false ? "Tank Readings N/A" : `${Number(diesel?.actualDiesel || 0).toFixed(2)} L`}</strong></span>
                          <span>Excess: <strong>{diesel?.expectedDieselAvailable === false ? "Tank Readings N/A" : `${Number(diesel?.suggestedExcess || 0).toFixed(2)} L`}</strong></span>
                          <span>Recovery: <strong>{diesel?.rateUnavailable ? "Manual pricing required" : `₹${formatCurrency(diesel?.suggestedRecoveryAmount || 0)}`}</strong></span>
                        </div>
                        <p className="mt-2 text-muted-foreground">Expected is norm × logged runtime/KM. Actual uses confirmed tank opening + Plant Stock issued − confirmed closing. The server repeats this reconciliation on save.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant={group.dieselRecoveryDecision === "accept" ? "default" : "outline"}
                            disabled={diesel?.rateUnavailable || diesel?.expectedDieselAvailable === false || !diesel?.suggestedRecoveryAmount}
                            onClick={() => patchHireGroup(group.id, { dieselRecoveryDecision: "accept", dieselRecoveryFinalAmount: Number(diesel?.suggestedRecoveryAmount || 0) })}>Accept Suggested</Button>
                          <Button type="button" size="sm" variant={group.dieselRecoveryDecision === "edit" ? "default" : "outline"}
                            onClick={() => patchHireGroup(group.id, { dieselRecoveryDecision: "edit" })}>Edit</Button>
                          <Button type="button" size="sm" variant={group.dieselRecoveryDecision === "ignore" || !group.dieselRecoveryDecision ? "default" : "outline"}
                            onClick={() => patchHireGroup(group.id, { dieselRecoveryDecision: "ignore", dieselRecoveryFinalAmount: 0 })}>No Recovery</Button>
                        </div>
                        {group.dieselRecoveryDecision === "edit" && <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Input type="number" min="0" placeholder="Final recovery ₹" value={group.dieselRecoveryFinalAmount ?? ""}
                            onChange={event => patchHireGroup(group.id, { dieselRecoveryFinalAmount: event.target.value === "" ? undefined : Number(event.target.value) })} />
                          <Input placeholder="Reason / reference (required)" value={group.dieselRecoveryRemarks || ""}
                            onChange={event => patchHireGroup(group.id, { dieselRecoveryRemarks: event.target.value.toUpperCase() })} />
                        </div>}
                      </div>
                    )}
                    {billType === "equipment" ? (
                      <DraftEquipmentHireCalendar
                        onExportSnapshot={calendar => rememberCalendar(calendarKey(group), calendar)}
                        equipmentId={group.equipmentId}
                        equipmentName={formatEquipmentOptionLabel(equipment || {})}
                        periodFrom={group.periodFrom}
                        periodTo={group.periodTo}
                        maintenance={maintenance}
                        dieselResponsibility={equipment?.hireDieselResponsibility}
                        consumptionNorm={equipment?.consumptionNorm}
                        exceptionDecisions={group.exceptionDecisions}
                        dieselRecoveryDecision={group.dieselRecoveryDecision}
                        exportData={exportData}
                        canExport={canExport}
                        testId={`draft-equipment-hire-calendar-${monthlyTestSuffix}`}
                      >
                        {maintenance.length > 0 && (
                          <div className="space-y-2" data-testid={`draft-breakdown-controls-${monthlyTestSuffix}`}>
                            <p className="text-xs font-semibold uppercase tracking-wide">Breakdown Deduction Review</p>
                            {maintenance.map((event: any) => {
                              const current = group.exceptionDecisions.find((decision: any) =>
                                decision.sourceType === "maintenance" && Number(decision.sourceId) === Number(event.sourceId),
                              );
                              const without = group.exceptionDecisions.filter((decision: any) =>
                                !(decision.sourceType === "maintenance" && Number(decision.sourceId) === Number(event.sourceId)),
                              );
                              return <div key={event.sourceId} className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs">
                                <span>{formatDate(event.businessDate)} · {event.description || "Breakdown"}{event.downtimeHours ? ` · ${event.downtimeHours}h` : ""}</span>
                                <Select
                                  value={current?.decision || "__automatic__"}
                                  onValueChange={decision => patchHireGroup(group.id, {
                                    exceptionDecisions: decision === "__automatic__"
                                      ? without
                                      : [...without, { sourceType: "maintenance", sourceId: event.sourceId, exceptionType: "breakdown", date: event.businessDate, decision }],
                                  })}
                                >
                                  <SelectTrigger className="h-7 w-44"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__automatic__">Automatic after grace</SelectItem>
                                    <SelectItem value="none">No deduction</SelectItem>
                                    <SelectItem value="half_day">Half day</SelectItem>
                                    <SelectItem value="full_day">Full day</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>;
                            })}
                          </div>
                        )}
                      </DraftEquipmentHireCalendar>
                    ) : (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold uppercase">View activity / breakdown calendar ({calendar.length} days)</summary>
                      <HireActivityBreakdownCalendar
                        days={calendar}
                        consumptionNorm={diesel?.consumptionNorm ?? equipment?.consumptionNorm}
                        normBasis={diesel?.normBasis ?? group.dieselNormBasisOverride}
                        meterType={equipment?.meterType}
                        tripApplicable={tripApplicable}
                        showFuel={!vendorDieselScope}
                        formatDate={date => formatDate(date)}
                      />
                      {maintenance.some((row: any) => String(row.eventType).toLowerCase() === "breakdown") && (
                        <div className="mt-2 space-y-2" data-testid={`monthly-calendar-breakdown-controls-${monthlyTestSuffix}`}>
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Breakdown deduction decisions</p>
                          {maintenance.filter((row: any) => String(row.eventType).toLowerCase() === "breakdown").map((event: any) => {
                            const current = group.exceptionDecisions.find((decision: any) =>
                              decision.sourceType === "maintenance" && Number(decision.sourceId) === Number(event.sourceId));
                            const without = group.exceptionDecisions.filter((decision: any) =>
                              !(decision.sourceType === "maintenance" && Number(decision.sourceId) === Number(event.sourceId)));
                            return <div key={event.sourceId} className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs">
                              <span>{formatDate(event.businessDate)} · {event.description || "Breakdown"}{event.downtimeHours ? ` · ${event.downtimeHours}h` : ""}</span>
                              <Select value={current?.decision || "__automatic__"} onValueChange={decision => patchHireGroup(group.id, {
                                exceptionDecisions: decision === "__automatic__"
                                  ? without
                                  : [...without, { sourceType: "maintenance", sourceId: event.sourceId, exceptionType: "breakdown", date: event.businessDate, decision }],
                              })}>
                                <SelectTrigger className="h-7 w-44"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__automatic__">Automatic after grace</SelectItem>
                                  <SelectItem value="none">No deduction</SelectItem>
                                  <SelectItem value="half_day">Half day</SelectItem>
                                  <SelectItem value="full_day">Full day</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>;
                          })}
                        </div>
                      )}
                    </details>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {vendorName && periodFrom && periodTo && billType !== "other" && !isHistoricalHireEdit && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
              <CardContent className="py-3 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 text-sm text-blue-800 dark:text-blue-200">
                <span className="font-semibold">
                  {billType === "all"
                    ? `All billable records for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) — equipment, materials, transport & labour.`
                    : billType === "equipment"
                    ? `Equipment usage for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) from DPR & Plant records.`
                    : billType === "material"
                    ? `Material receipts for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) from DPR & Plant records.`
                    : billType === "labour"
                    ? `Labour deployment for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) from DPR labour logs (grouped by date, site, category, gender).`
                    : `Transport dispatches for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) from truck dispatch records.`}
                </span>
                  {billType !== "equipment" && <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Other billable activities for this vendor/period are shown here.</span>}
                  <div className="mt-3 space-y-2">
                    <UnconfirmedTripOffers items={unconfirmedTripOffers} refreshing={autoItemsLoading} onRefresh={() => { void refreshAutoItems(); }} />
                    {(billType === "material" || billType === "all") && (
                      <Link href={`/site/material-trips?returnTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/plant/vendor-bills")}`}>
                        <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-xs" data-testid="link-material-trip-backlog">
                          PREPARE MATERIAL TRIP BACKLOG <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                    {availableOtherItems.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 rounded border border-blue-200 bg-background/60 px-2 py-2 text-[11px] dark:border-blue-800">
                        {duplicatePreflight.isFetching && (
                          <span className="font-semibold text-blue-700 dark:text-blue-300" data-testid="text-duplicate-preflight-checking">
                            CHECKING DUPLICATES…
                          </span>
                        )}
                        {duplicatePreflight.error && !duplicatePreflight.isFetching && (
                          <span className="flex flex-wrap items-center gap-2 font-semibold text-red-700 dark:text-red-400" data-testid="text-duplicate-preflight-error">
                            DUPLICATE CHECK FAILED — PULL DISABLED
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => duplicatePreflight.refetch()}
                              disabled={duplicatePreflight.isFetching || pullInFlight}
                              data-testid="button-retry-duplicate-preflight"
                            >
                              RETRY DUPLICATE CHECK
                            </Button>
                          </span>
                        )}
                      </div>
                    )}
                    {candidatePullGroups.map(group => {
                      const addedCount = group.count - group.pendingItems.length;
                      const categoryLabel = group.category === "equipment" ? "EQUIPMENT" : group.category.toUpperCase();
                      return <div key={group.key} className={`flex flex-wrap items-center gap-2 rounded border px-2 py-2 text-xs ${group.pendingItems.length ? "border-blue-200 bg-background/40 dark:border-blue-800" : "border-muted bg-muted/40 text-muted-foreground"}`} data-testid={`pull-group-${group.key}`}>
                        <Badge variant="outline" className={getCategoryBadgeClass(group.category)}>{categoryLabel}</Badge>
                        <span className="min-w-[12rem] flex-1 font-semibold uppercase">{group.groupName}{group.entryType && group.entryType !== group.unit ? ` · ${group.entryType}` : ""}</span>
                        <span className="font-medium">
                          {duplicatePreflight.isSuccess
                            ? `${group.count} ITEM${group.count === 1 ? "" : "S"} (${group.alreadyBilledCount} ALREADY BILLED, ${group.toPullCount} TO PULL)`
                            : `${group.count} ITEM${group.count === 1 ? "" : "S"}`}
                        </span>
                        {addedCount > 0 && <span className="font-semibold text-emerald-700 dark:text-emerald-400">✓ ADDED {addedCount}/{group.count}</span>}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAutoPopulate(group.pendingItems)}
                          disabled={autoItemsLoading || pullInFlight || duplicatePreflightBlocked || group.pendingItems.length === 0}
                          data-testid={`button-pull-group-${group.key}`}
                        >
                          {group.pendingItems.length ? `PULL ${group.pendingItems.length}` : "✓ ADDED"}
                        </Button>
                        {[...new Set(group.items.map(item => item.transportPricingNote).filter(Boolean))].map(note =>
                          <div key={note} className="w-full"><TransportPricingNote note={note} /></div>
                        )}
                      </div>;
                    })}
                    {candidatePullGroups.length > 0 && availableOtherItems.length > 0 && <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAutoPopulate()}
                      disabled={autoItemsLoading || pullInFlight || duplicatePreflightBlocked}
                      data-testid="button-auto-populate"
                    >
                      {autoItemsLoading || duplicatePreflight.isFetching || pullInFlight ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      {`PULL ALL ${availableOtherItems.length} ITEM${availableOtherItems.length === 1 ? "" : "S"}`}
                    </Button>}
                    {candidatePullGroups.length === 0 && <span className="text-[11px] font-semibold uppercase">{billType === "equipment" ? "No billable activities available" : "No other billable activities available"}</span>}
                  </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isHistoricalHireEdit && <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" disabled={!isAdmin && !sectionVisible("rate_cards") && !sectionVisible("vendor_masters_manage") && !sectionVisible("admin_settings")} onClick={() => {
                  draftScrollRef.current = window.scrollY;
                  setShowDraftRateCards(true);
                  window.scrollTo(0, 0);
                }} data-testid="button-manage-rate-cards">
                  <Settings className="w-4 h-4 mr-1" /> RATE CARDS
                </Button>
              {uniqueRateGroups.length > 0 && (
                <Button variant="outline" size="sm" onClick={openSetRatesDialog} data-testid="button-set-rates">
                  <span className="font-bold mr-1">₹</span> SET RATES
                </Button>
              )}
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={addLineItem} data-testid="button-add-item">
                  <Plus className="w-4 h-4 mr-1" /> ADD ITEM
                </Button>
              )}
              {billedLineItemCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLineItems(prev => prev.filter(item => !item.billedIn))}
                  disabled={pullInFlight}
                  data-testid="button-exclude-already-billed"
                >
                  <X className="w-4 h-4 mr-1" /> EXCLUDE ALREADY-BILLED ROWS ({billedLineItemCount})
                </Button>
              )}
              <BillDateGroupControls
                expansionMode={dateGroupExpansionMode}
                onExpansionModeChange={setAllDateGroupsExpanded}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {(() => {
              const hasLead = billType === "transport" || lineItems.some(i => (i.leadDistance ?? 0) > 0);
              const hasSuppliedOrTransporter = canViewBills && lineItems.some(i => i.suppliedTo || i.transporter);
              const totalColSpan = hasLead ? (hasSuppliedOrTransporter ? 12 : 10) : (hasSuppliedOrTransporter ? 11 : 9);
              const labelColSpan = hasLead ? (hasSuppliedOrTransporter ? 10 : 8) : (hasSuppliedOrTransporter ? 9 : 7);
              const categories = ["equipment", "material", "transport", "labour", "other"] as const;
              const catLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", labour: "LABOUR", other: "OTHER" };
              const shouldGroup = computeCategorySubTotals(lineItems).length > 1;

              const labourItemsAll = lineItems.filter(i => i.category === "labour");
              const labourSiteCount = labourItemsAll.filter(i => getLabourSource(i) === "site").length;
              const labourPlantCount = labourItemsAll.filter(i => getLabourSource(i) === "plant").length;
              const showLabourFilter = labourSiteCount > 0 && labourPlantCount > 0;
              const labourChips: Array<{ key: "all" | "site" | "plant"; label: string; count: number }> = [
                { key: "all", label: "All", count: labourItemsAll.length },
                { key: "site", label: "DPR Site", count: labourSiteCount },
                { key: "plant", label: "Plant Shift", count: labourPlantCount },
              ];

              const arrangementGroups = groupRateItems(lineItems.filter(item => item.arrangementPricing));
              const renderItemRow = (item: LineItem, idx: number) => item.arrangementPricing ? (
                arrangementGroups.find(group => group.items.includes(item))?.items[0] !== item ? null :
                <tr key={idx} data-testid={`arrangement-bill-group-${idx}`} className="border-b">
                  <td colSpan={totalColSpan} className="p-3">
                    <strong>{item.description}</strong>
                    <p>{arrangementGroups.find(group => group.items.includes(item))!.count} trips · Rate ₹{item.rate}</p>
                    <p className={item.arrangementPricing.reason ? "text-amber-700" : ""}>
                      {arrangementWorking(item.arrangementPricing, arrangementGroups.find(group => group.items.includes(item))!.count)}
                    </p>
                    <button type="button" className="text-xs underline" onClick={() => {
                      const group = arrangementGroups.find(group => group.items.includes(item))!;
                      setLineItems(prev => prev.filter(row => !group.items.includes(row)));
                    }}>Remove group from this bill</button>
                  </td>
                </tr>
              ) : (
                <tr key={idx} className={`border-b ${item.unitRateWarning ? "bg-amber-100 dark:bg-amber-900/30" : ""}`} data-testid={`bill-item-row-${idx}`}>
                  <td className="px-2 py-1.5 text-muted-foreground text-sm">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    {isGeneratedEvidenceLine(item.source) ? (
                      <span className="text-sm font-mono" data-testid={`text-item-date-${idx}`}>{formatDate(item.date)}</span>
                    ) : (
                      <Input
                        type="date"
                        value={item.date}
                        onChange={e => updateLineItem(idx, "date", e.target.value)}
                        className="text-sm h-8"
                        data-testid={`input-item-date-${idx}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {isGeneratedEvidenceLine(item.source) ? (
                      <Badge
                        variant="outline"
                        className={`text-[12px] ${getCategoryBadgeClass(item.category)} no-default-hover-elevate no-default-active-elevate`}
                        data-testid={`badge-category-${idx}`}
                      >
                        {getCategoryLabel(item.category)}
                      </Badge>
                    ) : (
                      <Select value={item.category} onValueChange={v => updateLineItem(idx, "category", v)}>
                        <SelectTrigger className="h-8 text-sm" data-testid={`select-item-category-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equipment">EQUIP</SelectItem>
                          <SelectItem value="material">MATL</SelectItem>
                          <SelectItem value="transport">TRNS</SelectItem>
                          <SelectItem value="labour">LABOUR</SelectItem>
                          <SelectItem value="other">OTHER</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isGeneratedEvidenceLine(item.source) ? (
                      <div className="space-y-1">
                        <span className="text-sm" data-testid={`text-item-desc-${idx}`}>{item.description}</span>
                        {(item.vehicleNumber || item.receiptNumber) && (
                          <div className="text-[11px] text-muted-foreground" data-testid={`text-item-trip-reference-${idx}`}>
                            {item.vehicleNumber ? `Vehicle: ${item.vehicleNumber}` : null}
                            {item.vehicleNumber && item.receiptNumber ? " · " : null}
                            {item.receiptNumber ? `Receipt: ${item.receiptNumber}` : null}
                          </div>
                        )}
                        <div className="flex items-center gap-1 flex-wrap">
                          {(() => {
                            const badge = parseSiteBadge(item);
                            return badge ? (
                              <Badge variant="outline" className={`text-[12px] ${getSiteBadgeClass(badge.type)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-form-site-${idx}`}>
                                {badge.label}
                              </Badge>
                            ) : null;
                          })()}
                          {extractDiesel(item.description) > 0 && (
                            <Badge variant="outline" className="text-[12px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-diesel-${idx}`}>
                              <Fuel className="w-3 h-3 mr-1" />
                              {extractDiesel(item.description)}L DIESEL
                            </Badge>
                          )}
                          {item.billedIn && (
                            <Badge variant="outline" className="text-[12px] bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-billed-${idx}`}>
                              BILLED ({item.billedIn.billNo} - {item.billedIn.billStatus.toUpperCase()})
                            </Badge>
                          )}
                        </div>
                        </div>
                    ) : (
                      <Input
                        value={item.description}
                        onChange={e => updateLineItem(idx, "description", e.target.value)}
                        onBlur={e => updateLineItem(idx, "description", e.target.value.toUpperCase())}
                        placeholder="ENTER DESCRIPTION"
                        className="uppercase text-sm h-8"
                        data-testid={`input-item-desc-${idx}`}
                      />
                    )}
                    <EquipmentLogFacts category={item.category} evidence={item.equipmentLogEvidence} rowKey={`form-${idx}`} />
                    <TransportPricingRow item={item} onBasisChange={basis => {
                      unitEditGeneration.current++;
                      setLineItems(rows => rows.map((row, i) => i === idx ? changeTransportBasis(row, basis) : row));
                    }} />
                    <TransportPricingNote note={item.transportPricingNote} />
                  </td>
                  {hasSuppliedOrTransporter && (
                    <td className="px-2 py-1.5">
                      <span className="text-sm text-muted-foreground" data-testid={`text-item-supplied-to-${idx}`}>{item.suppliedTo || "—"}</span>
                    </td>
                  )}
                  {hasSuppliedOrTransporter && (
                    <td className="px-2 py-1.5">
                      <span className="text-sm text-muted-foreground" data-testid={`text-item-transporter-${idx}`}>{item.transporter || "—"}</span>
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    {item.category === "transport" && !item.transportPricing ? (
                      <div className="space-y-0.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={item.qty || ""}
                          disabled={["hire_group", "hire_statement"].includes(item.source)}
                          onChange={e => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                          className="text-sm h-8 bg-muted/50 text-muted-foreground"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          data-testid={`input-item-qty-${idx}`}
                        />
                        <span className="text-xs text-muted-foreground italic">info only</span>
                      </div>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        value={item.qty || ""}
                        disabled={!!item.transportPricing || ["hire_group", "hire_statement"].includes(item.source)}
                        onChange={e => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                        className="text-sm h-8"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        data-testid={`input-item-qty-${idx}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={item.unit} onValueChange={v => updateLineItem(idx, "unit", v)} disabled={!!item.transportPricing || ["hire_group", "hire_statement"].includes(item.source)}>
                      <SelectTrigger className={`h-8 text-sm ${item.unitRateWarning ? "border-amber-600" : ""}`} data-testid={`select-item-unit-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LINE_ITEM_UNITS.map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {item.unitRateWarning && <p role="alert" title={item.unitRateWarning} className="mt-1 text-xs font-medium text-amber-900 dark:text-amber-200" data-testid={`warning-item-unit-${idx}`}>{item.unitRateWarning}</p>}
                  </td>
                  {hasLead && (
                    <td className="px-2 py-1.5">
                      {item.category === "transport" ? (
                        <div className="space-y-0.5">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.leadDistance || ""}
                            onChange={e => updateLineItem(idx, "leadDistance", parseFloat(e.target.value) || 0)}
                            placeholder="ONE-WAY KM"
                            className="text-sm h-8"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            data-testid={`input-item-lead-${idx}`}
                          />
                          {item.leadDistance && item.leadDistance > 0 && (
                            <span className="text-[12px] text-muted-foreground">RT: {(item.leadDistance * 2).toFixed(2)} KM</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.rate || ""}
                        disabled={["hire_group", "hire_statement"].includes(item.source)}
                        onChange={e => updateLineItem(idx, "rate", parseFloat(e.target.value) || 0)}
                        className="text-sm h-8"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        data-testid={`input-item-rate-${idx}`}
                      />
                      {item.rate > 0 && item.equipmentId && isAutoLineSource(item.source) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0"
                          title="Apply rate to similar equipment rows"
                          onClick={() => applyRateToSimilar(idx)}
                          data-testid={`button-apply-rate-${idx}`}
                        >
                          <Copy className="w-3.5 h-3.5 text-blue-600" />
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold bg-amber-50 dark:bg-amber-900/20">
                    <span className="text-sm" data-testid={`text-item-amount-${idx}`}>{formatCurrency(item.amount)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={["hire_group", "hire_statement"].includes(item.source)} onClick={() => removeLineItem(idx)} data-testid={`button-remove-item-${idx}`}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );

              return (
                <>
                  {showLabourFilter && (
                    <div className="px-3 pt-3 pb-2 flex flex-wrap items-center gap-2 border-b" data-testid="labour-filter-chips">
                      <span className="text-sm uppercase tracking-wider text-muted-foreground mr-1">Labour view:</span>
                      {labourChips.map(chip => {
                        const active = labourFilter === chip.key;
                        return (
                          <Button
                            key={chip.key}
                            type="button"
                            variant={active ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-sm"
                            onClick={() => setLabourFilter(chip.key)}
                            data-testid={`button-labour-filter-${chip.key}`}
                          >
                            {chip.label}
                            <Badge variant="outline" className="ml-1.5 text-[12px] px-1 py-0 no-default-hover-elevate no-default-active-elevate">
                              {chip.count}
                            </Badge>
                          </Button>
                        );
                      })}
                      {labourFilter !== "all" && (
                        <span className="text-xs text-muted-foreground ml-1" data-testid="text-labour-filter-hint">
                          View only — hidden rows are still saved with the bill.
                        </span>
                      )}
                    </div>
                  )}
                  <table className="w-full text-sm" style={{ minWidth: 900 }}>
                  <thead>
                    <tr className="border-b text-sm text-muted-foreground uppercase">
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left w-28">Date</th>
                      <th className="px-2 py-2 text-center w-16">Type</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      {hasSuppliedOrTransporter && <th className="px-2 py-2 text-left w-28">Supplied To</th>}
                      {hasSuppliedOrTransporter && <th className="px-2 py-2 text-left w-28">Transporter</th>}
                      <th className="px-2 py-2 text-left w-24">Qty</th>
                      <th className="px-2 py-2 text-left w-20">Unit</th>
                      {hasLead && <th className="px-2 py-2 text-left w-28">Lead (KM)</th>}
                      <th className="px-2 py-2 text-left w-32">Rate (₹)</th>
                      <th className="px-2 py-2 text-right w-36">Amount (₹)</th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shouldGroup ? (
                      <>
                        {categories.map(cat => {
                          const catItems = lineItems.map((item, idx) => ({ item, idx })).filter(({ item }) => item.category === cat);
                          if (catItems.length === 0) return null;
                          const catTotal = catItems.reduce((sum, { item }) => sum + (item.amount || 0), 0);

                          let labourSubGroups: Array<{ key: "site" | "plant" | "other"; label: string; items: Array<{ item: LineItem; idx: number }> }> | null = null;
                          if (cat === "labour") {
                            const siteItems = catItems.filter(({ item }) => getLabourSource(item) === "site");
                            const plantItems = catItems.filter(({ item }) => getLabourSource(item) === "plant");
                            const otherItems = catItems.filter(({ item }) => getLabourSource(item) === "other");
                            const present = (siteItems.length ? 1 : 0) + (plantItems.length ? 1 : 0) + (otherItems.length ? 1 : 0);
                            if (present > 1) {
                              labourSubGroups = [];
                              if (siteItems.length) labourSubGroups.push({ key: "site", label: "DPR Site Labour", items: siteItems });
                              if (plantItems.length) labourSubGroups.push({ key: "plant", label: "Plant Shift Manpower", items: plantItems });
                              if (otherItems.length) labourSubGroups.push({ key: "other", label: "Manual / Other", items: otherItems });
                              if (labourFilter !== "all") {
                                labourSubGroups = labourSubGroups.filter(g => g.key === labourFilter);
                              }
                            }
                          }

                          return (
                            <Fragment key={cat}>
                              <tr className={`${getCategoryBadgeClass(cat)} border-b`}>
                                <td colSpan={totalColSpan} className="px-3 py-2 font-semibold text-sm uppercase tracking-wider">
                                  <Badge variant="outline" className={`${getCategoryBadgeClass(cat)} mr-2 no-default-hover-elevate no-default-active-elevate`}>
                                    {catLabels[cat]}
                                  </Badge>
                                  {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                                </td>
                              </tr>
                              {labourSubGroups ? (
                                labourSubGroups.map(grp => {
                                  const grpTotal = grp.items.reduce((sum, { item }) => sum + (item.amount || 0), 0);
                                  const badgeClass = grp.key === "other"
                                    ? "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-600"
                                    : getSiteBadgeClass(grp.key);
                                  return (
                                    <Fragment key={grp.key}>
                                      <tr className="border-b bg-muted/20">
                                        <td colSpan={totalColSpan} className="px-3 py-1.5 text-sm uppercase tracking-wider" data-testid={`row-labour-source-${grp.key}`}>
                                          <Badge variant="outline" className={`text-[12px] mr-2 ${badgeClass} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-labour-source-${grp.key}`}>
                                            {grp.label}
                                          </Badge>
                                          <span className="text-muted-foreground normal-case">
                                            {grp.items.length} row{grp.items.length !== 1 ? "s" : ""} · Rs. {formatCurrency(grpTotal)}
                                          </span>
                                          <div className="mt-3 flex justify-end border-t pt-3">
                                            <Button type="button" variant="ghost" size="sm" className="min-h-11 text-destructive"
                                              data-testid={`button-remove-labour-source-${grp.key}`}
                                              onClick={() => removeItemGroup(grp.items, grp.label)}>Remove Group</Button>
                                          </div>
                                        </td>
                                      </tr>
                                      <BillDateGroupRows
                                        items={grp.items}
                                        scope={`edit-${cat}-labour-${grp.key}`}
                                        onRemoveGroup={removeItemGroup}
                                        totalColumns={totalColSpan}
                                        totalBillItems={lineItems.length}
                                        expansionMode={dateGroupExpansionMode}
                                        expansionOverrides={dateGroupExpansionOverrides}
                                        onToggle={toggleDateGroup}
                                        renderRow={renderItemRow}
                                        formatDate={formatDate}
                                        formatAmount={formatCurrency}
                                      />
                                    </Fragment>
                                  );
                                })
                              ) : (
                                <BillDateGroupRows
                                  items={catItems}
                                  scope={`edit-${cat}`}
                                  onRemoveGroup={removeItemGroup}
                                  totalColumns={totalColSpan}
                                  totalBillItems={lineItems.length}
                                  expansionMode={dateGroupExpansionMode}
                                  expansionOverrides={dateGroupExpansionOverrides}
                                  onToggle={toggleDateGroup}
                                  renderRow={renderItemRow}
                                  formatDate={formatDate}
                                  formatAmount={formatCurrency}
                                />
                              )}
                              <tr className="border-b bg-muted/40">
                                <td colSpan={labelColSpan} className="px-2 py-2 text-right text-sm font-semibold uppercase" data-testid={`text-subtotal-label-${cat}`}>
                                  {catLabels[cat]} Sub-total
                                </td>
                                <td className="px-2 py-2 text-right text-sm font-semibold" data-testid={`text-subtotal-amount-${cat}`}>Rs. {formatCurrency(catTotal)}</td>
                                <td></td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </>
                    ) : (
                      <BillDateGroupRows
                        items={lineItems
                          .map((item, idx) => ({ item, idx }))
                          .filter(({ item }) => {
                          if (item.category !== "labour" || labourFilter === "all" || !showLabourFilter) return true;
                          return getLabourSource(item) === labourFilter;
                          })}
                        scope="edit-all"
                        onRemoveGroup={removeItemGroup}
                        totalColumns={totalColSpan}
                        totalBillItems={lineItems.length}
                        expansionMode={dateGroupExpansionMode}
                        expansionOverrides={dateGroupExpansionOverrides}
                        onToggle={toggleDateGroup}
                        renderRow={renderItemRow}
                        formatDate={formatDate}
                        formatAmount={formatCurrency}
                      />
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                      <td colSpan={labelColSpan} className="px-2 py-3 text-right font-bold text-base">TOTAL</td>
                      <td className="px-2 py-3 text-right font-bold text-base" data-testid="text-total-amount">Rs. {formatCurrency(totalAmount)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                </>
              );
            })()}
          </CardContent>
        </Card>}

        {!isHistoricalHireEdit && <Card>
          <CardContent className="py-4 space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Adjustments</p>

              {(() => {
                // Equipment bills are still shared itemized bills. If a
                // reviewer adds a material/other-category row to one, GST
                // must follow the categories actually present rather than
                // applying the equipment rate to the whole bill.
                const isGrouped = billType === "all" || billType === "equipment";
                const hasEquipmentItems = (categorySubtotals["equipment"] || 0) !== 0;
                const hasMaterialItems = (categorySubtotals["material"] || 0) !== 0;
                const hasTransportItems = (categorySubtotals["transport"] || 0) !== 0;
                const hasLabourItems = (categorySubtotals["labour"] || 0) !== 0;
                const gstRows = isGrouped
                  ? [
                      ...(hasEquipmentItems ? [{ label: "GST ON EQUIPMENT", rate: gstRateEquipment, setRate: setGstRateEquipment, subtotal: categorySubtotals["equipment"] || 0, amount: gstAmountEquipment, testId: "gst-equipment" }] : []),
                      ...(hasMaterialItems ? [{ label: "GST ON MATERIAL", rate: gstRateMaterial, setRate: setGstRateMaterial, subtotal: categorySubtotals["material"] || 0, amount: gstAmountMaterial, testId: "gst-material" }] : []),
                      ...(hasTransportItems ? [{ label: "GST ON TRANSPORT", rate: gstRateTransport, setRate: setGstRateTransport, subtotal: categorySubtotals["transport"] || 0, amount: gstAmountTransport, testId: "gst-transport" }] : []),
                      ...(hasLabourItems ? [{ label: "GST ON LABOUR", rate: gstRateLabour, setRate: setGstRateLabour, subtotal: categorySubtotals["labour"] || 0, amount: gstAmountLabour, testId: "gst-labour" }] : []),
                    ]
                  : (() => {
                       const singleType = billType === "material" ? { label: "GST", rate: gstRateMaterial, setRate: setGstRateMaterial, subtotal: totalAmount, amount: gstAmountMaterial, testId: "gst-material" }
                        : billType === "transport" ? { label: "GST", rate: gstRateTransport, setRate: setGstRateTransport, subtotal: totalAmount, amount: gstAmountTransport, testId: "gst-transport" }
                        : billType === "labour" ? { label: "GST", rate: gstRateLabour, setRate: setGstRateLabour, subtotal: totalAmount, amount: gstAmountLabour, testId: "gst-labour" }
                        : null;
                      return singleType ? [singleType] : [];
                    })();
                return (
                  <>
                    {gstRows.map(row => (
                      <div key={row.testId} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div className="md:col-span-2">
                          <Label className="text-sm uppercase">{row.label}</Label>
                          <p className="text-sm text-muted-foreground">On Rs. {formatCurrency(row.subtotal)}</p>
                        </div>
                        <div>
                          <Label className="text-sm uppercase">Rate %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={row.rate || ""}
                            onChange={e => row.setRate(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 18"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            data-testid={`input-${row.testId}-rate`}
                          />
                        </div>
                        <div>
                          <Label className="text-sm uppercase">GST Amount</Label>
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400 pt-2" data-testid={`text-${row.testId}-amount`}>
                            {row.rate ? `+ Rs. ${formatCurrency(row.amount)}` : "—"}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-t pt-3">
                      <div className="md:col-span-2">
                        <Label className="text-sm uppercase">{contractorAdvanceSuggestion && hireGroups.length === 0 ? "Other Debit / Recovery — Contractor Diesel Advance" : "Advance Deduction"}</Label>
                        {contractorAdvanceSuggestion && hireGroups.length === 0 && <p className="text-xs text-muted-foreground">
                          {contractorAdvanceSuggestion.amount == null
                            ? `${contractorAdvanceSuggestion.litres.toFixed(2)} L recorded. No purchased diesel rate is available; enter an agreed manual recovery or remove it.`
                            : `${contractorAdvanceSuggestion.litres.toFixed(2)} L × period-weighted purchased diesel rate ₹${contractorAdvanceSuggestion.rate!.toFixed(2)}/L. Review, edit, or remove before saving.`}
                        </p>}
                      </div>
                      <div>
                        <Label className="text-sm uppercase">Reason / reference</Label>
                        <Input value={adjustmentLabel} onChange={e => setAdjustmentLabel(e.target.value.toUpperCase())}
                          placeholder="DIESEL ADVANCE / OTHER RECOVERY" data-testid="input-adjustment-label" />
                      </div>
                      <div>
                        <Label className="text-sm uppercase">Amount (negative to deduct)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={adjustmentAmount || ""}
                          onChange={e => setAdjustmentAmount(parseFloat(e.target.value) || 0)}
                          placeholder="e.g. -50000"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          data-testid="input-adjustment-amount"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 border-t pt-3" data-testid="additional-adjustments">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <Label className="text-sm uppercase">Additional deductions / credits</Label>
                          <p className="text-xs text-muted-foreground">Add independent signed adjustments without replacing the primary recovery above.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAdditionalAdjustments(previous => [...previous, { label: "", amount: 0 }])}
                          data-testid="button-add-adjustment"
                        >
                          <Plus className="w-3 h-3 mr-1" /> ADD DEDUCTION / CREDIT
                        </Button>
                      </div>
                      {additionalAdjustments.map((adjustment, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
                          data-testid={`additional-adjustment-row-${index}`}
                        >
                          <div className="md:col-span-2">
                            <Label className="text-sm uppercase">Reason / reference</Label>
                            <Input
                              value={adjustment.label}
                              onChange={e => setAdditionalAdjustments(previous => previous.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, label: e.target.value.toUpperCase() } : entry,
                              ))}
                              placeholder="CASH ADVANCE / DAMAGES / CREDIT"
                              data-testid={`input-additional-adjustment-label-${index}`}
                            />
                          </div>
                          <div>
                            <Label className="text-sm uppercase">Amount (negative to deduct)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={adjustment.amount || ""}
                              onChange={e => setAdditionalAdjustments(previous => previous.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, amount: parseFloat(e.target.value) || 0 } : entry,
                              ))}
                              placeholder="e.g. -50000"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              data-testid={`input-additional-adjustment-amount-${index}`}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => setAdditionalAdjustments(previous => previous.filter((_, entryIndex) => entryIndex !== index))}
                            aria-label={`Remove additional adjustment ${index + 1}`}
                            data-testid={`button-remove-adjustment-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div className="md:col-span-2">
                        <Label className="text-sm uppercase">IT TDS</Label>
                          <p className="text-sm text-muted-foreground">On Rs. {formatCurrency(totalAmount)}</p>
                      </div>
                      <div>
                        <Label className="text-sm uppercase">Rate %</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={tdsRate || ""}
                          onChange={e => setTdsRate(parseFloat(e.target.value) || 0)}
                          placeholder="e.g. 2"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          data-testid="input-tds-rate"
                        />
                      </div>
                      <div>
                        <Label className="text-sm uppercase">TDS Amount</Label>
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400 pt-2" data-testid="text-tds-amount">
                          {tdsRate ? `- Rs. ${formatCurrency(tdsAmount)}` : "—"}
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}

              {(totalGstAmount !== 0 || adjustmentAmount !== 0 || additionalAdjustmentTotal !== 0 || tdsAmount !== 0) && (
                <div className="space-y-1 p-3 rounded-md bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
                  {totalGstAmount !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold uppercase">TOTAL GST</span>
                      <span className="font-semibold text-green-700 dark:text-green-400">+ Rs. {formatCurrency(totalGstAmount)}</span>
                    </div>
                  )}
                  {adjustmentAmount !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold uppercase">{adjustmentLabel || "ADVANCE DEDUCTION"}</span>
                      <span className="font-semibold">{adjustmentAmount >= 0 ? "+" : ""} Rs. {formatCurrency(adjustmentAmount)}</span>
                    </div>
                  )}
                  {additionalAdjustments.map((adjustment, index) => adjustment.amount !== 0 && (
                    <div className="flex justify-between text-sm" key={index} data-testid={`text-additional-adjustment-${index}`}>
                      <span className="font-semibold uppercase">{adjustment.label || "ADDITIONAL DEDUCTION / CREDIT"}</span>
                      <span className="font-semibold">{adjustment.amount >= 0 ? "+" : ""} Rs. {formatCurrency(adjustment.amount)}</span>
                    </div>
                  ))}
                  {tdsAmount !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold uppercase">IT TDS @ {tdsRate}%</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">- Rs. {formatCurrency(tdsAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-end pt-1 border-t border-amber-400 dark:border-amber-600">
                    <span className="text-base font-bold" data-testid="text-net-total">NET TOTAL: Rs. {formatCurrency(netTotal)}</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label className="text-sm uppercase">Notes / Remarks</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={e => setNotes(e.target.value.toUpperCase())}
                placeholder="ENTER NOTES OR REMARKS"
                className="uppercase"
                data-testid="input-notes"
              />
            </div>
            <div className="flex justify-end gap-2 flex-wrap">
              <WholeBillExportButtons canExport={canExport} isFieldEngineer={user?.isFieldEngineer}
                isAdmin={user?.isAdmin} isOwner={user?.isOwner}
                position="footer" getSnapshot={getCurrentFormSnapshot} />
              <Button variant="outline" onClick={() => { resetForm(); setView("list"); }} data-testid="button-cancel">
                CANCEL
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-bill"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editingBillId ? "UPDATE BILL" : "SAVE BILL"}
              </Button>
            </div>
          </CardContent>
        </Card>}

        {isHistoricalHireEdit && <Card data-testid="historical-hire-save-card">
          <CardContent className="space-y-4 py-4">
            <div>
              <Label className="text-sm uppercase">Notes / Remarks</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={e => setNotes(e.target.value.toUpperCase())}
                placeholder="ENTER NOTES OR REMARKS"
                className="uppercase"
                data-testid="input-notes"
              />
            </div>
            <div className="flex justify-end gap-2 flex-wrap">
              <WholeBillExportButtons canExport={canExport} isFieldEngineer={user?.isFieldEngineer}
                isAdmin={user?.isAdmin} isOwner={user?.isOwner}
                position="footer" getSnapshot={getCurrentFormSnapshot} />
              <Button variant="outline" onClick={() => { resetForm(); setView("list"); }} data-testid="button-cancel">
                CANCEL
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-bill"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                UPDATE BILL
              </Button>
            </div>
          </CardContent>
        </Card>}

        <Dialog open={showSetRatesDialog} onOpenChange={setShowSetRatesDialog}>
          <DialogContent className={`${showBulkRateConfirmation ? "max-w-2xl" : "max-w-lg"} max-h-[80vh] overflow-y-auto`}
            onCloseAutoFocus={() => {
              // Radix fires after Presence has removed the closing content,
              // including its exit animation. Never toast over confirmation.
              const message = pendingRateToastRef.current;
              pendingRateToastRef.current = null;
              if (message) toast(message);
            }}>
            {!showBulkRateConfirmation ? <>
            <DialogHeader>
              <DialogTitle>SET RATES</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {(["equipment", "material", "transport", "labour", "other"] as const).map(cat => {
                const catGroups = uniqueRateGroups.filter(g => g.category === cat);
                if (catGroups.length === 0) return null;
                const catLabel = cat === "equipment" ? "EQUIPMENT" : cat === "material" ? "MATERIAL" : cat === "transport" ? "TRANSPORT" : cat === "labour" ? "LABOUR" : "OTHER";
                return (
                  <div key={cat} className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-1">
                      <Badge variant="outline" className={`text-[12px] ${getCategoryBadgeClass(cat)} no-default-hover-elevate no-default-active-elevate`}>
                        {catLabel}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{catGroups.length} group{catGroups.length !== 1 ? "s" : ""}</span>
                    </div>
                    {catGroups.map(group => (
                      <div key={group.key} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-semibold" data-testid={`text-rate-group-${group.key}`}>{group.groupName}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">{group.entryType}</span>
                              <Badge variant="outline" className="text-xs px-1 py-0">{group.unit}</Badge>
                              <span className="text-sm text-muted-foreground">({group.count} row{group.count !== 1 ? "s" : ""})</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {bulkRates[group.key]?.unitOptions?.length > 1 && (
                            <div className="flex-1 min-w-[150px]">
                              <Label className="text-sm uppercase">Billing Unit</Label>
                              <Select
                                value={bulkRates[group.key]?.targetUnit || group.unit}
                                onValueChange={targetUnit => setBulkRates(prev => {
                                  const current = prev[group.key];
                                  if (!current) return prev;
                                  const normalizedTargetUnit = normalizeRateCardPart(targetUnit);
                                  const option = current.unitOptions.find(candidate =>
                                    normalizeRateCardPart(candidate.unit) === normalizedTargetUnit,
                                  );
                                  return {
                                    ...prev,
                                    [group.key]: {
                                      ...current,
                                      targetUnit: option?.unit || normalizedTargetUnit,
                                      rate: option?.rate || 0,
                                    },
                                  };
                                })}
                              >
                                <SelectTrigger className="h-8 text-sm" data-testid={`select-bulk-unit-${group.key}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {bulkRates[group.key].unitOptions.map(option => (
                                    <SelectItem key={option.unit} value={option.unit}>{option.unit}{option.rate > 0 ? ` · ₹${formatCurrency(option.rate)}` : ""}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[11px] text-muted-foreground mt-1">Changing unit resets each row to quantity 1; review before saving.</p>
                            </div>
                          )}
                          <div className="flex-1 min-w-[120px]">
                            <Label className="text-sm uppercase">Rate (₹)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={bulkRates[group.key]?.rate || ""}
                              onChange={e => setBulkRates(prev => ({ ...prev, [group.key]: { ...prev[group.key], rate: parseFloat(e.target.value) || 0 } }))}
                              placeholder="0"
                              data-testid={`input-bulk-rate-${group.key}`}
                            />
                          </div>
                          {group.category === "transport" && (
                            <div className="flex-1 min-w-[120px]">
                              <Label className="text-sm uppercase">Lead Distance (KM)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={bulkRates[group.key]?.leadDistance || ""}
                                onChange={e => setBulkRates(prev => ({ ...prev, [group.key]: { ...prev[group.key], leadDistance: parseFloat(e.target.value) || 0 } }))}
                                placeholder="0"
                                data-testid={`input-bulk-lead-${group.key}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="flex justify-end gap-2 pt-2 flex-wrap">
                <Button variant="outline" onClick={() => setShowSetRatesDialog(false)} data-testid="button-cancel-rates">
                  CANCEL
                </Button>
                <Button onClick={applyBulkRates} data-testid="button-apply-rates">
                  <Check className="w-4 h-4 mr-1" /> APPLY RATES
                </Button>
              </div>
            </div>
            </> : <>
            <DialogHeader>
              <DialogTitle>CONFIRM BILLING UNIT CONVERSION</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Review these group-wide changes before applying. Each source row becomes one target unit; no conversion factor is inferred.
              </p>
              {bulkUnitConversions.map(({ group, selection, beforeQuantity, beforeTotal, newTotal }) => (
                <div key={group.key} className="rounded-md border p-3 space-y-1" data-testid={`bulk-unit-confirm-${group.key}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold uppercase">{group.groupName}</span>
                    <Badge variant="outline">{group.count} row{group.count !== 1 ? "s" : ""}</Badge>
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">{beforeQuantity} {group.unit}</span>
                    {" → "}
                    <span className="font-medium">{defaultConvertedQuantity(selection.targetUnit)} {selection.targetUnit}</span>
                    {" @ ₹"}{formatCurrency(selection.rate)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Before group total: ₹{formatCurrency(beforeTotal)} · New group total: ₹{formatCurrency(newTotal)}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                These edits stay in memory and can be adjusted per row. Nothing is written until the ordinary SAVE BILL action.
              </p>
              <div className="flex justify-end gap-2 pt-2 flex-wrap">
                <Button variant="outline" onClick={() => setShowBulkRateConfirmation(false)} data-testid="button-cancel-unit-conversion">
                  CANCEL
                </Button>
                <Button onClick={confirmBulkRateApplication} data-testid="button-confirm-unit-conversion">
                  <Check className="w-4 h-4 mr-1" /> APPLY CONVERSION
                </Button>
              </div>
            </div>
            </>}
          </DialogContent>
        </Dialog>
      </div>
      </>
    );
  }

  if (view === "detail" && (billDetail || selectedBillId)) {
    const bill = billDetail;
    if (!bill) {
      return (
        <div className="max-w-5xl mx-auto p-4 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      );
    }

    const currentStatusIdx = STATUS_ORDER.indexOf(bill.status as any);
    const nextStatus = currentStatusIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentStatusIdx + 1] : null;
    const canChangeBillDate = !bill.isCancelled && (
      isAdmin || !!user?.isOwner ||
      (bill.status === "draft" && (
        sectionCan("vendor_bills", "edit") || sectionCan("vendor_bills_raise", "edit")
      ))
    );
    const auditEntries = billAuditHistory.data || [];
    const createdAudit = auditEntries.find(entry => entry.action === "create");
    const lastChangeAudit = auditEntries.find(entry => entry.action !== "create") || createdAudit;
    const voidAudit = auditEntries.find(entry => entry.action === "void");
    const auditDateLabel = (value: AuditLog["createdAt"]) =>
      value ? new Date(value).toLocaleString() : "time unavailable";
    const hasPersistedHireStatements = Array.isArray((bill as any).hireStatements) && (bill as any).hireStatements.length > 0;
    const savedHireOutputs = ((bill as any).hireStatements || []).map((statement: any, index: number) =>
      buildSavedEquipmentHireBillOutput({
        ...bill, hireStatements: [statement],
        hireReview: projectHireReview(statement, bill),
        // Bill-wide net must not be repeated once for each statement.
        ...(index > 0 ? { netPayableAmount: undefined } : {}),
      }));
    const detailFinancials = getBillFinancialTotals(bill);
    const confirmedVendor = (bill as any).vendorId == null ? undefined :
      billingIdentities.data?.find(identity => identity.id === Number((bill as any).vendorId));
    const detailVendorName = confirmedVendor?.businessName?.trim() || confirmedVendor?.name || bill.vendorName;
    const detailSubtotals: Record<string, number> = {};
    bill.items.forEach((item: any) => {
      const category = item.category || "other";
      detailSubtotals[category] = (detailSubtotals[category] || 0) + (Number(item.amount) || 0);
    });
    const getCurrentDetailSnapshot = (): WholeBillSnapshot => {
      const b = bill as any;
      const type = String(bill.billType || "").toLowerCase();
      const shouldGroup = computeCategorySubTotals(bill.items).length > 1;
      const historicalHire = type === "equipment" && hasPersistedHireStatements &&
        !b.hireStatements.some((statement: any) => statement.calculationSnapshot?.billingIntegration === "vb10_automatic");
      const outputs = savedHireOutputs.flatMap((output: ReturnType<typeof buildSavedEquipmentHireBillOutput>) =>
        output ? [output.data] : []);
      return {
        companyName: companyName || "HLC", vendorName: detailVendorName, billNo: bill.billNo, billDate: bill.billDate,
        periodFrom: bill.periodFrom || "", periodTo: bill.periodTo || "",
        site: b.siteName || (b.siteId == null ? "All sites" : sites?.find(site => site.id === b.siteId)?.name || ""),
        equipmentType: Array.from(new Set((b.hireStatements || [])
          .map((statement: any) => String(statement.equipmentType || "").trim()).filter(Boolean))).join(", ") || undefined,
        billType: type, billTypeLabel: getBillTypeLabel(type), saved: true, status: bill.status,
        generatedAt: new Date().toISOString(), notes: bill.notes || "",
        financialRows: buildSavedBillPresentationRows(b, detailFinancials),
        hireReviews: projectBillHireReviews(b),
        sections: projectVendorBillPageItems({
          items: bill.items, subtotals: detailSubtotals, shouldGroup, billType: type, total: detailFinancials.totalAmount,
          getLabourSource: item => getLabourSource({ siteName: item.siteName, description: item.description || "" }),
          getSiteLabel: item => parseSiteBadge({ ...item, description: item.description || "" })?.label || null,
          formatDate,
        }),
        calendars: hasPersistedHireStatements
          ? savedHireOutputs.flatMap((output: ReturnType<typeof buildSavedEquipmentHireBillOutput>, index: number) => {
            if (!output) return [{
              equipmentName: b.hireStatements[index]?.equipmentName || "Equipment",
              equipmentType: b.hireStatements[index]?.equipmentType || undefined,
              periodFrom: b.hireStatements[index]?.periodFrom || bill.periodFrom || "",
              periodTo: b.hireStatements[index]?.periodTo || bill.periodTo || "", rows: [],
              unavailableReason: "Frozen daily activity is unavailable for this historical bill.",
            }];
            return [{
              equipmentName: output.data.equipmentName, periodFrom: output.data.periodFrom, periodTo: output.data.periodTo,
              equipmentType: output.data.equipmentType,
              rows: output.rows, dieselResponsibility: output.data.dieselResponsibility,
              consumptionNorm: output.data.consumptionNorm, meterType: output.data.meterType,
              breakdown: String(b.hireStatements[index]?.status || "").toLowerCase() === "approved" || bill.status !== "draft"
                ? historicalHireSheetRows(b.hireStatements[index]?.calculationSnapshot, date => formatDate(date), formatCurrency)
                : undefined,
              unavailableReason: output.hasFrozenDailyRows ? undefined : "Frozen daily activity is unavailable for this historical bill.",
            }];
          })
          : readCalendars([`detail|${bill.id}|${bill.periodFrom}|${bill.periodTo}`]),
        totals: historicalHire && outputs.length
          ? displayedHireTotals(outputs, b.netPayableAmount == null ? undefined : Number(b.netPayableAmount))
          : {
            subtotal: detailFinancials.totalAmount, totalGst: detailFinancials.totalGst,
            gst: detailFinancials.gstRows,
            adjustments: [
              { label: b.adjustmentLabel || "ADVANCE DEDUCTION", amount: detailFinancials.primaryAdjustment },
              ...detailFinancials.additional.map(adjustment => ({
                label: adjustment.label || "ADDITIONAL DEDUCTION / CREDIT", amount: adjustment.amount,
              })),
            ],
            tds: { label: `IT TDS @ ${Number(b.tdsRate) || 0}%`, amount: -detailFinancials.tds },
            netPayable: detailFinancials.netTotal,
          },
      };
    };

    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => {
              if (payablesReturnTo) setLocation(payablesReturnTo);
              else { setSelectedBillId(null); setView("list"); }
            }} data-testid="button-back-detail">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold" data-testid="text-detail-title">BILL DETAIL</h1>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {canExport && String(bill.billType || "").toLowerCase() === "equipment" && (bill as any).hireStatements?.length === 1 && <EquipmentHireBillDetailOutput bill={bill} output={savedHireOutputs[0]} showExports={false} />}
            {canExport && <Button variant="outline" size="sm" onClick={() => handlePrint(bill)} data-testid="button-print">
              <Printer className="w-4 h-4 mr-1" /> PRINT
            </Button>}
            {canEdit && !bill.isCancelled && (!bill.hireStatements?.length
              || (bill.status === "draft" && bill.hireStatements.every(s => s.status === "draft"))) && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleEditBill(bill)}
                data-testid="button-edit-bill"
              >
                <Edit className="w-4 h-4 mr-1" /> EDIT
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div>
                <p className="text-sm text-muted-foreground uppercase">Vendor</p>
                <p className="text-xl font-bold" data-testid="text-vendor-name">{detailVendorName}</p>
              </div>
              <Badge variant="outline" className={`uppercase text-sm ${getStatusBadgeClass(bill.isCancelled ? "voided" : bill.status)} no-default-hover-elevate no-default-active-elevate`} data-testid="badge-bill-status">
                {bill.isCancelled ? "VOID" : bill.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground uppercase">Bill Number</p>
                <p className="text-sm font-semibold" data-testid="text-bill-no">{bill.billNo}</p>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground uppercase">Bill Date</p>
                  {canChangeBillDate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => {
                        setBillDateDraft(bill.billDate);
                        setBillDateReason("");
                        setShowBillDateDialog(true);
                      }}
                      data-testid="button-change-bill-date"
                    >
                      <Edit className="w-3 h-3 mr-1" /> CHANGE
                    </Button>
                  )}
                </div>
                <p className="text-sm font-semibold" data-testid="text-bill-date">{formatDate(bill.billDate)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground uppercase">Bill Type</p>
                <p className="text-sm font-semibold" data-testid="text-bill-type">{getBillTypeLabel(bill.billType)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground uppercase">Period</p>
                <p className="text-sm font-semibold" data-testid="text-period">
                  {bill.periodFrom && bill.periodTo ? `${formatDate(bill.periodFrom)} to ${formatDate(bill.periodTo)}` : "-"}
                </p>
              </div>
            </div>

            {canViewFinancials && <VendorRunningStatement bill={bill} bills={financialReview.data || []} totals={getBillFinancialTotals} />}
            {/* 06M-A: Payment Mode / Paid By — entry preferred once PAID, shown
                whenever values exist. No payment evidence/QR upload here. */}
            {(hasCumulativeVendorPayment(bill.billType) || bill.status === "paid" || (bill as any).paymentMode || (bill as any).paidBy) && (
              <VendorBillPaymentDetails
                key={bill.id}
                bill={bill}
                  canEditPayment={canMarkPaid && !bill.isCancelled && ["approved", "paid"].includes(bill.status)}
              />
            )}

            {!bill.isCancelled && <div className="border-t pt-4">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">Status Progress</p>
              {renderStatusSteps(bill.status, {
                createdAt: bill.createdAt,
                authorName: bill.authorName,
                verifiedAt: bill.verifiedAt,
                verifiedBy: bill.verifiedBy,
                approvedAt: bill.approvedAt,
                approvedBy: bill.approvedBy,
                paidAt: bill.paidAt,
                paymentRecordedBy: (bill as any).paymentRecordedBy,
                paymentAccountKey: (bill as any).paymentAccountKey,
              })}
            </div>}

            <div className="flex gap-2 pt-2 flex-wrap">
              {canEdit && !bill.isCancelled && nextStatus && (
                <Button
                  size="sm"
                  onClick={() => handleStatusChange(bill.id, nextStatus)}
                  disabled={statusMutation.isPending}
                  data-testid="button-advance-status"
                >
                  {statusMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  MARK AS {nextStatus.toUpperCase()}
                </Button>
              )}
              {canVoid && !bill.isCancelled && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setVoidBillAction({ billId: bill.id, billNo: bill.billNo })}
                  data-testid="button-void-bill"
                >
                  VOID BILL
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBillHistory(true)}
                data-testid="button-bill-history"
              >
                <History className="w-3 h-3 mr-1" /> HISTORY
              </Button>
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => handleDeleteBill(bill)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-bill"
                >
                  {deleteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  <Trash2 className="w-3 h-3 mr-1" /> DELETE BILL
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="vendor-bill-audit-summary">
          <CardHeader className="py-3">
            <CardTitle className="text-sm uppercase tracking-wider">Audit details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {billAuditHistory.isLoading ? (
              <p className="text-muted-foreground">Loading audit details…</p>
            ) : billAuditHistory.isError ? (
              <p className="text-destructive">Audit details could not be loaded.</p>
            ) : auditEntries.length === 0 ? (
              <p className="text-muted-foreground">Creator and change history were not recorded for this bill.</p>
            ) : (
              <>
                <p>
                  Created by <strong>{createdAudit?.userName || "Not recorded"}</strong>
                  {createdAudit && ` · ${auditDateLabel(createdAudit.createdAt)}`}
                </p>
                <p>
                  Last changed by <strong>{lastChangeAudit?.userName || "Not recorded"}</strong>
                  {lastChangeAudit && ` · ${auditDateLabel(lastChangeAudit.createdAt)}`}
                </p>
              </>
            )}
            {bill.isCancelled && (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100" data-testid="bill-void-audit">
                <p className="font-semibold">VOID</p>
                <p>
                  Voided by <strong>{voidAudit?.userName || "Audit actor unavailable"}</strong>
                  {voidAudit && ` · ${auditDateLabel(voidAudit.createdAt)}`}
                </p>
                <p>Reason: {voidAudit?.reason || bill.cancellationReason || "Reason unavailable"}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {voidBillAction && (
          <CancelDialog
            open
            onOpenChange={(open) => { if (!open) setVoidBillAction(null); }}
            cancelUrl={`/api/vendor-bills/${voidBillAction.billId}/void`}
            recordLabel={`Bill ${voidBillAction.billNo}`}
            invalidateQueryKeys={["/api/vendor-bills", "/api/audit-logs"]}
            onCancelled={() => setVoidBillAction(null)}
            actionLabel="Void"
            actionPastTense="voided"
            dialogTitle="Void vendor bill"
            reasonLabel="Reason for voiding *"
          />
        )}

        <HistoryDialog
          open={showBillHistory}
          onOpenChange={setShowBillHistory}
          module="vendor_bills"
          transactionId={bill.id}
          recordLabel={`Bill ${bill.billNo}`}
        />

        <Dialog open={showBillDateDialog} onOpenChange={(open) => {
          setShowBillDateDialog(open);
          if (!open) setBillDateReason("");
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change bill accounting date</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Changes the accounting date only. Amounts, line items and status are unchanged. This is the date Tally orders the vendor&apos;s ledger by.
            </p>
            <div className="space-y-2">
              <Label htmlFor="bill-accounting-date">Bill date</Label>
              <Input
                id="bill-accounting-date"
                type="date"
                value={billDateDraft}
                onChange={event => setBillDateDraft(event.target.value)}
                data-testid="input-bill-accounting-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-date-change-reason">Reason (optional)</Label>
              <Textarea
                id="bill-date-change-reason"
                value={billDateReason}
                onChange={event => setBillDateReason(event.target.value)}
                rows={2}
                maxLength={500}
                data-testid="input-bill-date-reason"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBillDateDialog(false)} data-testid="button-cancel-bill-date">CANCEL</Button>
              <Button
                onClick={() => billDateMutation.mutate({ id: bill.id, billDate: billDateDraft, reason: billDateReason })}
                disabled={billDateMutation.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(billDateDraft)}
                data-testid="button-save-bill-date"
              >
                {billDateMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} SAVE DATE
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {hasPersistedHireStatements && (
          <Card className="border-orange-200 dark:border-orange-800">
            <CardHeader className="py-3"><CardTitle className="text-sm uppercase tracking-wider">EQUIPMENT HIRE CALCULATION SNAPSHOT</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {hasFrozenTripDailyHire(bill as any) && <p className="text-sm text-amber-700">{FROZEN_TRIP_DAILY_MESSAGE}</p>}
              {(bill as any).hireStatements.map((statement: any) => (
                <div key={statement.id} className="border rounded p-3 text-xs space-y-2">
                  <p>{formatDate(statement.periodFrom)}–{formatDate(statement.periodTo)} · {String(statement.billingBasis).toUpperCase()} · {String(statement.status).toUpperCase()}</p>
                  <p>QTY {statement.quantity} · RATE ₹{formatCurrency(statement.rate)} · GROSS ₹{formatCurrency(statement.grossAmount)} · DEDUCTION ₹{formatCurrency(statement.deductionAmount)} · NET ₹{formatCurrency(statement.netAmount)}</p>
                  <p>HSD ACTUAL / EXPECTED {statement.calculationSnapshot?.diesel?.actualDiesel ?? "—"} / {statement.calculationSnapshot?.diesel?.expectedDiesel ?? "—"} L</p>
                  <p>NET EXCESS {statement.calculationSnapshot?.diesel?.suggestedExcess ?? "—"} L · FINAL RECOVERY {statement.calculationSnapshot?.diesel?.finalRecoveryAmount == null ? "—" : `₹${formatCurrency(statement.calculationSnapshot.diesel.finalRecoveryAmount)}`}</p>
                </div>
              ))}
              <SavedBillCalendars bill={bill} canExport={canExport} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <span className="font-bold text-amber-600 dark:text-amber-400" data-testid="text-detail-total">
              TOTAL: {formatCurrency(bill.totalAmount)}
            </span>
            <BillDateGroupControls
              expansionMode={dateGroupExpansionMode}
              onExpansionModeChange={setAllDateGroupsExpanded}
            />
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {(() => {
              const hasLead = bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0);
              const hasSuppliedOrTransporter = canViewBills && bill.items.some((it: any) => it.suppliedTo || it.transporter);
              const totalCols = hasLead ? (hasSuppliedOrTransporter ? 11 : 9) : (hasSuppliedOrTransporter ? 10 : 8);
              const labelCols = hasLead ? (hasSuppliedOrTransporter ? 9 : 7) : (hasSuppliedOrTransporter ? 8 : 6);
              const catSubs = computeCategorySubTotals(bill.items);
              const shouldGroup = catSubs.length > 1;
              const categories = ["equipment", "material", "transport", "labour", "other"] as const;
              const catLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", labour: "LABOUR", other: "OTHER" };

              const renderDetailRow = (item: any, idx: number) => (
                <tr key={item.id || idx} className="border-b">
                  <td className="px-2 py-2 text-muted-foreground text-sm">{idx + 1}</td>
                  <td className="px-2 py-2 text-sm font-mono" data-testid={`text-detail-item-date-${idx}`}>{formatDate(item.date)}</td>
                  <td className="px-2 py-2 text-center">
                    {item.category ? (
                      <Badge
                        variant="outline"
                        className={`text-[12px] ${getCategoryBadgeClass(item.category)} no-default-hover-elevate no-default-active-elevate`}
                      >
                        {getCategoryLabel(item.category)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[12px] text-muted-foreground">
                        {isAutoLineSource(item.source) ? "AUTO" : "-"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-2 font-medium text-sm" data-testid={`text-detail-item-desc-${idx}`}>
                    <div className="space-y-1">
                      <span>{item.description}</span>
                      <EquipmentLogFacts category={item.category} evidence={item.equipmentLogEvidence as EquipmentLogEvidence | null | undefined} rowKey={`detail-${idx}`} />
                      <TransportPricingRow item={item} />
                      <div className="flex items-center gap-1 flex-wrap">
                        {(() => {
                          const badge = parseSiteBadge(item);
                          return badge ? (
                            <Badge variant="outline" className={`text-[12px] ${getSiteBadgeClass(badge.type)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-site-${idx}`}>
                              {badge.label}
                            </Badge>
                          ) : null;
                        })()}
                        {extractDiesel(item.description) > 0 && (
                          <Badge variant="outline" className="text-[12px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 no-default-hover-elevate no-default-active-elevate">
                            <Fuel className="w-3 h-3 mr-1" />
                            {extractDiesel(item.description)}L DIESEL
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  {hasSuppliedOrTransporter && <td className="px-2 py-2 text-sm text-muted-foreground" data-testid={`text-detail-item-supplied-to-${idx}`}>{item.suppliedTo || "—"}</td>}
                  {hasSuppliedOrTransporter && <td className="px-2 py-2 text-sm text-muted-foreground" data-testid={`text-detail-item-transporter-${idx}`}>{item.transporter || "—"}</td>}
                  <td className="px-2 py-2 text-sm">{formatQty(item.qty)}</td>
                  <td className="px-2 py-2 text-sm">{item.unit}</td>
                  {hasLead && (
                    <td className="px-2 py-2 text-sm">
                      {item.leadDistance && item.leadDistance > 0 ? (
                        <span>{formatQty(item.leadDistance)} <span className="text-muted-foreground">(RT: {formatQty(item.leadDistance * 2)})</span></span>
                      ) : "-"}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right text-sm">{formatCurrency(item.rate)}</td>
                  <td className="px-2 py-2 text-right font-semibold bg-amber-50 dark:bg-amber-900/20 text-sm" data-testid={`text-detail-item-amount-${idx}`}>
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              );

              return (
                <table className="w-full text-sm" style={{ minWidth: 800 }}>
                  <thead>
                    <tr className="border-b text-sm text-muted-foreground uppercase">
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left w-24">Date</th>
                      <th className="px-2 py-2 text-center w-16">Type</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      {hasSuppliedOrTransporter && <th className="px-2 py-2 text-left w-28">Supplied To</th>}
                      {hasSuppliedOrTransporter && <th className="px-2 py-2 text-left w-28">Transporter</th>}
                      <th className="px-2 py-2 text-left w-24">Qty</th>
                      <th className="px-2 py-2 text-left w-16">Unit</th>
                      {hasLead && <th className="px-2 py-2 text-left w-28">Lead (KM)</th>}
                      <th className="px-2 py-2 text-right w-32">Rate (₹)</th>
                      <th className="px-2 py-2 text-right w-36">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shouldGroup ? (
                      <>
                        {categories.map(cat => {
                          const catItems = bill.items.map((item: any, idx: number) => ({ item, idx })).filter(({ item }: any) => item.category === cat);
                          if (catItems.length === 0) return null;
                          const catTotal = catItems.reduce((sum: number, { item }: any) => sum + (item.amount || 0), 0);
                          const catGstRate = cat === "equipment" ? (bill as any).gstRateEquipment : cat === "material" ? (bill as any).gstRateMaterial : cat === "transport" ? (bill as any).gstRateTransport : cat === "labour" ? (bill as any).gstRateLabour : 0;
                          const catGstAmount = catGstRate ? catTotal * catGstRate / 100 : 0;
                          return (
                            <Fragment key={cat}>
                              <tr className={`${getCategoryBadgeClass(cat)} border-b`}>
                                <td colSpan={totalCols} className="px-3 py-2 font-semibold text-sm uppercase tracking-wider">
                                  <Badge variant="outline" className={`${getCategoryBadgeClass(cat)} mr-2 no-default-hover-elevate no-default-active-elevate`}>
                                    {catLabels[cat]}
                                  </Badge>
                                  {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                                </td>
                              </tr>
                              {(() => {
                                if (cat !== "labour") return (
                                  <BillDateGroupRows
                                    items={catItems}
                                    scope={`detail-${cat}`}
                                    totalColumns={totalCols}
                                    totalBillItems={bill.items.length}
                                    expansionMode={dateGroupExpansionMode}
                                    expansionOverrides={dateGroupExpansionOverrides}
                                    onToggle={toggleDateGroup}
                                    renderRow={renderDetailRow}
                                    formatDate={formatDate}
                                    formatAmount={formatCurrency}
                                  />
                                );
                                const siteItems = catItems.filter(({ item }: any) => getLabourSource(item) === "site");
                                const plantItems = catItems.filter(({ item }: any) => getLabourSource(item) === "plant");
                                const otherItems = catItems.filter(({ item }: any) => getLabourSource(item) === "other");
                                const present = (siteItems.length ? 1 : 0) + (plantItems.length ? 1 : 0) + (otherItems.length ? 1 : 0);
                                if (present <= 1) return (
                                  <BillDateGroupRows
                                    items={catItems}
                                    scope="detail-labour"
                                    totalColumns={totalCols}
                                    totalBillItems={bill.items.length}
                                    expansionMode={dateGroupExpansionMode}
                                    expansionOverrides={dateGroupExpansionOverrides}
                                    onToggle={toggleDateGroup}
                                    renderRow={renderDetailRow}
                                    formatDate={formatDate}
                                    formatAmount={formatCurrency}
                                  />
                                );
                                const groups: Array<{ key: "site" | "plant" | "other"; label: string; items: any[] }> = [];
                                if (siteItems.length) groups.push({ key: "site", label: "DPR Site Labour", items: siteItems });
                                if (plantItems.length) groups.push({ key: "plant", label: "Plant Shift Manpower", items: plantItems });
                                if (otherItems.length) groups.push({ key: "other", label: "Manual / Other", items: otherItems });
                                return groups.map(grp => {
                                  const grpTotal = grp.items.reduce((s: number, { item }: any) => s + (item.amount || 0), 0);
                                  const badgeClass = grp.key === "other"
                                    ? "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-600"
                                    : getSiteBadgeClass(grp.key);
                                  return (
                                    <Fragment key={grp.key}>
                                      <tr className="border-b bg-muted/20">
                                        <td colSpan={totalCols} className="px-3 py-1.5 text-sm uppercase tracking-wider" data-testid={`row-detail-labour-source-${grp.key}`}>
                                          <Badge variant="outline" className={`text-[12px] mr-2 ${badgeClass} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-detail-labour-source-${grp.key}`}>
                                            {grp.label}
                                          </Badge>
                                          <span className="text-muted-foreground normal-case">
                                            {grp.items.length} row{grp.items.length !== 1 ? "s" : ""} · Rs. {formatCurrency(grpTotal)}
                                          </span>
                                        </td>
                                      </tr>
                                      <BillDateGroupRows
                                        items={grp.items}
                                        scope={`detail-${cat}-labour-${grp.key}`}
                                        totalColumns={totalCols}
                                        totalBillItems={bill.items.length}
                                        expansionMode={dateGroupExpansionMode}
                                        expansionOverrides={dateGroupExpansionOverrides}
                                        onToggle={toggleDateGroup}
                                        renderRow={renderDetailRow}
                                        formatDate={formatDate}
                                        formatAmount={formatCurrency}
                                      />
                                    </Fragment>
                                  );
                                });
                              })()}
                              <tr className="border-b bg-muted/40">
                                <td colSpan={labelCols} className="px-2 py-2 text-right text-sm font-semibold uppercase">
                                  {catLabels[cat]} Sub-total
                                </td>
                                <td className="px-2 py-2 text-right text-sm font-semibold" colSpan={2}>Rs. {formatCurrency(catTotal)}</td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </>
                    ) : (
                      <BillDateGroupRows
                        items={bill.items.map((item: any, idx: number) => ({ item, idx }))}
                        scope="detail-all"
                        totalColumns={totalCols}
                        totalBillItems={bill.items.length}
                        expansionMode={dateGroupExpansionMode}
                        expansionOverrides={dateGroupExpansionOverrides}
                        onToggle={toggleDateGroup}
                        renderRow={renderDetailRow}
                        formatDate={formatDate}
                        formatAmount={formatCurrency}
                      />
                    )}
                  </tbody>
                  <tfoot>
                    {buildSavedBillPresentationRows(bill, detailFinancials).map((row, index) => {
                      const negative = row.amount < 0;
                      const highlighted = row.kind === "gross" || row.kind === "net";
                      const tone = row.kind === "gst" || row.kind === "credit"
                        ? "text-green-700 dark:text-green-400"
                        : row.kind === "deduction" || row.kind === "tds"
                          ? "text-red-600 dark:text-red-400"
                          : "text-foreground";
                      return <tr key={`${row.kind}-${index}`}
                        className={`${highlighted ? "border-t-2 border-amber-600 bg-amber-50 dark:bg-amber-900/20" : "border-t bg-muted/10"} ${row.kind === "net" ? "font-bold text-base" : ""}`}
                        data-testid={`row-detail-financial-${row.kind}-${index}`}>
                        <td colSpan={labelCols} className={`px-2 py-2 text-right font-semibold uppercase ${tone}`}>
                          {row.label}
                          {row.reason && <div className="mt-1 whitespace-pre-line text-left text-xs font-normal normal-case text-muted-foreground">{row.reason}</div>}
                        </td>
                        <td colSpan={2} className={`px-2 py-2 text-right font-semibold tabular-nums ${tone}`}>
                          {highlighted
                            ? `Rs. ${formatCurrency(row.amount)}`
                            : `${negative ? "−" : "+"} Rs. ${formatCurrency(Math.abs(row.amount))}`}
                        </td>
                      </tr>;
                    })}
                  </tfoot>
                </table>
              );
            })()}
          </CardContent>
        </Card>

        {bill.notes && (
          <Card>
            <CardContent className="py-4">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-muted-foreground" data-testid="text-notes">{bill.notes}</p>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2 flex-wrap">
          <WholeBillExportButtons canExport={canExport} isFieldEngineer={user?.isFieldEngineer}
            isAdmin={user?.isAdmin} isOwner={user?.isOwner}
            position="footer" getSnapshot={getCurrentDetailSnapshot} />
        </div>

        {showDeleteConfirm && (
          <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open) { setShowDeleteConfirm(false); setPendingDeleteAction(null); setDeleteReason(""); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-red-600">DELETE VENDOR BILL</DialogTitle>
              </DialogHeader>
              {pendingDeleteAction?.billNo && (
                <p className="text-sm font-semibold">Bill: {pendingDeleteAction.billNo} <span className="uppercase">({pendingDeleteAction.status || "draft"})</span></p>
              )}
              {pendingDeleteAction?.status && ["approved", "paid"].includes(pendingDeleteAction.status) && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300">
                  <strong>WARNING:</strong> This bill is currently <span className="uppercase font-bold">{pendingDeleteAction.status}</span>. Deleting an {pendingDeleteAction.status} bill is a significant action and may affect financial records.
                </div>
              )}
              <p className="text-sm text-muted-foreground">THIS WILL PERMANENTLY DELETE THIS VENDOR BILL AND ALL ITS LINE ITEMS. THIS ACTION CANNOT BE UNDONE.</p>
              <div className="space-y-2">
                <Label htmlFor="delete-vendor-bill-reason">Reason for permanent deletion *</Label>
                <Textarea
                  id="delete-vendor-bill-reason"
                  data-testid="input-delete-bill-reason"
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                  placeholder="Explain why this bill must be permanently removed."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setPendingDeleteAction(null); setDeleteReason(""); }} data-testid="button-delete-dismiss">
                  CANCEL
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteMutation.isPending || !pendingDeleteAction || !deleteReason.trim()}
                  onClick={() => {
                    if (pendingDeleteAction) {
                      deleteMutation.mutate({ id: pendingDeleteAction.billId, reason: deleteReason.trim() });
                    }
                  }}
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  DELETE PERMANENTLY
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <FileText className="w-5 h-5 text-amber-500" />
              VENDOR BILLS
            </h1>
            <p className="text-sm text-muted-foreground">Manage vendor/supplier billing and payments</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" size="icon" onClick={() => setShowAliasDialog(true)} title="Vendor Aliases" data-testid="button-vendor-aliases">
              <Settings className="w-4 h-4" />
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => { resetForm(); setView("form"); }} data-testid="button-new-bill">
              <Plus className="w-4 h-4 mr-1" /> NEW BILL
            </Button>
          )}
        </div>
      </div>

      {/* Management Report context banner */}
      {mgmtReportSite && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300" data-testid="banner-management-report">
          <BarChart2 className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <span>From Management Report — Filtered to: <strong>{mgmtReportSite}</strong></span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div role="group" aria-label="Bill payment scope" className="inline-flex gap-1">
          <Button size="sm" variant={billScope === "unpaid" ? "default" : "outline"} aria-pressed={billScope === "unpaid"} onClick={() => setBillScope("unpaid")}>Unpaid</Button>
          <Button size="sm" variant={billScope === "all" ? "default" : "outline"} aria-pressed={billScope === "all"} onClick={() => setBillScope("all")}>All Bills</Button>
        </div>
        {canViewFinancials && canExport && <Button variant="outline" size="sm" onClick={() => handleGstRegisterExport("xlsx")}
          disabled={!filteredBills.length || !financialReview.isSuccess || financialReview.isFetching} data-testid="button-export-financial-summary">
          <Download className="w-3 h-3 mr-1" />Export Financial Summary
        </Button>}
        {billsHiddenByUnpaid > 0 && <p role="status" className="text-xs text-muted-foreground">
          {billsHiddenByUnpaid} bill{billsHiddenByUnpaid === 1 ? "" : "s"} hidden by the Unpaid view (credit, negative net, or no remaining balance).
          {" "}<Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setBillScope("all")}>Show hidden bills</Button>
        </p>}
      </div>
      {canViewFinancials && (financialReview.isPending ? <p role="status">Loading permitted financial information…</p>
        : financialReview.isError ? <p role="alert">Financial information is unavailable. <Button variant="link" onClick={() => financialReview.refetch()}>Retry</Button></p>
        : <VendorBillFinancialSummary bills={financialBills} totals={getBillFinancialTotals} />)}
      {canViewFinancials && financialReview.isSuccess && <VendorBillTaxesSummary bills={financialBills} />}

      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <p className="col-span-2 md:col-span-4 text-xs text-muted-foreground">
              Dates match the billed period when it overlaps the selected range. Bills without a recorded billed period use the bill date.
            </p>
            <div>
              <Label className="text-sm uppercase">Billed Period From</Label>
              <div className="relative">
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
                {filterDateFrom && (
                  <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-8" onClick={() => setFilterDateFrom("")} data-testid="button-clear-date-from">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm uppercase">Billed Period To</Label>
              <div className="relative">
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
                {filterDateTo && (
                  <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-8" onClick={() => setFilterDateTo("")} data-testid="button-clear-date-to">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm uppercase">Vendor</Label>
              <div className="flex items-center gap-1">
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger data-testid="filter-vendor" className="flex-1">
                    <SelectValue placeholder="ALL VENDORS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL VENDORS</SelectItem>
                    {vendorNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterVendor !== "all" && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterVendor("all")} data-testid="button-clear-vendor">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm uppercase">Status</Label>
              <div className="flex items-center gap-1">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger data-testid="filter-status" className="flex-1">
                    <SelectValue placeholder="ALL STATUS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL STATUS</SelectItem>
                    <SelectItem value="voided">VOIDED</SelectItem>
                    <SelectItem value="draft">DRAFT</SelectItem>
                    <SelectItem value="verified">VERIFIED</SelectItem>
                    <SelectItem value="approved">APPROVED</SelectItem>
                    <SelectItem value="paid">PAID</SelectItem>
                  </SelectContent>
                </Select>
                {filterStatus !== "all" && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterStatus("all")} data-testid="button-clear-status">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm uppercase">Category</Label>
              <div className="flex items-center gap-1">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger data-testid="filter-category" className="flex-1">
                    <SelectValue placeholder="ALL CATEGORIES" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL CATEGORIES</SelectItem>
                    <SelectItem value="equipment">EQUIPMENT</SelectItem>
                    <SelectItem value="material">MATERIAL</SelectItem>
                    <SelectItem value="transport">TRANSPORT</SelectItem>
                    <SelectItem value="labour">LABOUR</SelectItem>
                    <SelectItem value="combined">ALL TYPES (COMBINED)</SelectItem>
                    <SelectItem value="other">OTHER</SelectItem>
                  </SelectContent>
                </Select>
                {filterCategory !== "all" && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterCategory("all")} data-testid="button-clear-category">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            {canViewBills && partyNames.length > 0 && (
              <div>
                <Label className="text-sm uppercase">Supplied To</Label>
                <div className="flex items-center gap-1">
                  <Select value={filterParty} onValueChange={setFilterParty}>
                    <SelectTrigger data-testid="filter-party" className="flex-1">
                      <SelectValue placeholder="ALL PARTIES" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL PARTIES</SelectItem>
                      {partyNames.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filterParty !== "all" && (
                    <Button size="icon" variant="ghost" onClick={() => setFilterParty("all")} data-testid="button-clear-party">
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div>
              <Label className="text-sm uppercase">Site</Label>
              <div className="flex items-center gap-1">
                <Select value={filterSite || "all"} onValueChange={value => setFilterSite(value === "all" ? "" : value)}>
                  <SelectTrigger data-testid="filter-site" className="flex-1">
                    <SelectValue placeholder="ALL SITES" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL SITES</SelectItem>
                    {filterSite && !sites.some(site => siteMatchesPermitted(site.name, [filterSite])) && (
                      <SelectItem value={filterSite}>{filterSite}</SelectItem>
                    )}
                    {sites.map(site => <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {filterSite && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterSite("")} data-testid="button-clear-site">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {(filterDateFrom || filterDateTo || filterVendor !== "all" || filterStatus !== "all" || filterCategory !== "all" || filterParty !== "all" || filterSite) && (
            <div className="flex justify-end mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterVendor("all"); setFilterStatus("all"); setFilterCategory("all"); setFilterParty("all"); setFilterSite(""); }}
                data-testid="button-clear-all-filters"
              >
                <X className="w-3 h-3 mr-1" />
                CLEAR FILTERS
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filteredBills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty">No vendor bills found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBills.map(bill => {
            let labourSiteAmt = 0, labourPlantAmt = 0, labourTotal = 0;
            for (const item of (bill.items || []) as any[]) {
              if ((item.category || "other") !== "labour") continue;
              const amt = item.amount || 0;
              labourTotal += amt;
              const src = getLabourSource(item);
              if (src === "site") labourSiteAmt += amt;
              else if (src === "plant") labourPlantAmt += amt;
            }
            const showLabourSplit = labourSiteAmt > 0 && labourPlantAmt > 0;
            const billFinancialTotals = getBillFinancialTotals(bill);
            const primaryAdjustmentAmount = billFinancialTotals.primaryAdjustment;
            const additionalBillAdjustments = billFinancialTotals.additional;
            const hasBillAdjustments = primaryAdjustmentAmount !== 0 || additionalBillAdjustments.length > 0;
            return (
            <Card
              key={bill.id}
              className="hover-elevate cursor-pointer"
              onClick={() => openBillDetail(bill)}
              data-testid={`card-bill-${bill.id}`}
            >
              <CardContent className="py-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm uppercase truncate" data-testid={`text-bill-vendor-${bill.id}`}>{bill.vendorName}</p>
                    <p className="text-sm text-muted-foreground" data-testid={`text-bill-meta-${bill.id}`}>
                      {bill.billNo} &bull; {getBillTypeLabel(bill.billType)}
                      {bill.periodFrom && bill.periodTo && ` \u2022 ${formatDate(bill.periodFrom)} to ${formatDate(bill.periodTo)}`}
                    </p>
                    {showLabourSplit && (
                      <p className="text-xs text-muted-foreground italic mt-0.5" data-testid={`text-bill-labour-split-${bill.id}`}>
                        Labour {formatCurrency(labourTotal)} &mdash; DPR Site {formatCurrency(labourSiteAmt)} &middot; Plant Shift {formatCurrency(labourPlantAmt)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`font-bold text-base ${getStatusColor(bill.status)}`} data-testid={`text-bill-amount-${bill.id}`}>
                        {formatCurrency(bill.totalAmount)}
                      </p>
                      {bill.isCancelled && <Badge variant="destructive" data-testid={`badge-void-bill-${bill.id}`}>VOID</Badge>}
                      {hasBillAdjustments && (
                        <div className="text-xs text-muted-foreground space-y-0.5" data-testid={`bill-adjustments-${bill.id}`}>
                          {primaryAdjustmentAmount !== 0 && (
                            <p data-testid={`text-bill-adjustment-${bill.id}`}>
                              {(bill as any).adjustmentLabel || "ADVANCE DEDUCTION"}: {formatCurrency(primaryAdjustmentAmount)}
                            </p>
                          )}
                          {additionalBillAdjustments.map((adjustment, index) => (
                            <p key={index} data-testid={`text-bill-additional-adjustment-${bill.id}-${index}`}>
                              {adjustment.label || "ADDITIONAL DEDUCTION / CREDIT"}: {formatCurrency(adjustment.amount)}
                            </p>
                          ))}
                          <p className="font-semibold text-foreground" data-testid={`text-bill-net-total-${bill.id}`}>
                            Net total: {formatCurrency(billFinancialTotals.netTotal)}
                          </p>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">{bill.items?.length || 0} line items</p>
                    </div>
                    <Badge variant="outline" className={`uppercase ${getStatusBadgeClass(bill.status)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-bill-status-${bill.id}`}>
                      {bill.status}
                    </Badge>
                    {billPaymentPosition(bill).unconfirmed && <Badge variant="outline" className="text-amber-700" title={billPaymentPosition(bill).contradictory ? "Recorded payments contradict Paid status" : "Payment evidence is missing"}>Unconfirmed</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showAliasDialog} onOpenChange={setShowAliasDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>VENDOR ALIASES</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Group vendor name spelling variations so billing pulls records from all variants.
          </p>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-5 gap-2 items-end">
              <div className="col-span-2">
                <Label className="text-sm uppercase">Canonical Name</Label>
                <Select value={aliasCanonical} onValueChange={setAliasCanonical}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-alias-canonical">
                    <SelectValue placeholder="SELECT VENDOR..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-sm uppercase">Alias (Alternate Spelling)</Label>
                <Input
                  value={aliasValue}
                  onChange={e => setAliasValue(e.target.value)}
                  onBlur={e => setAliasValue(e.target.value.toUpperCase())}
                  placeholder="ALTERNATE NAME"
                  className="text-sm h-8 uppercase"
                  data-testid="input-alias-value"
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={!aliasCanonical || !aliasValue || addAliasMutation.isPending}
                onClick={() => addAliasMutation.mutate({ canonicalName: aliasCanonical, alias: aliasValue })}
                data-testid="button-add-alias"
              >
                {addAliasMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </Button>
            </div>

            <div className="border rounded-md max-h-60 overflow-y-auto">
              {(!vendorAliasesData || vendorAliasesData.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">No aliases configured</p>
              ) : (
                <div className="divide-y">
                  {vendorAliasesData.map(a => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <span className="font-semibold">{a.canonicalName}</span>
                        <span className="text-muted-foreground mx-2">=</span>
                        <span className="text-amber-600 dark:text-amber-400">{a.alias}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteAliasMutation.mutate(a.id)}
                        data-testid={`button-delete-alias-${a.id}`}
                      >
                        <X className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
