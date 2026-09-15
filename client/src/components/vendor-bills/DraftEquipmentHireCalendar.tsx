import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EquipmentPerformanceReport } from "@shared/equipmentPerformance";
import {
  buildBillingDailyRows,
  buildEquipmentHirePeriodTotals,
  EquipmentHireDailyActivity,
  EquipmentHireDailyTable,
  EquipmentHireExportButtons,
  exportEquipmentHireCalendar,
  type BillingDailyRow,
  type BillingMaintenance,
  type EquipmentHireExportFormat,
  type EquipmentHireExportData,
} from "@/components/vendor-bills/EquipmentHireBillOutput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CalendarMode = "draft" | "detail";

function EquipmentHirePeriodTotals({
  rows,
  dieselResponsibility,
  consumptionNorm: _consumptionNorm,
}: {
  rows: BillingDailyRow[];
  dieselResponsibility?: string | null;
  consumptionNorm?: number | null;
}) {
  const fuelIsContractorScope = String(dieselResponsibility).toLowerCase() === "vendor";
  const totals = buildEquipmentHirePeriodTotals(rows, dieselResponsibility);
  const display = (value: number | null | undefined, suffix = "") =>
    value == null ? "—" : `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })}${suffix}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border bg-muted/30 px-3 py-2 text-xs" data-testid="equipment-hire-period-totals">
      <span><strong>Hours:</strong> {display(totals.hours, " h")}</span>
      {!fuelIsContractorScope && <>
        <span><strong>Diesel issued:</strong> {display(totals.dieselIssued, " L")}</span>
        <span><strong>Consumed:</strong> {display(totals.dieselConsumed, " L")}</span>
        <span><strong>Expected:</strong> {display(totals.expectedDiesel, " L")}</span>
        <span><strong>Variance:</strong> {display(totals.variance, " L")}</span>
      </>}
      {totals.trips != null && <span><strong>Trips:</strong> {display(totals.trips)}</span>}
      <span><strong>Breakdown days:</strong> {totals.breakdownDays}</span>
      <span><strong>No-activity days:</strong> {totals.noActivityDays}</span>
    </div>
  );
}

export type DraftEquipmentHireCalendarProps = {
  equipmentId: number | null | undefined;
  equipmentName?: string;
  periodFrom: string;
  periodTo: string;
  maintenance?: BillingMaintenance[];
  dieselResponsibility?: string | null;
  consumptionNorm?: number | null;
  exceptionDecisions?: readonly any[];
  dieselRecoveryDecision?: string | null;
  exportData?: EquipmentHireExportData;
  canExport?: boolean;
  disabled?: boolean;
  mode?: CalendarMode;
  children?: ReactNode;
  testId?: string;
};

/**
 * Live Equipment Performance seam for draft hire groups (and the retained
 * statement editor).  A group owns its query so changing one group's period
 * cannot display another group's daily rows.  This is intentionally a
 * component rather than a hook called from a map in VendorBills.
 */
export default function DraftEquipmentHireCalendar({
  equipmentId,
  equipmentName,
  periodFrom,
  periodTo,
  maintenance = [],
  dieselResponsibility,
  consumptionNorm,
  exceptionDecisions = [],
  dieselRecoveryDecision,
  exportData,
  canExport = true,
  disabled = false,
  mode = "draft",
  children,
  testId,
}: DraftEquipmentHireCalendarProps) {
  const [showDailyActivity, setShowDailyActivity] = useState(false);
  const validRequest = Number(equipmentId) > 0 && !!periodFrom && !!periodTo && periodFrom <= periodTo;
  const query = useQuery<EquipmentPerformanceReport>({
    queryKey: ["/api/reports/equipment-performance", Number(equipmentId) || null, periodFrom, periodTo],
    queryFn: async () => {
      const url = `/api/reports/equipment-performance?dateFrom=${encodeURIComponent(periodFrom)}&dateTo=${encodeURIComponent(periodTo)}&equipmentId=${encodeURIComponent(String(equipmentId))}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error((await response.text()) || "Could not load daily equipment activity");
      }
      return response.json();
    },
    enabled: validRequest,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const performance = useMemo(() => {
    if (!query.data || !Array.isArray(query.data.fleet)) return undefined;
    return query.data.fleet.find((row: any) => Number(row.equipmentId) === Number(equipmentId));
  }, [equipmentId, query.data]);

  const rows = useMemo<BillingDailyRow[]>(() => {
    if (!query.isSuccess) return [];
    const dailyRows = Array.isArray(performance?.dailyRows) ? performance.dailyRows : [];
    const baseRows = buildBillingDailyRows(dailyRows, periodFrom, periodTo, maintenance);
    // Decisions are billing evidence, not a replacement for the performance
    // row. Keep the canonical BillingDailyRow shape and add the current
    // decision to its remarks so the visible table follows live edits.
    return baseRows.map(row => {
      const decisions = exceptionDecisions.filter((decision: any) =>
        (decision.date || decision.businessDate) === row.date,
      );
      const decisionText = decisions
        .map((decision: any) => String(decision.decision || "").replace(/_/g, " ").trim())
        .filter(Boolean)
        .map(value => `Decision: ${value}`)
        .join(" · ");
      return decisionText
        ? { ...row, remarks: `${row.remarks} · ${decisionText}` }
        : row;
    });
  }, [exceptionDecisions, maintenance, performance?.dailyRows, periodFrom, periodTo, query.isSuccess]);

  const stateMessage = !validRequest
    ? "Equipment and a valid inclusive bill period are required before daily activity can be loaded."
    : query.isPending || query.isFetching
      ? "Loading daily equipment activity…"
      : query.isError
        ? (query.error instanceof Error ? query.error.message : "Could not load daily equipment activity.")
        : null;

  const status = dieselRecoveryDecision
    ? `Diesel recovery decision: ${String(dieselRecoveryDecision).replace(/_/g, " ")}`
    : null;
  const liveExportData = useMemo(
    () => exportData
      ? { ...exportData, projectSite: exportData.projectSite || performance?.currentLocation || undefined }
      : undefined,
    [exportData, performance?.currentLocation],
  );

  if (mode === "detail") {
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowDailyActivity(true)}
            disabled={disabled || !query.isSuccess || query.isFetching}
            data-testid="button-view-daily-activity"
          >
            {query.isFetching ? "Loading daily activity…" : "View Daily Activity"}
          </Button>
          {canExport && liveExportData && (
            <EquipmentHireExportButtons
              data={liveExportData}
              rows={rows}
              disabled={disabled || !query.isSuccess || query.isFetching || !!query.isError}
            />
          )}
        </div>
        {stateMessage && (
          <p className={`text-xs ${query.isError ? "text-red-700" : "text-muted-foreground"}`} role={query.isError ? "alert" : undefined}>
            {stateMessage}
          </p>
        )}
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
        <EquipmentHireDailyActivity
          open={showDailyActivity}
          onOpenChange={setShowDailyActivity}
          rows={rows}
          dieselResponsibility={dieselResponsibility}
          consumptionNorm={consumptionNorm}
        />
      </>
    );
  }

  return (
    <details
      className="rounded border bg-background/60 p-2"
      data-testid={testId || `draft-equipment-hire-calendar-${equipmentId || "unknown"}`}
    >
      <summary className="cursor-pointer text-xs font-semibold uppercase">
        View activity / breakdown calendar{equipmentName ? ` · ${equipmentName}` : ""}{query.isSuccess ? ` (${rows.length} days)` : ""}
      </summary>
      <div className="mt-3 space-y-3">
        {stateMessage && (
          <p className={`text-xs ${query.isError ? "text-red-700" : "text-muted-foreground"}`} role={query.isError ? "alert" : undefined}>
            {stateMessage}
          </p>
        )}
        {query.isSuccess && (
          <>
            <EquipmentHirePeriodTotals
              rows={rows}
              dieselResponsibility={dieselResponsibility}
              consumptionNorm={consumptionNorm}
            />
            <EquipmentHireDailyTable
              rows={rows}
              dieselResponsibility={dieselResponsibility}
              consumptionNorm={consumptionNorm}
            />
            {status && <p className="text-xs font-medium text-muted-foreground">{status}</p>}
            {canExport && liveExportData && (
              <EquipmentHireExportButtons
                data={liveExportData}
                rows={rows}
                disabled={disabled || query.isFetching || !!query.isError}
              />
            )}
            {children && <div className="border-t pt-3">{children}</div>}
          </>
        )}
      </div>
    </details>
  );
}

