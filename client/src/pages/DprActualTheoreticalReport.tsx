import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportExportGate } from "@/components/ReportExportGate";

type ProjectOption = { id: number; name: string };
type ReportRow = {
  boqItemId: number;
  itemCode: string | null;
  itemName: string;
  unit: string | null;
  equipmentType: string;
  plannedHours: number | null;
  usedHours: number | null;
  balanceHours: number | null;
  balanceStatus: string;
  actualRecordCount: number;
  stretchDetails: Array<{ programmeBarId: number | null; label: string; hours: number }>;
  incomplete: boolean;
};
type Gap = {
  count: number | null;
  unit: string;
  status: string;
  note: string;
  unlinkedDieselLogCount?: number;
};
type ReportData = {
  project: { id: number; name: string; startDate: string | null; site: string | null };
  period: { from: string; to: string };
  equipmentRows: ReportRow[];
  dieselComparison: {
    rows: Array<{
      equipmentName: string;
      planned: number;
      purchased: number;
      actual: number;
      gapFlag: boolean;
    }>;
    totals: { planned: number; purchased: number; actual: number };
  };
  incompleteAttribution: {
    bituminousDispatches: Gap;
    arrangementOwnedDiesel: Gap;
    aggregateCompactionProfiles: Gap;
    equipmentHours: { unlinkedLogCount: number; unlinkedHours: number; status: string };
    itemsWithoutEquipmentRecipe: number;
    plannedRowsWithoutMonthPhasing: number;
  };
  notes: string[];
};

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = localDate(new Date());
const monthStart = `${today.slice(0, 7)}-01`;
const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null ? "—" : Number(value.toFixed(digits)).toLocaleString("en-IN");
const gapDisplay = (gap: Gap) => gap.count == null ? "Unavailable" : formatNumber(gap.count, 0);

