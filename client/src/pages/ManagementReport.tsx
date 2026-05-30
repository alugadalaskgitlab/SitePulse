import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Download, Loader2, Package, Factory, Fuel,
  Users, Receipt, Building2, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import type { Site } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";

// ── Types ────────────────────────────────────────────────────────────────────

interface MaterialRow {
  siteId: number | null; siteName: string; itemName: string;
  category: string; uom: string; qtyReceived: number; qtyIssued: number;
}
interface ProductionRow {
  siteName: string; plantName: string; type: string;
  mtProduced: number; dispatchCount: number; unit: string;
}
interface FuelRow {
  siteName: string; plantName: string;
  ldoConsumedL: number; mtProduced: number; lPerMt: number | null;
}
interface LabourRow {
  siteName: string; contractor: string; category: string; totalMandays: number;
}
interface FinancialsResponse {
  bills: { siteName: string; billCount: number; billValue: number; statuses: Record<string, number> }[];
  indents: { count: number; value: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, dp = 2) => n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: dp });
const fmtCur = (n: number) => `₹${fmt(n, 0)}`;

const TODAY = format(new Date(), "yyyy-MM-dd");
const MONTH_START = format(startOfMonth(new Date()), "yyyy-MM-dd");

// Quick presets
const PRESETS = [
  { label: "This Month", from: MONTH_START, to: TODAY },
  { label: "Last 7 Days", from: format(new Date(Date.now() - 6 * 86400000), "yyyy-MM-dd"), to: TODAY },
  { label: "Today", from: TODAY, to: TODAY },
];