/**
 * Itemized equipment bills predate hire statements and therefore have no
 * frozen daily snapshot to render.  Their calendar export is deliberately
 * live, while "Bill" remains the original generic Vendor Bills PDF action.
 * This component keeps that generic trigger/test id and adds the choice only
 * after the user clicks it.
 */
export function SavedEquipmentCalendarExport({
  bill,
  onExportBill,
}: {
  bill: any;
  onExportBill: (format: EquipmentHireExportFormat) => void | Promise<void>;
}) {
  const equipmentItems = useMemo(
    () => (Array.isArray(bill?.items) ? bill.items : []).filter((item: any) =>
      String(item.category || "").toLowerCase() === "equipment" && Number(item.equipmentId) > 0,
    ),
    [bill?.items],
  );
  const equipmentIds = useMemo(
    () => Array.from(new Set(equipmentItems.map((item: any) => Number(item.equipmentId)))),
    [equipmentItems],
  );
  const periodFrom = String(bill?.periodFrom || "");
  const periodTo = String(bill?.periodTo || "");
  const validPeriod = !!periodFrom && !!periodTo && periodFrom <= periodTo;
  const reports = useQuery<EquipmentPerformanceReport[]>({
    queryKey: ["/api/reports/equipment-performance", "saved-equipment-calendar", bill?.id, equipmentIds, periodFrom, periodTo],
    queryFn: async () => Promise.all(equipmentIds.map(async equipmentId => {
      const url = `/api/reports/equipment-performance?dateFrom=${encodeURIComponent(periodFrom)}&dateTo=${encodeURIComponent(periodTo)}&equipmentId=${encodeURIComponent(String(equipmentId))}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error((await response.text()) || `Could not load activity for equipment ${equipmentId}`);
      return response.json() as Promise<EquipmentPerformanceReport>;
    })),
    enabled: equipmentIds.length > 0 && validPeriod,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => {
    if (!reports.isSuccess) return [];
    return reports.data.flatMap((report, index) => {
      const equipmentId = equipmentIds[index];
      const fleetRow = Array.isArray(report?.fleet)
        ? report.fleet.find((row: any) => Number(row.equipmentId) === equipmentId)
        : undefined;
      return buildBillingDailyRows(fleetRow?.dailyRows || [], periodFrom, periodTo);
    });
  }, [equipmentIds, periodFrom, periodTo, reports.data, reports.isSuccess]);
  const equipmentName = useMemo(() => {
    const descriptions = equipmentItems
      .map((item: any) => String(item.description || "").trim())
      .filter(Boolean);
    return Array.from(new Set(descriptions)).join(" · ") || "Equipment";
  }, [equipmentItems]);
  const data = useMemo<EquipmentHireExportData>(() => ({
    billNo: String(bill?.billNo || `VendorBill-${bill?.id || "equipment"}`),
    vendorName: String(bill?.vendorName || ""),
    equipmentName,
    periodFrom,
    periodTo,
    hireBasis: "ITEMIZED",
    rate: 0,
    grossHire: Number(bill?.totalAmount || 0),
    breakdownDeduction: 0,
    hsdRecovery: 0,
    otherDebit: 0,
    advanceAdjustment: 0,
    otherCredit: 0,
    gstRate: Number(bill?.gstRateEquipment || 0),
    gstAmount: 0,
    taxableAmount: Number(bill?.totalAmount || 0),
    invoiceTotal: Number(bill?.totalAmount || 0),
    tdsRate: Number(bill?.tdsRate || 0),
    tdsAmount: 0,
    netPayable: Number(bill?.netPayableAmount ?? bill?.totalAmount ?? 0),
    paid: Number(bill?.amountPaid || 0),
  }), [bill, equipmentName, periodFrom, periodTo]);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportSelection = async (format: EquipmentHireExportFormat, mode: "calendar" | "bill" | "both") => {
    setExporting(true);
    setChoiceOpen(false);
    try {
      if (mode === "bill" || mode === "both") await onExportBill(format);
      if ((mode === "calendar" || mode === "both") && reports.isSuccess) {
        exportEquipmentHireCalendar(data, rows, format);
      }
    } finally {
      setExporting(false);
    }
  };
  const loading = equipmentIds.length > 0 && (reports.isPending || reports.isFetching);
  const calendarUnavailable = equipmentIds.length === 0 || !reports.isSuccess || !!reports.isError;
  const errorMessage = equipmentIds.length === 0
    ? "Calendar export unavailable: no linked equipment ID is present on this itemized bill."
    : !validPeriod
      ? "Calendar export unavailable: this bill does not have a valid inclusive period."
    : reports.error instanceof Error ? reports.error.message : null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={exporting}
        onClick={() => setChoiceOpen(true)}
        data-testid="button-export-pdf"
      >
        Export PDF
      </Button>
      {loading && <span className="self-center text-xs text-muted-foreground">Loading daily activity…</span>}
      {errorMessage && <span role="alert" className="self-center text-xs text-red-700">{errorMessage}</span>}
      <Dialog open={choiceOpen} onOpenChange={setChoiceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Choose PDF export</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={calendarUnavailable || exporting}
              onClick={() => exportSelection("pdf", "calendar")}
              data-testid="button-export-equipment-hire-choice-calendar"
            >
              Export Calendar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={exporting}
              onClick={() => exportSelection("pdf", "bill")}
              data-testid="button-export-equipment-hire-choice-bill"
            >
              Export Bill
            </Button>
            <Button
              type="button"
              disabled={calendarUnavailable || exporting}
              onClick={() => exportSelection("pdf", "both")}
              data-testid="button-export-equipment-hire-choice-both"
            >
              Export Both
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