export default function DprActualTheoreticalReport() {
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ["/api/boq/projects"],
  });
  const effectiveProjectId = projectId || (projects.length === 1 ? String(projects[0].id) : "");
  const reportUrl = useMemo(() => {
    if (!effectiveProjectId || !from || !to) return "";
    const params = new URLSearchParams({ projectId: effectiveProjectId, from, to });
    return `/api/reports/dpr-actual-vs-theoretical?${params.toString()}`;
  }, [effectiveProjectId, from, to]);
  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: [reportUrl],
    enabled: !!reportUrl && from <= to,
    retry: false,
  });

  const exportExcel = () => {
    if (!data) return;
    const equipmentRows = [
      ["Project", data.project.name],
      ["Site", data.project.site ?? "Unassigned site"],
      ["Period", `${data.period.from} to ${data.period.to}`],
      ["BOQ item", "Item name", "Equipment type", "Planned hours", "Used hours", "Balance hours", "Status", "Actual records", "Stretch / bar detail"],
      ...data.equipmentRows.map(row => [
        row.itemCode ?? `#${row.boqItemId}`,
        row.itemName,
        row.equipmentType,
        row.plannedHours ?? "INCOMPLETE — not phased",
        row.usedHours ?? "INCOMPLETE — no linked usage",
        row.balanceHours ?? "INCOMPLETE — balance unavailable",
        row.balanceStatus,
        row.actualRecordCount,
        row.stretchDetails.map(detail => `${detail.label}: ${formatNumber(detail.hours)} h`).join(" | ") || "No linked stretch detail",
      ]),
    ];
    const dieselRows = [
      ["Existing diesel comparison — equipment-level; not allocated to BOQ items"],
      ["Equipment", "Planned", "Purchased", "Actual", "Purchase gap flag"],
      ...data.dieselComparison.rows.map(row => [
        row.equipmentName, row.planned, row.purchased, row.actual, row.gapFlag ? "YES" : "No",
      ]),
      ["TOTAL", data.dieselComparison.totals.planned, data.dieselComparison.totals.purchased, data.dieselComparison.totals.actual, ""],
    ];
    const gaps = [
      ["Incomplete attribution", "Count", "Unit", "Status", "Scope / note"],
      ["Bituminous dispatches without BOQ / stretch links", gapDisplay(data.incompleteAttribution.bituminousDispatches), data.incompleteAttribution.bituminousDispatches.unit, data.incompleteAttribution.bituminousDispatches.status, data.incompleteAttribution.bituminousDispatches.note],
      ["Agency / mixed diesel-responsibility arrangements", gapDisplay(data.incompleteAttribution.arrangementOwnedDiesel), data.incompleteAttribution.arrangementOwnedDiesel.unit, data.incompleteAttribution.arrangementOwnedDiesel.status, `${data.incompleteAttribution.arrangementOwnedDiesel.note} Unlinked DPR diesel logs: ${data.incompleteAttribution.arrangementOwnedDiesel.unlinkedDieselLogCount ?? "unavailable"}.`],
      ["GSB/WMM trips missing compaction profile", gapDisplay(data.incompleteAttribution.aggregateCompactionProfiles), data.incompleteAttribution.aggregateCompactionProfiles.unit, data.incompleteAttribution.aggregateCompactionProfiles.status, data.incompleteAttribution.aggregateCompactionProfiles.note],
      ["Equipment logs with unattributed hours", data.incompleteAttribution.equipmentHours.unlinkedLogCount, "logs", data.incompleteAttribution.equipmentHours.status, `${formatNumber(data.incompleteAttribution.equipmentHours.unlinkedHours)} hours are not assigned to a BOQ item.`],
      ["Items with no equipment recipe", data.incompleteAttribution.itemsWithoutEquipmentRecipe, "BOQ items", "INCOMPLETE — no recipe", "Items included in planning with no equipment recipe."],
      ["Planned equipment rows without month phasing", data.incompleteAttribution.plannedRowsWithoutMonthPhasing, "rows", "INCOMPLETE — no dated schedule", "The existing BOM engine cannot assign these rows to the selected date range."],
    ];
    for (const note of data.notes) gaps.push(["Report note", "", "", "", note]);
    const workbook = XLSX.utils.book_new();
    const equipmentSheet = XLSX.utils.aoa_to_sheet(equipmentRows);
    equipmentSheet["!cols"] = [
      { wch: 16 }, { wch: 42 }, { wch: 28 }, { wch: 16 }, { wch: 16 },
      { wch: 16 }, { wch: 42 }, { wch: 15 }, { wch: 60 },
    ];
    const dieselSheet = XLSX.utils.aoa_to_sheet(dieselRows);
    dieselSheet["!cols"] = [{ wch: 45 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
    const gapSheet = XLSX.utils.aoa_to_sheet(gaps);
    gapSheet["!cols"] = [{ wch: 54 }, { wch: 18 }, { wch: 34 }, { wch: 54 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(workbook, equipmentSheet, "Equipment Hours");
    XLSX.utils.book_append_sheet(workbook, dieselSheet, "Diesel Comparison");
    XLSX.utils.book_append_sheet(workbook, gapSheet, "Incomplete Attribution");
    XLSX.writeFile(workbook, `dpr-actual-vs-theoretical-${data.period.from}-to-${data.period.to}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/reports/hub" className="text-sm text-muted-foreground hover:text-foreground">
            ← Reports & Analysis
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">DPR Actual vs Theoretical</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Equipment hours by BOQ item, with the existing equipment-level diesel comparison and explicit attribution gaps.
          </p>
        </div>
        {data && (
          <ReportExportGate sections={["site_dprs"]}>
            <ReportExportGate sections={["site_diesel", "stores_inventory", "diesel_req_view", "diesel_req_raise"]}>
              <Button variant="outline" onClick={exportExcel} className="gap-2">
                <Download className="h-4 w-4" /> Export Excel
              </Button>
            </ReportExportGate>
          </ReportExportGate>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">BOQ project</label>
            <Select value={effectiveProjectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">From</label>
            <Input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">To</label>
            <Input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground">
            Read-only. Planned hours use Work Programme BOM demand; actual hours require explicit BOQ/activity links.
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Unmatched records are shown as incomplete. No BOQ, plant, stretch, or arrangement links are guessed or created.
          Diesel comparison remains equipment-level and is not allocated to BOQ items.
        </p>
      </div>

      {!effectiveProjectId && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a BOQ project to view the report.</CardContent></Card>
      )}
      {from > to && (
        <Card><CardContent className="p-6 text-sm text-destructive">The start date must be on or before the end date.</CardContent></Card>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building read-only report…
        </div>
      )}
      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-5 text-sm text-destructive">
            {(error as Error).message || "Could not load the report. Check project and diesel report permissions."}
          </CardContent>
        </Card>
      )}
      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <GapCard title="Bituminous dispatches without BOQ / stretch links" gap={data.incompleteAttribution.bituminousDispatches} />
            <GapCard
              title="Arrangement-owned diesel attribution"
              gap={data.incompleteAttribution.arrangementOwnedDiesel}
              secondary={`DPR diesel logs without a direct BOQ-item link: ${data.incompleteAttribution.arrangementOwnedDiesel.unlinkedDieselLogCount ?? "unavailable"}`}
            />
            <GapCard title="GSB/WMM trips missing compaction profile" gap={data.incompleteAttribution.aggregateCompactionProfiles} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Equipment hours by BOQ item</CardTitle>
              <p className="text-sm text-muted-foreground">
                {data.project.name} · {data.project.site ?? "Unassigned site"} · {data.period.from} to {data.period.to}
              </p>
            </CardHeader>
            <CardContent>
              {data.equipmentRows.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No equipment recipes or linked equipment activity were found for this project and period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead className="border-b text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-3 pr-4">BOQ item</th>
                        <th className="py-3 pr-4">Machine type</th>
                        <th className="py-3 pr-4 text-right">Planned h</th>
                        <th className="py-3 pr-4 text-right">Used h</th>
                        <th className="py-3 pr-4 text-right">Balance h</th>
                        <th className="py-3 pr-4">Stretch actuals</th>
                        <th className="py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.equipmentRows.map((row, index) => (
                        <tr key={`${row.boqItemId}-${row.equipmentType}-${index}`} className="align-top">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{row.itemCode || `BOQ #${row.boqItemId}`}</div>
                            <div className="max-w-sm text-xs text-muted-foreground">{row.itemName}</div>
                          </td>
                          <td className="py-3 pr-4">{row.equipmentType}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{formatNumber(row.plannedHours)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{formatNumber(row.usedHours)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{formatNumber(row.balanceHours)}</td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">
                            {row.stretchDetails.length
                              ? row.stretchDetails.map(detail => (
                                  <div key={`${detail.programmeBarId ?? "none"}-${detail.label}`}>
                                    {detail.label}: {formatNumber(detail.hours)} h
                                  </div>
                                ))
                              : "No linked stretch detail"}
                          </td>
                          <td className="py-3">
                            <Badge variant={row.incomplete ? "outline" : "secondary"} className={row.incomplete ? "whitespace-normal border-amber-400 text-amber-800" : ""}>
                              {row.balanceStatus}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Planned demand is phased by programme month. This view prorates a selected date range within those month buckets; daily planned equipment hours are not stored.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Diesel comparison by equipment</CardTitle>
              <p className="text-sm text-muted-foreground">
                Existing comparison for the selected date range (not filtered to this BOQ project); values and gap flags remain equipment-level and are not BOQ-item or stretch-attributed.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 pr-4">Equipment</th>
                      <th className="py-3 pr-4 text-right">Planned</th>
                      <th className="py-3 pr-4 text-right">Purchased</th>
                      <th className="py-3 pr-4 text-right">Actual</th>
                      <th className="py-3">Gap flag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.dieselComparison.rows.map((row, index) => (
                      <tr key={`${row.equipmentName}-${index}`}>
                        <td className="py-3 pr-4">{row.equipmentName}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{formatNumber(row.planned)}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{formatNumber(row.purchased)}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{formatNumber(row.actual)}</td>
                        <td className="py-3">
                          {row.gapFlag ? <Badge variant="destructive">Gap flagged</Badge> : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-3 pr-4">Total</td>
                      <td className="py-3 pr-4 text-right">{formatNumber(data.dieselComparison.totals.planned)}</td>
                      <td className="py-3 pr-4 text-right">{formatNumber(data.dieselComparison.totals.purchased)}</td>
                      <td className="py-3 pr-4 text-right">{formatNumber(data.dieselComparison.totals.actual)}</td>
                      <td className="py-3"> </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Other incomplete equipment attribution</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Unlinked equipment logs" value={formatNumber(data.incompleteAttribution.equipmentHours.unlinkedLogCount, 0)} detail={`${formatNumber(data.incompleteAttribution.equipmentHours.unlinkedHours)} h not assigned to a BOQ item`} />
              <Metric label="Items with no equipment recipe" value={formatNumber(data.incompleteAttribution.itemsWithoutEquipmentRecipe, 0)} detail="Included in planning, but no equipment recipe is configured" />
              <Metric label="Planned rows without month phasing" value={formatNumber(data.incompleteAttribution.plannedRowsWithoutMonthPhasing, 0)} detail="Cannot be compared to this selected date range" />
              <Metric label="Read-only status" value="No writes" detail="No operational records or links were changed" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function GapCard({ title, gap, secondary }: { title: string; gap: Gap; secondary?: string }) {
  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{gapDisplay(gap)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{gap.unit}</div>
        <Badge variant="outline" className="mt-3 whitespace-normal border-amber-400 text-amber-800">{gap.status}</Badge>
        {secondary && <p className="mt-3 text-sm">{secondary}</p>}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{gap.note}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