// Build query string
function buildQS(dateFrom: string, dateTo: string, selectedSiteIds: number[]) {
  const p = new URLSearchParams();
  if (dateFrom) p.set("dateFrom", dateFrom);
  if (dateTo)   p.set("dateTo",   dateTo);
  if (selectedSiteIds.length) p.set("siteIds", selectedSiteIds.join(","));
  return p.toString();
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TotalsRow({ label, cells }: { label: string; cells: (string | number)[] }) {
  return (
    <TableRow className="font-semibold bg-muted/40 border-t-2 border-muted">
      <TableCell colSpan={1} className="text-foreground">{label}</TableCell>
      {cells.map((c, i) => (
        <TableCell key={i} className="text-right tabular-nums">{c}</TableCell>
      ))}
    </TableRow>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading…
    </div>
  );
  return <p className="text-center py-16 text-muted-foreground text-sm">No data for the selected filters.</p>;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ManagementReport() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [dateFrom, setDateFrom] = useState(MONTH_START);
  const [dateTo,   setDateTo]   = useState(TODAY);
  const [selectedSiteIds, setSelectedSiteIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState("materials");

  // Fetch all sites for the filter panel
  const { data: allSites = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const activeSites = useMemo(() => allSites.filter((s) => s.isActive !== 0), [allSites]);

  // Keep selected in sync when sites load (default = all)
  const allSiteIds = useMemo(() => activeSites.map((s) => s.id), [activeSites]);
  const effectiveSelected = selectedSiteIds.length > 0 ? selectedSiteIds : allSiteIds;

  const qs = buildQS(dateFrom, dateTo, effectiveSelected);

  // ── Data queries (lazy — only active tab) ───────────────────────────────
  const { data: materialsData, isFetching: matLoading } = useQuery<MaterialRow[]>({
    queryKey: [`/api/admin/management-report/materials?${qs}`],
    enabled: activeTab === "materials" && !!qs,
  });
  const { data: productionData, isFetching: prodLoading } = useQuery<ProductionRow[]>({
    queryKey: [`/api/admin/management-report/production?${qs}`],
    enabled: activeTab === "production" && !!qs,
  });
  const { data: fuelData, isFetching: fuelLoading } = useQuery<FuelRow[]>({
    queryKey: [`/api/admin/management-report/fuel?${qs}`],
    enabled: activeTab === "fuel" && !!qs,
  });
  const { data: labourData, isFetching: labLoading } = useQuery<LabourRow[]>({
    queryKey: [`/api/admin/management-report/labour?${qs}`],
    enabled: activeTab === "labour" && !!qs,
  });
  const { data: financialsData, isFetching: finLoading } = useQuery<FinancialsResponse>({
    queryKey: [`/api/admin/management-report/financials?${qs}`],
    enabled: activeTab === "financials" && !!qs,
  });

  // ── Site selector helpers ────────────────────────────────────────────────
  const allSelected = effectiveSelected.length === allSiteIds.length;

  const toggleAllSites = () => {
    setSelectedSiteIds(allSelected ? [] : [...allSiteIds]);
  };

  const toggleSite = (id: number) => {
    setSelectedSiteIds((prev) => {
      const base = prev.length === 0 ? allSiteIds : prev;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  const isSiteChecked = (id: number) => effectiveSelected.includes(id);

  // ── Excel export ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    try {
      let ws: XLSX.WorkSheet;
      let sheetName: string;

      if (activeTab === "materials" && materialsData) {
        sheetName = "Materials";
        ws = XLSX.utils.json_to_sheet(materialsData.map((r) => ({
          Site: r.siteName, Item: r.itemName, Category: r.category, UOM: r.uom,
          "Qty Received (GRN)": r.qtyReceived, "Qty Issued": r.qtyIssued,
          "Closing Stock": r.qtyReceived - r.qtyIssued,
        })));
      } else if (activeTab === "production" && productionData) {
        sheetName = "Production";
        ws = XLSX.utils.json_to_sheet(productionData.map((r) => ({
          Site: r.siteName, Plant: r.plantName, Type: r.type,
          "Produced": r.mtProduced, Unit: r.unit, "No. Dispatches": r.dispatchCount,
        })));
      } else if (activeTab === "fuel" && fuelData) {
        sheetName = "Fuel";
        ws = XLSX.utils.json_to_sheet(fuelData.map((r) => ({
          Site: r.siteName, Plant: r.plantName,
          "LDO Consumed (L)": r.ldoConsumedL, "MT Produced": r.mtProduced,
          "L/MT Ratio": r.lPerMt ?? "",
        })));
      } else if (activeTab === "labour" && labourData) {
        sheetName = "Labour";
        ws = XLSX.utils.json_to_sheet(labourData.map((r) => ({
          Site: r.siteName, Contractor: r.contractor, Category: r.category,
          "Total Mandays": r.totalMandays,
        })));
      } else if (activeTab === "financials" && financialsData) {
        sheetName = "Financials";
        const rows = financialsData.bills.map((r) => ({
          Site: r.siteName, "Bill Count": r.billCount, "Bill Value (₹)": r.billValue,
        }));
        ws = XLSX.utils.json_to_sheet(rows);
      } else {
        toast({ title: "No data to export", variant: "destructive" });
        return;
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `management-report-${activeTab}-${dateFrom}-${dateTo}.xlsx`);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  }, [activeTab, materialsData, productionData, fuelData, labourData, financialsData, dateFrom, dateTo, toast]);

  // ── Materials tab summaries ──────────────────────────────────────────────
  const matBySite = useMemo(() => {
    if (!materialsData) return [];
    const map = new Map<string, { siteName: string; qtyReceived: number; qtyIssued: number }>();
    for (const r of materialsData) {
      const e = map.get(r.siteName) ?? { siteName: r.siteName, qtyReceived: 0, qtyIssued: 0 };
      e.qtyReceived += r.qtyReceived;
      e.qtyIssued   += r.qtyIssued;
      map.set(r.siteName, e);
    }
    return Array.from(map.values());
  }, [materialsData]);

  const matTotals = useMemo(() => matBySite.reduce(
    (a, r) => ({ qtyReceived: a.qtyReceived + r.qtyReceived, qtyIssued: a.qtyIssued + r.qtyIssued }),
    { qtyReceived: 0, qtyIssued: 0 }
  ), [matBySite]);

  const prodTotals = useMemo(() => (productionData ?? []).reduce(
    (a, r) => ({ mt: a.mt + r.mtProduced, dis: a.dis + r.dispatchCount }),
    { mt: 0, dis: 0 }
  ), [productionData]);

  const labTotals = useMemo(() => (labourData ?? []).reduce((a, r) => a + r.totalMandays, 0), [labourData]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/admin/reports">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="btn-back">
            <ChevronLeft className="h-4 w-4" /> Reports
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Management Report</h1>
          <p className="text-xs text-muted-foreground">Cross-site aggregated view</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={handleExport}
          data-testid="btn-export"
        >
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        {/* Filter bar */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-end gap-6">
              {/* Date range */}
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 w-36 text-sm" data-testid="input-date-from" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 w-36 text-sm" data-testid="input-date-to" />
                </div>
              </div>

              {/* Presets */}
              <div className="flex gap-1.5">
                {PRESETS.map((p) => (
                  <Button key={p.label} size="sm" variant="outline"
                    className="h-8 text-xs px-2.5"
                    onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}
                    data-testid={`btn-preset-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              {/* Sites */}
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs text-muted-foreground block mb-1.5">
                  Sites / Projects
                </Label>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="all-sites"
                      checked={allSelected}
                      onCheckedChange={toggleAllSites}
                      data-testid="checkbox-all-sites"
                    />
                    <label htmlFor="all-sites" className="text-sm font-medium cursor-pointer select-none">
                      All
                    </label>
                  </div>
                  {activeSites.map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`site-${s.id}`}
                        checked={isSiteChecked(s.id)}
                        onCheckedChange={() => toggleSite(s.id)}
                        data-testid={`checkbox-site-${s.id}`}
                      />
                      <label htmlFor={`site-${s.id}`} className="text-sm cursor-pointer select-none">
                        {s.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 h-auto">
            <TabsTrigger value="materials"  className="gap-1.5 text-xs py-2" data-testid="tab-materials">
              <Package className="h-3.5 w-3.5" /> Materials
            </TabsTrigger>
            <TabsTrigger value="production" className="gap-1.5 text-xs py-2" data-testid="tab-production">
              <Factory className="h-3.5 w-3.5" /> Production
            </TabsTrigger>
            <TabsTrigger value="fuel"       className="gap-1.5 text-xs py-2" data-testid="tab-fuel">
              <Fuel className="h-3.5 w-3.5" /> Fuel &amp; LDO
            </TabsTrigger>
            <TabsTrigger value="labour"     className="gap-1.5 text-xs py-2" data-testid="tab-labour">
              <Users className="h-3.5 w-3.5" /> Labour
            </TabsTrigger>
            <TabsTrigger value="financials" className="gap-1.5 text-xs py-2" data-testid="tab-financials">
              <Receipt className="h-3.5 w-3.5" /> Financials
            </TabsTrigger>
          </TabsList>

          {/* ── Materials ── */}
          <TabsContent value="materials" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Materials Consumption
                  {materialsData && <Badge variant="secondary" className="ml-auto">{materialsData.length} items</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {matLoading || !materialsData ? (
                  <EmptyState loading={matLoading} />
                ) : materialsData.length === 0 ? (
                  <EmptyState loading={false} />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Site</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Qty Received</TableHead>
                          <TableHead className="text-right">Qty Issued</TableHead>
                          <TableHead className="text-right">Closing Stock</TableHead>
                          <TableHead>Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materialsData.map((r, i) => (
                          <TableRow key={i} className="text-sm" data-testid={`row-material-${i}`}>
                            <TableCell className="font-medium text-xs text-muted-foreground">{r.siteName}</TableCell>
                            <TableCell>{r.itemName}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{r.category}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(r.qtyReceived)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(r.qtyIssued)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(r.qtyReceived - r.qtyIssued)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.uom}</TableCell>
                          </TableRow>
                        ))}
                        {/* Per-site totals */}
                        {matBySite.map((s, i) => (
                          <TableRow key={`st-${i}`} className="bg-amber-50/40 dark:bg-amber-950/20 text-xs font-semibold" data-testid={`row-site-total-${i}`}>
                            <TableCell colSpan={3} className="text-amber-700 dark:text-amber-400">↳ {s.siteName} subtotal</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s.qtyReceived)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s.qtyIssued)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s.qtyReceived - s.qtyIssued)}</TableCell>
                            <TableCell />
                          </TableRow>
                        ))}
                        <TotalsRow label="Grand Total"
                          cells={[fmt(matTotals.qtyReceived), fmt(matTotals.qtyIssued), fmt(matTotals.qtyReceived - matTotals.qtyIssued), ""]}
                        />
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Production ── */}
          <TabsContent value="production" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Factory className="h-4 w-4 text-muted-foreground" />
                  Plant Production
                  {productionData && <Badge variant="secondary" className="ml-auto">{productionData.length} plants</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {prodLoading || !productionData ? (
                  <EmptyState loading={prodLoading} />
                ) : productionData.length === 0 ? (
                  <EmptyState loading={false} />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Site</TableHead>
                          <TableHead>Plant</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Produced</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right">Dispatches</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productionData.map((r, i) => (
                          <TableRow key={i} className="text-sm" data-testid={`row-prod-${i}`}>
                            <TableCell className="text-xs text-muted-foreground font-medium">{r.siteName}</TableCell>
                            <TableCell>{r.plantName}</TableCell>
                            <TableCell>
                              <Badge variant={r.type === "HMP" ? "default" : "secondary"} className="text-xs">{r.type}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(r.mtProduced)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.unit}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.dispatchCount}</TableCell>
                          </TableRow>
                        ))}
                        <TotalsRow label="Grand Total"
                          cells={[fmt(prodTotals.mt), "", prodTotals.dis]}
                        />
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Fuel & LDO ── */}
          <TabsContent value="fuel" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                  Fuel &amp; LDO Summary
                  {fuelData && <Badge variant="secondary" className="ml-auto">{fuelData.length} plants</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {fuelLoading || !fuelData ? (
                  <EmptyState loading={fuelLoading} />
                ) : fuelData.length === 0 ? (
                  <EmptyState loading={false} />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Site / Plant</TableHead>
                          <TableHead>Plant</TableHead>
                          <TableHead className="text-right">LDO Consumed (L)</TableHead>
                          <TableHead className="text-right">MT Produced</TableHead>
                          <TableHead className="text-right">L/MT Ratio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fuelData.map((r, i) => (
                          <TableRow key={i} className="text-sm" data-testid={`row-fuel-${i}`}>
                            <TableCell className="text-xs text-muted-foreground font-medium">{r.siteName}</TableCell>
                            <TableCell>{r.plantName}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(r.ldoConsumedL)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(r.mtProduced)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.lPerMt !== null ? (
                                <span className={r.lPerMt > 10 ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                                  {r.lPerMt}
                                </span>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TotalsRow label="Total"
                          cells={[
                            fmt(fuelData.reduce((a, r) => a + r.ldoConsumedL, 0)),
                            fmt(fuelData.reduce((a, r) => a + r.mtProduced, 0)),
                            "",
                          ]}
                        />
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Labour ── */}
          <TabsContent value="labour" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Labour / Mandays
                  {labourData && (
                    <Badge variant="secondary" className="ml-auto">
                      {labTotals} total mandays
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {labLoading || !labourData ? (
                  <EmptyState loading={labLoading} />
                ) : labourData.length === 0 ? (
                  <EmptyState loading={false} />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Site</TableHead>
                          <TableHead>Contractor</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Total Mandays</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {labourData.map((r, i) => (
                          <TableRow key={i} className="text-sm" data-testid={`row-labour-${i}`}>
                            <TableCell className="text-xs text-muted-foreground font-medium">{r.siteName}</TableCell>
                            <TableCell>{r.contractor}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{r.category}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{r.totalMandays}</TableCell>
                          </TableRow>
                        ))}
                        <TotalsRow label="Grand Total" cells={[labTotals, ""]} />
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Financials ── */}
          <TabsContent value="financials" className="mt-4">
            <div className="space-y-4">
              {/* Vendor Bills */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    Vendor Bills by Site
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {finLoading || !financialsData ? (
                    <EmptyState loading={finLoading} />
                  ) : financialsData.bills.length === 0 ? (
                    <EmptyState loading={false} />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Site</TableHead>
                            <TableHead className="text-right">Bills Raised</TableHead>
                            <TableHead className="text-right">Total Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {financialsData.bills.map((r, i) => (
                            <TableRow key={i} className="text-sm" data-testid={`row-bills-${i}`}>
                              <TableCell className="font-medium">{r.siteName}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.billCount}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmtCur(r.billValue)}</TableCell>
                            </TableRow>
                          ))}
                          <TotalsRow label="Total"
                            cells={[
                              financialsData.bills.reduce((a, r) => a + r.billCount, 0),
                              fmtCur(financialsData.bills.reduce((a, r) => a + r.billValue, 0)),
                            ]}
                          />
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Purchase Indents summary */}
              {financialsData && (
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-4">
                      <Building2 className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Purchase Indents (all sites, date range)</p>
                        <p className="text-2xl font-bold tabular-nums">{financialsData.indents.count}</p>
                        <p className="text-sm text-muted-foreground">
                          Est. value: <span className="font-semibold text-foreground">{fmtCur(financialsData.indents.value)}</span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
