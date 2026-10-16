import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Download, FileSpreadsheet, AlertTriangle, ArrowLeft, CalendarDays, ReceiptText, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { projectVendorLedger, projectVendorPayables } from "../../../shared/vendorPayables";
import { summarizeBillReview } from "../../../shared/vendorBillReview";

type VendorBill = {
  id: number;
  billNo?: string | null;
  billDate?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  status?: string | null;
  vendorId?: number | null;
  vendorName?: string | null;
  linkedVendorName?: string | null;
  totalAmount?: number | string | null;
  netPayableAmount?: number | string | null;
  amountPaid?: number | string | null;
  items?: unknown[];
  additionalAdjustments?: unknown;
  [key: string]: unknown;
};

type PayablesReport = ReturnType<typeof projectVendorPayables>;

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value ?? 0);

const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const periodLabel = (from?: string | null, to?: string | null) => {
  if (!from && !to) return "—";
  if (!from || !to || String(from).slice(0, 10) === String(to).slice(0, 10)) return dateLabel(from || to);
  return `${dateLabel(from)} – ${dateLabel(to)}`;
};

const withDateRange = (path: string, dateFrom: string, dateTo: string) => {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const withPayablesTab = (path: string, dateFrom: string, dateTo: string, tab: "linked" | "unlinked") => {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (tab === "unlinked") params.set("tab", tab);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const billDetailHref = (billId: number, returnTo: string) =>
  `/finance/vendor-bills?billId=${encodeURIComponent(String(billId))}&returnTo=${encodeURIComponent(returnTo)}`;

function summarizeUnlinked(report: PayablesReport) {
  return summarizeBillReview(report.unlinkedGroups.flatMap(group => group.amounts));
}

const humanStatus = (value?: string | null) => {
  if (!value) return "Unknown";
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function StatusTag({ status }: { status?: string | null }) {
  const key = String(status || "").toLowerCase();
  const tone = key === "paid"
    ? "bg-teal-50 text-teal-800 border-teal-200"
    : key === "approved"
      ? "bg-blue-50 text-blue-800 border-blue-200"
      : key === "verified"
        ? "bg-indigo-50 text-indigo-800 border-indigo-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{humanStatus(status)}</span>;
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100dvh-3.5rem)] bg-[#f2f5f3] text-[#192c2d]">
    <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">{children}</div>
  </div>;
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#67807d]">{children}</p>;
}

function AmountCell({ children, emphasized = false, className = "" }: { children: React.ReactNode; emphasized?: boolean; className?: string }) {
  return <td className={`whitespace-nowrap px-2 py-3 text-right font-mono text-[12px] tabular-nums ${emphasized ? "font-bold text-[#183f3a]" : "text-[#405755]"} ${className}`}>{children}</td>;
}

function LoadingView() {
  return <PageFrame>
    <div className="animate-pulse space-y-6" aria-label="Loading payables report">
      <div className="h-7 w-56 rounded bg-[#dfe8e4]" />
      <div className="h-24 rounded-xl border border-[#dce5e1] bg-[#e7eeea]" />
      <div className="h-12 rounded-lg bg-[#e2eae6]" />
      <div className="h-80 rounded-xl border border-[#dce5e1] bg-[#e7eeea]" />
    </div>
  </PageFrame>;
}

function EmptyNotice({ title, detail }: { title: string; detail: string }) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[#d6e3de] bg-[#eef4f0] text-[#55716a]"><ReceiptText className="h-5 w-5" /></div>
    <h3 className="text-sm font-bold text-[#29413d]">{title}</h3>
    <p className="mt-1 max-w-md text-sm leading-6 text-[#72837f]">{detail}</p>
  </div>;
}

function DownloadButton({ onClick, label = "Export Excel" }: { onClick: () => void; label?: string }) {
  return <button onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#cbd9d3] bg-[#fbfdfb] px-3 text-xs font-semibold text-[#38534d] transition-colors hover:bg-[#eaf2ed]">
    <FileSpreadsheet className="h-4 w-4" />{label}
  </button>;
}

function DateRangeControls({ dateFrom, dateTo, setDateFrom, setDateTo }: {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
}) {
  return <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#d5e0db] bg-[#f9fbf9] px-4 py-3">
    <div className="flex items-center gap-2 self-center pr-1 text-xs font-bold uppercase tracking-wide text-[#627974]"><CalendarDays className="h-4 w-4" />Bill period</div>
    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#748782]">
      From <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-9 rounded-md border border-[#cbd9d3] bg-white px-2 text-xs font-medium text-[#29413d] outline-none focus:border-[#527c70]" />
    </label>
    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#748782]">
      To <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-9 rounded-md border border-[#cbd9d3] bg-white px-2 text-xs font-medium text-[#29413d] outline-none focus:border-[#527c70]" />
    </label>
    {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="h-9 px-2 text-xs font-semibold text-[#537168] hover:text-[#213f38]">Clear</button>}
  </div>;
}

function exportSummary(report: PayablesReport) {
  const hasCreditColumn = report.vendors.some((vendor) => vendor.credits > 0);
  const unlinkedTotals = summarizeUnlinked(report);
  const linkedRows = report.vendors.map((vendor) => ({
    Vendor: vendor.vendorName,
    Bills: vendor.count,
    Billed: vendor.billed,
    Paid: vendor.paid,
    "Payable now": vendor.payableNow,
    "Coming up": vendor.comingUp,
    "Total liability": vendor.totalLiability,
    ...(hasCreditColumn ? { Credit: vendor.credits > 0 ? vendor.credits : "—" } : {}),
    "Oldest unpaid": dateLabel(vendor.oldestUnpaid),
    "Payment unknown": vendor.unknownPayments > 0 ? `${vendor.unknownPayments} unknown; estimate` : "",
  }));
  linkedRows.push({
    Vendor: "TOTAL — LINKED VENDORS",
    Bills: report.totals.count,
    Billed: report.totals.billed,
    Paid: report.totals.paid,
    "Payable now": report.totals.payableNow,
    "Coming up": report.totals.comingUp,
    "Total liability": report.totals.totalLiability,
    ...(hasCreditColumn ? { Credit: report.totals.credits > 0 ? report.totals.credits : "—" } : {}),
    "Oldest unpaid": dateLabel(report.totals.oldestUnpaid),
    "Payment unknown": report.totals.unknownPayments > 0 ? `${report.totals.unknownPayments} unknown; estimate` : "",
  });
  const unlinkedRows = report.unlinkedGroups.flatMap((group) => group.bills.map((bill, index) => {
    const amount = group.amounts[index];
    return {
      "Typed vendor name": group.typedName || "(blank name)",
      "Bill count": "",
      "Bill number": bill.billNo || `Bill #${bill.id}`,
      "Bill date": bill.billDate ?? "",
      Status: bill.status ?? "",
      Net: amount.net,
      Paid: amount.paid ?? "Unknown",
      Balance: amount.balance ?? "Estimate",
      Note: "Unlinked — excluded from linked-vendor totals until linked",
    };
  }));
  const unlinkedSheetRows = [{
    "Typed vendor name": "TOTAL — UNLINKED BILLS",
    "Bill count": unlinkedTotals.count,
    "Bill number": "",
    "Bill date": "",
    Status: "",
    Net: unlinkedTotals.net,
    Paid: unlinkedTotals.paid,
    Balance: unlinkedTotals.net - unlinkedTotals.paid,
    Note: unlinkedTotals.unknownPayments > 0
      ? `Estimate · ${unlinkedTotals.unknownPayments} payment unknown`
      : "Unlinked — excluded from linked-vendor totals",
  }, ...unlinkedRows];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(linkedRows), "Linked summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unlinkedSheetRows), "Unlinked bills");
  XLSX.writeFile(workbook, "vendor-payables.xlsx");
}

function exportLedger(lines: ReturnType<typeof projectVendorLedger>, name: string) {
  const rows = lines.map(({ bill, amounts, runningBalance, runningBalanceEstimated }) => ({
    "Bill date": bill.billDate ?? "",
    "Bill number": bill.billNo || `Bill #${bill.id}`,
    "Bill period": periodLabel(bill.periodFrom, bill.periodTo),
    Status: humanStatus(bill.status),
    Net: amounts.net,
    Paid: amounts.paid ?? "Unknown",
    Balance: amounts.balance ?? "Estimate",
    "Running balance": runningBalance,
    "Running balance estimated": runningBalanceEstimated ? "Yes" : "No",
    "Provisional bill": amounts.provisional ? "Yes" : "No",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Vendor ledger");
  XLSX.writeFile(workbook, `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "vendor"}-ledger.xlsx`);
}

function payablesTotalsMatch(a: PayablesReport["vendors"][number] | null | undefined, b: PayablesReport["vendors"][number] | null | undefined) {
  if (!a || !b) return false;
  const moneyFields: (keyof PayablesReport["vendors"][number])[] = ["billed", "paid", "payableNow", "comingUp", "totalLiability", "credits"];
  return a.count === b.count &&
    a.unknownPayments === b.unknownPayments &&
    a.oldestUnpaid === b.oldestUnpaid &&
    moneyFields.every(field => Math.abs(Number(a[field]) - Number(b[field])) < 0.005);
}

export default function VendorPayables() {
  const { user, sectionVisible, sectionCan } = useAuth();
  const [location] = useLocation();
  const [dateFrom, setDateFrom] = useState(() => new URLSearchParams(window.location.search).get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => new URLSearchParams(window.location.search).get("dateTo") || "");
  const [activeTab, setActiveTab] = useState<"linked" | "unlinked">(() =>
    new URLSearchParams(window.location.search).get("tab") === "unlinked" ? "unlinked" : "linked"
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDateFrom(params.get("dateFrom") || "");
    setDateTo(params.get("dateTo") || "");
    setActiveTab(params.get("tab") === "unlinked" ? "unlinked" : "linked");
  }, [location]);
  const canViewBills = sectionVisible("vendor_bills") || sectionVisible("vendor_bills_view");
  const canViewFinancials = sectionCan("vendor_financials", "view");
  const authorized = canViewBills && canViewFinancials;

  const financialReview = useQuery<VendorBill[]>({
    queryKey: ["/api/vendor-bills", "financial-review", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/vendor-bills/financial-review", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Financial information is not available.");
      return response.json();
    },
    enabled: authorized,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const report = useMemo(() => projectVendorPayables(financialReview.data ?? [], { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }), [financialReview.data, dateFrom, dateTo]);
  const vendorRoute = location.match(/^\/reports\/vendor-payables\/vendor\/([^/?]+)/);
  const unlinkedRoute = location.match(/^\/reports\/vendor-payables\/unlinked\/([^/?]+)/);
  const vendorId = vendorRoute ? Number(decodeURIComponent(vendorRoute[1])) : null;
  const billId = unlinkedRoute ? Number(decodeURIComponent(unlinkedRoute[1])) : null;
  const isLedger = vendorId != null || billId != null;
  const currentVendor = vendorId != null
    ? report.vendors.find((vendor) => Number(vendor.vendorId) === vendorId) ?? (financialReview.data ?? []).find((bill) => Number(bill.vendorId) === vendorId)
    : billId != null ? (financialReview.data ?? []).find((bill) => Number(bill.id) === billId && bill.vendorId == null) : null;
  const ledgerLines = useMemo(() => currentVendor ? projectVendorLedger(currentVendor, report.filteredBills) : [], [currentVendor, report.filteredBills]);
  const ledgerSummary = vendorId != null ? report.vendors.find((vendor) => Number(vendor.vendorId) === vendorId) : null;
  const ledgerProjectionRow = useMemo(() => vendorId == null || ledgerLines.length === 0
    ? null
    : projectVendorPayables(ledgerLines.map(line => line.bill)).vendors.find(vendor => vendor.vendorId === vendorId) ?? null,
  [ledgerLines, vendorId]);
  const ledgerName = vendorId != null
    ? (ledgerSummary?.vendorName ?? (currentVendor as VendorBill | undefined)?.linkedVendorName ?? `Vendor #${vendorId}`)
    : ((currentVendor as VendorBill | undefined)?.vendorName || "(blank vendor name)");

  if (financialReview.isLoading && authorized) {
    return <HubShell title="Vendor payables" subtitle="Financial review · read only" backHref="/reports/hub" backLabel="Reports"><LoadingView /></HubShell>;
  }

  return <HubShell title="Vendor payables" subtitle="Financial review · read only" backHref="/reports/hub" backLabel="Reports">
    <PageFrame>
      {!authorized ? (
        <div className="mx-auto max-w-2xl rounded-xl border border-[#e3c9a7] bg-[#fffaf1] p-7">
          <SectionEyebrow>Restricted financial report</SectionEyebrow>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-[#493a29]">Access is not available</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[#75634d]">Vendor payables requires both vendor bill viewing and vendor financials viewing access. Ask an administrator to review your permissions.</p>
        </div>
      ) : financialReview.isError ? (
        <div className="mx-auto max-w-2xl rounded-xl border border-[#e7c5bc] bg-[#fff8f5] p-7">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-[#a9553d]" /><div>
            <SectionEyebrow>Report unavailable</SectionEyebrow>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-[#56362e]">Financial review could not be loaded</h2>
            <p className="mt-2 text-sm leading-6 text-[#80665d]">The report has not been changed. Try again when the connection is available.</p>
            <button onClick={() => void financialReview.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#315e55] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#244b44]"><RotateCcw className="h-4 w-4" />Retry</button>
          </div></div>
        </div>
      ) : isLedger ? (
        <LedgerView
          current={currentVendor as VendorBill | undefined}
          lines={ledgerLines}
          vendorId={vendorId}
          vendorName={ledgerName}
          summary={ledgerSummary ?? null}
          consistencyError={ledgerSummary != null && !payablesTotalsMatch(ledgerSummary, ledgerProjectionRow)}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          returnTo={withDateRange(vendorId != null
            ? `/reports/vendor-payables/vendor/${vendorId}`
            : `/reports/vendor-payables/unlinked/${billId}`, dateFrom, dateTo)}
          onExport={() => exportLedger(ledgerLines, ledgerName)}
        />
      ) : (
        <SummaryView
          report={report}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      )}
    </PageFrame>
  </HubShell>;
}

function SummaryView({ report, dateFrom, dateTo, setDateFrom, setDateTo, activeTab, setActiveTab }: {
  report: PayablesReport;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  activeTab: "linked" | "unlinked";
  setActiveTab: (tab: "linked" | "unlinked") => void;
}) {
  const unlinkedTotals = summarizeUnlinked(report);
  const hasCreditColumn = report.vendors.some((vendor) => vendor.credits > 0);
  const linkedTabHref = withPayablesTab("/reports/vendor-payables", dateFrom, dateTo, "linked");
  const unlinkedTabHref = withPayablesTab("/reports/vendor-payables", dateFrom, dateTo, "unlinked");
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 border-b border-[#d4dfda] pb-5 sm:flex-row sm:items-end">
      <div>
        <SectionEyebrow>Finance / exposure review</SectionEyebrow>
        <h1 className="mt-1 text-[26px] font-bold tracking-[-0.035em] text-[#18312e] sm:text-[32px]">Vendor payables</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#677c77]">Linked vendor liabilities, grouped by confirmed identity. All figures are read-only.</p>
      </div>
      <DownloadButton onClick={() => exportSummary(report)} />
    </div>

    <div role="tablist" aria-label="Vendor payables views" className="flex gap-2 border-b border-[#d4dfda]">
      <Link
        href={linkedTabHref}
        role="tab"
        aria-selected={activeTab === "linked"}
        onClick={() => setActiveTab("linked")}
        className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${activeTab === "linked" ? "border-[#315e55] text-[#244b44]" : "border-transparent text-[#71817a] hover:text-[#315e55]"}`}
      >Linked vendors</Link>
      <Link
        href={unlinkedTabHref}
        role="tab"
        aria-selected={activeTab === "unlinked"}
        onClick={() => setActiveTab("unlinked")}
        className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${activeTab === "unlinked" ? "border-[#315e55] text-[#244b44]" : "border-transparent text-[#71817a] hover:text-[#315e55]"}`}
      >Unlinked bills</Link>
    </div>

    {activeTab === "linked" ? <>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#d5e0db] bg-[#d5e0db] sm:grid-cols-4">
        <Metric label="Linked vendors" value={String(report.vendors.length)} detail={`${report.totals.count} bills`} />
        <Metric label="Payable now" value={money(report.totals.payableNow)} detail="Approved · known balance" />
        <Metric label="Coming up" value={money(report.totals.comingUp)} detail="Provisional bill balances" />
        <Metric label="Total liability" value={money(report.totals.totalLiability)} detail="Excludes unlinked bills" dark />
      </div>
      <DateRangeControls dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
    </div>

    {report.totals.unknownPayments > 0 && <div className="flex gap-3 rounded-lg border border-[#e6d8b5] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#725d30]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p><strong>{report.totals.unknownPayments} payment record{report.totals.unknownPayments === 1 ? "" : "s"} unknown.</strong> Paid figures and affected balances are estimates where payment information has not been recorded.</p>
    </div>}

    {unlinkedTotals.count > 0 && <div className="rounded-lg border border-[#e3d7bd] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#766443]">
      <span className="font-semibold">{unlinkedTotals.count} unlinked bill{unlinkedTotals.count === 1 ? "" : "s"} · {unlinkedTotals.unknownPayments > 0 ? "estimated " : ""}{money(unlinkedTotals.net - unlinkedTotals.paid)} balance</span>
      <span> — not included in the totals above. </span>
      <Link href={unlinkedTabHref} onClick={() => setActiveTab("unlinked")} className="font-semibold text-[#6e6043] underline underline-offset-2 hover:text-[#483d2a]">Review unlinked bills</Link>
      {unlinkedTotals.unknownPayments > 0 && <span className="ml-1">Estimate · {unlinkedTotals.unknownPayments} payment unknown</span>}
    </div>}

    <section className="overflow-hidden rounded-xl border border-[#d2ded8] bg-[#fbfcfb] shadow-[0_8px_24px_rgba(29,58,50,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#dbe4df] px-5 py-4">
        <div><SectionEyebrow>Confirmed identities</SectionEyebrow><h2 className="mt-1 text-base font-bold text-[#213a36]">Linked-vendor summary</h2></div>
        <span className="rounded-md bg-[#edf3ef] px-2.5 py-1 text-xs font-semibold text-[#506b63]">{report.vendors.length} vendors</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse lg:min-w-0">
          <colgroup>
            <col style={{ width: hasCreditColumn ? "20%" : "20%" }} />
            <col style={{ width: hasCreditColumn ? "5%" : "6%" }} />
            <col style={{ width: hasCreditColumn ? "11%" : "12%" }} />
            <col style={{ width: hasCreditColumn ? "10%" : "11%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: hasCreditColumn ? "14%" : "15%" }} />
            {hasCreditColumn && <col style={{ width: "7%" }} />}
            <col style={{ width: hasCreditColumn ? "9%" : "12%" }} />
          </colgroup>
          <thead><tr className="bg-[#f0f5f2] text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#6c817b]">
            <th className="sticky left-0 z-20 bg-[#f0f5f2] px-3 py-3">Vendor</th><th className="px-2 py-3 text-right">Bills</th><th className="px-2 py-3 text-right">Billed</th><th className="px-2 py-3 text-right">Paid</th><th className="px-2 py-3 text-right">Payable now</th><th className="px-2 py-3 text-right">Coming up</th><th className="bg-[#e4eee8] px-2 py-3 text-right text-[#294b40]">Total liability</th>{hasCreditColumn && <th className="px-2 py-3 text-right">Credit</th>}<th className="px-3 py-3">Oldest unpaid</th>
          </tr></thead>
          <tbody className="divide-y divide-[#e7ede9]">
            {report.vendors.length === 0
              ? <tr><td colSpan={hasCreditColumn ? 9 : 8}><EmptyNotice title="No linked bills in this date range" detail="Try widening the bill-period dates. Unlinked bills are in their own tab." /></td></tr>
              : report.vendors.map((vendor) => <tr key={vendor.vendorId} className="group transition-colors hover:bg-[#f5f9f6]">
                <td className="sticky left-0 z-10 max-w-0 bg-[#fbfcfb] px-3 py-3.5 group-hover:bg-[#f5f9f6]"><Link title={vendor.vendorName} href={withDateRange(`/reports/vendor-payables/vendor/${vendor.vendorId}`, dateFrom, dateTo)} className="block truncate font-semibold text-[#315d53] decoration-[#9db4a9] underline-offset-4 hover:underline">{vendor.vendorName}</Link>
                  {vendor.unknownPayments > 0 && <div className="mt-1 text-[10px] font-semibold text-[#967442]">Estimate · {vendor.unknownPayments} payment unknown</div>}
                </td>
                <td className="px-2 py-3 text-right font-mono text-xs tabular-nums text-[#526761]">{vendor.count}</td>
                <AmountCell>{money(vendor.billed)}</AmountCell><AmountCell>{money(vendor.paid)}</AmountCell><AmountCell emphasized>{money(vendor.payableNow)}</AmountCell><AmountCell>{money(vendor.comingUp)}</AmountCell><AmountCell emphasized className="bg-[#f0f6f2]">{money(vendor.totalLiability)}</AmountCell>
                {hasCreditColumn && <AmountCell>{vendor.credits > 0 ? money(vendor.credits) : "—"}</AmountCell>}
                <td title={dateLabel(vendor.oldestUnpaid)} className="px-3 py-3 text-xs text-[#526761]">{dateLabel(vendor.oldestUnpaid)}</td>
              </tr>)}
          </tbody>
          <tfoot><tr className="border-t-2 border-[#bdcec5] bg-[#eef4f0] text-xs font-bold text-[#29443d]">
            <td className="sticky left-0 z-10 bg-[#eef4f0] px-3 py-3.5">Linked totals</td><td className="px-2 py-3 text-right font-mono tabular-nums">{report.totals.count}</td><AmountCell emphasized>{money(report.totals.billed)}</AmountCell><AmountCell emphasized>{money(report.totals.paid)}</AmountCell><AmountCell emphasized>{money(report.totals.payableNow)}</AmountCell><AmountCell emphasized>{money(report.totals.comingUp)}</AmountCell><AmountCell emphasized className="bg-[#dfece5]">{money(report.totals.totalLiability)}</AmountCell>
            {hasCreditColumn && <AmountCell emphasized>{money(report.totals.credits)}</AmountCell>}<td className="px-3 py-3">{dateLabel(report.totals.oldestUnpaid)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div className="border-t border-[#e1e8e4] bg-[#f8faf8] px-5 py-3 text-[11px] leading-5 text-[#758680]">Payable now and Coming up are shown separately. Total liability is their combined exposure. Unlinked bills are never included in these totals.</div>
    </section>
    </> : <>
    {unlinkedTotals.unknownPayments > 0 && <div className="flex gap-3 rounded-lg border border-[#e6d8b5] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#725d30]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p><strong>{unlinkedTotals.unknownPayments} payment record{unlinkedTotals.unknownPayments === 1 ? "" : "s"} unknown.</strong> Paid figures and the estimated balance use only recorded payment amounts.</p>
    </div>}
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#d5e0db] bg-[#d5e0db] sm:grid-cols-4">
      <Metric label="Unlinked bills" value={String(unlinkedTotals.count)} detail={`${report.unlinkedGroups.length} typed names`} />
      <Metric label="Billed" value={money(unlinkedTotals.net)} detail="All unlinked bills" />
      <Metric label="Paid" value={money(unlinkedTotals.paid)} detail={unlinkedTotals.unknownPayments ? `Estimate · ${unlinkedTotals.unknownPayments} payment unknown` : "Recorded payments"} />
      <Metric label="Balance" value={money(unlinkedTotals.net - unlinkedTotals.paid)} detail={unlinkedTotals.unknownPayments ? "Estimated from recorded payments" : "Billed less paid"} dark />
    </div>
    <section className="overflow-hidden rounded-xl border border-[#ded9c9] bg-[#fcfbf7]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e1cf] px-5 py-4">
        <div><SectionEyebrow>Identity not confirmed</SectionEyebrow><h2 className="mt-1 text-base font-bold text-[#453e30]">Unlinked bills</h2><p className="mt-1 text-xs text-[#7e725c]">Excluded from linked-vendor totals. To link: Masters → Vendors → Link Vendors → Pending Links.</p></div>
        <span className="rounded-md bg-[#f4efdf] px-2.5 py-1 text-xs font-semibold text-[#79694b]">{unlinkedTotals.count} bills</span>
      </div>
      {report.unlinkedGroups.length === 0 ? <div className="px-5 py-7 text-sm text-[#7c8176]">No unlinked bills for this bill period.</div> : <div className="divide-y divide-[#ebe5d7]">
        {report.unlinkedGroups.map((group, index) => <div key={`${group.typedName}-${index}`} className="px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[#403c32]">{group.typedName || "(blank vendor name)"}</h3><span className="rounded border border-[#e2d4b4] bg-[#fbf4e5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#846c3e]">Unlinked</span><span className="text-xs text-[#8c8069]">{group.bills.length} bill{group.bills.length === 1 ? "" : "s"}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#8b8069]"><tr><th className="pb-2">Bill date</th><th className="pb-2">Bill number</th><th className="pb-2">Status</th><th className="pb-2 text-right">Net</th><th className="pb-2 text-right">Paid</th><th className="pb-2 text-right">Balance</th><th className="pb-2"></th></tr></thead>
              <tbody className="divide-y divide-[#eee9de]">{group.bills.map((bill, billIndex) => {
                const amounts = group.amounts[billIndex];
                return <tr key={bill.id}>
                  <td className="py-2.5 text-[#665e4e]">{dateLabel(bill.billDate)}</td><td className="py-2.5 font-semibold text-[#4b5149]">{bill.billNo || `Bill #${bill.id}`}</td><td className="py-2.5"><StatusTag status={bill.status} /></td><td className="py-2.5 text-right font-mono tabular-nums">{money(amounts.net)}</td><td className="py-2.5 text-right font-mono tabular-nums">{amounts.paid == null ? "Unknown" : money(amounts.paid)}</td><td className="py-2.5 text-right font-mono tabular-nums">{amounts.balance == null ? "Estimate" : money(amounts.balance)}</td><td className="py-2.5 text-right"><Link href={withDateRange(`/reports/vendor-payables/unlinked/${bill.id}`, dateFrom, dateTo)} className="font-semibold text-[#6e6043] hover:underline">Open ledger</Link></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>)}
      </div>}
    </section>
    </>}
  </div>;
}

function Metric({ label, value, detail, dark = false }: { label: string; value: string; detail: string; dark?: boolean }) {
  return <div className={`min-w-0 px-4 py-4 sm:px-5 ${dark ? "bg-[#254a42] text-[#f3f7f3]" : "bg-[#fbfcfb] text-[#213a36]"}`}>
    <p className={`text-[10px] font-bold uppercase tracking-[0.13em] ${dark ? "text-[#b7d1c5]" : "text-[#768a83]"}`}>{label}</p>
    <p className={`mt-2 truncate font-mono text-[17px] font-bold tracking-tight tabular-nums sm:text-[20px] ${dark ? "text-white" : "text-[#24463e]"}`}>{value}</p>
    <p className={`mt-1 truncate text-[10px] ${dark ? "text-[#cadbd2]" : "text-[#8a9993]"}`}>{detail}</p>
  </div>;
}

function LedgerView({ current, lines, vendorId, vendorName, summary, consistencyError, dateFrom, dateTo, setDateFrom, setDateTo, returnTo, onExport }: {
  current?: VendorBill;
  lines: ReturnType<typeof projectVendorLedger>;
  vendorId: number | null;
  vendorName: string;
  summary: PayablesReport["vendors"][number] | null;
  consistencyError: boolean;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  returnTo: string;
  onExport: () => void;
}) {
  const isUnlinked = vendorId == null;
  const ledgerNet = lines.reduce((sum, line) => sum + line.amounts.net, 0);
  const ledgerPaid = lines.reduce((sum, line) => sum + (line.amounts.paid ?? 0), 0);
  const ledgerBalance = lines.reduce((sum, line) => sum + (line.amounts.balance ?? 0), 0);
  const paymentUnknown = lines.filter((line) => line.amounts.paid == null).length;
  if (!current) return <div className="rounded-xl border border-[#d4dfda] bg-[#fbfcfb]"><EmptyNotice title={isUnlinked ? "Unlinked bill not found" : "Vendor ledger not found"} detail="This record is not present in the authorized financial review. Return to the payables summary to choose another record." /><div className="border-t border-[#e1e8e4] p-4 text-center"><Link href={withPayablesTab("/reports/vendor-payables", dateFrom, dateTo, isUnlinked ? "unlinked" : "linked")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#315d53] hover:underline"><ArrowLeft className="h-4 w-4" />Back to payables</Link></div></div>;

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 border-b border-[#d4dfda] pb-5 sm:flex-row sm:items-end">
      <div>
        <Link href={withPayablesTab("/reports/vendor-payables", dateFrom, dateTo, isUnlinked ? "unlinked" : "linked")} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#67807a] hover:text-[#29443d]"><ArrowLeft className="h-3.5 w-3.5" />All vendor payables</Link>
        <SectionEyebrow>{isUnlinked ? "Unlinked vendor ledger" : "Linked vendor ledger"}</SectionEyebrow>
        <h1 className="mt-1 text-[26px] font-bold tracking-[-0.035em] text-[#18312e] sm:text-[32px]">{vendorName}</h1>
        <p className="mt-1 text-sm text-[#677c77]">{isUnlinked ? "Exact typed bill name · separate from linked vendor identities" : "Complete bill-date-ordered record · all bill statuses"}</p>
      </div>
      <DownloadButton onClick={onExport} label="Export ledger" />
    </div>

    <DateRangeControls dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />

    {consistencyError && <div role="alert" className="rounded-lg border border-[#b75c4d] bg-[#fff4f1] px-4 py-3 text-xs leading-5 text-[#783b32]">
      Ledger totals do not match the payables summary for this date range. Both sets of figures are shown without adjustment.
    </div>}

    {isUnlinked && <div className="flex gap-3 rounded-lg border border-[#e3d7bd] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#766443]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Unlinked bill — excluded from linked-vendor totals.</strong> This ledger includes bills with the exact typed name only and does not combine them with a linked vendor.</p></div>}
    {paymentUnknown > 0 && <div className="flex gap-3 rounded-lg border border-[#e6d8b5] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#725d30]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>{paymentUnknown} bill{paymentUnknown === 1 ? "" : "s"} have unknown payment amounts.</strong> Paid, balance, and running balance figures are estimates where payment information is not recorded.</p></div>}

    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#d5e0db] bg-[#d5e0db] sm:grid-cols-4">
      <Metric label="Bills in ledger" value={String(lines.length)} detail="All statuses included" />
      <Metric label="Billed net" value={money(summary?.billed ?? ledgerNet)} detail="Net payable" />
      <Metric label="Paid" value={paymentUnknown ? `${money(summary?.paid ?? ledgerPaid)}*` : money(summary?.paid ?? ledgerPaid)} detail={paymentUnknown ? "*Estimated for unknown payments" : "Recorded payments"} />
      <Metric label="Total liability" value={money(summary?.totalLiability ?? ledgerBalance)} detail={summary ? "Matches linked summary row" : "Unlinked ledger only"} dark />
    </div>

    <section className="overflow-hidden rounded-xl border border-[#d2ded8] bg-[#fbfcfb] shadow-[0_8px_24px_rgba(29,58,50,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#dbe4df] px-5 py-4">
        <div><SectionEyebrow>Bill-date order · oldest first</SectionEyebrow><h2 className="mt-1 text-base font-bold text-[#213a36]">Bill ledger</h2></div>
        <span className="rounded-md bg-[#edf3ef] px-2.5 py-1 text-xs font-semibold text-[#506b63]">{lines.length} records</span>
      </div>
      {lines.length === 0 ? <EmptyNotice title="No bills in this ledger" detail="There are no bills for this vendor in the authorized review." /> : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse lg:min-w-0">
          <colgroup><col style={{ width: "9%" }} /><col style={{ width: "15%" }} /><col style={{ width: "16%" }} /><col style={{ width: "17%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "13%" }} /></colgroup>
          <thead><tr className="bg-[#f0f5f2] text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#6c817b]">
            <th className="px-2 py-3">Date</th><th className="px-2 py-3">Bill no.</th><th className="px-2 py-3">Bill period</th><th className="px-2 py-3">Status / review</th><th className="px-2 py-3 text-right">Net</th><th className="px-2 py-3 text-right">Paid</th><th className="px-2 py-3 text-right">Balance</th><th className="px-2 py-3 text-right">Running balance</th>
          </tr></thead>
          <tbody className="divide-y divide-[#e7ede9]">{lines.map(({ bill, amounts, runningBalance, runningBalanceEstimated }) => <tr key={bill.id} className="hover:bg-[#f7faf8]">
            <td className="whitespace-nowrap px-2 py-3.5 text-xs text-[#526761]">{dateLabel(bill.billDate)}</td>
            <td className="whitespace-nowrap px-2 py-3.5"><a href={billDetailHref(bill.id, returnTo)} className="font-semibold text-[#315d53] underline decoration-[#b5c8be] underline-offset-4 hover:text-[#173e35]">{bill.billNo || `Bill #${bill.id}`}</a></td>
            <td className="px-2 py-3.5 text-xs text-[#647771]">{periodLabel(bill.periodFrom, bill.periodTo)}</td>
            <td className="px-2 py-3"><div className="flex flex-wrap items-center gap-1.5"><StatusTag status={bill.status} />{amounts.provisional && <span className="rounded border border-[#e8d9b5] bg-[#fff9eb] px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-[#8a6d32]">Provisional</span>}{amounts.paid == null && <span className="rounded border border-[#e8d9b5] bg-[#fff9eb] px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-[#8a6d32]">Payment unknown</span>}</div></td>
            <AmountCell>{money(amounts.net)}</AmountCell><AmountCell>{amounts.paid == null ? "Estimate" : money(amounts.paid)}</AmountCell><AmountCell>{amounts.balance == null ? "Estimate" : money(amounts.balance)}</AmountCell><AmountCell emphasized>{runningBalanceEstimated ? `${money(runningBalance)}*` : money(runningBalance)}</AmountCell>
          </tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-[#bdcec5] bg-[#eef4f0] text-xs font-bold text-[#29443d]">
            <td className="px-5 py-3.5" colSpan={4}>Ledger totals</td><AmountCell emphasized>{money(summary?.billed ?? ledgerNet)}</AmountCell><AmountCell emphasized>{money(summary?.paid ?? ledgerPaid)}{paymentUnknown > 0 ? "*" : ""}</AmountCell><AmountCell emphasized>{money(ledgerBalance)}{paymentUnknown > 0 ? "*" : ""}</AmountCell><AmountCell emphasized>{lines.length ? `${money(lines[lines.length - 1].runningBalance)}${lines[lines.length - 1].runningBalanceEstimated ? "*" : ""}` : money(0)}</AmountCell>
          </tr></tfoot>
        </table>
      </div>}
      <div className="border-t border-[#e1e8e4] bg-[#f8faf8] px-5 py-3 text-[11px] leading-5 text-[#758680]">
        {summary ? <>Part A totals for this period: payable now {money(summary.payableNow)} · coming up {money(summary.comingUp)} · total liability {money(summary.totalLiability)}. These are the same linked-vendor totals as the summary row. Running balances follow bill date and recorded payments.</> : <>This exact-name unlinked ledger is excluded from linked-vendor totals. Running balances follow bill date and recorded payments.</>}
        {paymentUnknown > 0 && " An asterisk marks estimated amounts."}
      </div>
    </section>
  </div>;
}
