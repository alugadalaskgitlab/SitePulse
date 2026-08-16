/**
 * Batch 06 — Progress Report (RA-style item-wise / chainage-wise / date-wise
 * rollup of SUBMITTED DPR actuals). READ-ONLY audit surface.
 *
 * All quantity math lives in shared/progressReport.ts (same functions the
 * server export uses). Running cumulative arrives from the server already
 * computed chronologically — display sorting here never recomputes it.
 *
 * Batch 06A — renders as plain page content (the router's shell already
 * provides the sidebar/header; a second HubShell here double-offset the page).
 * All filter/view state lives in the URL so DPR drill-down + Back restores
 * the exact report context (see client/src/lib/progressReportNav.ts).
 */
import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ChevronRight as Crumb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type ComputedEntry, type ReportBoqItem,
  computeItemAbstract, sortForDisplay, buildCoverageStrips, entryIntersectsRange,
  layerBreakdown,
} from "@shared/progressReport";
import { layerDisplayName } from "@shared/layerDisplay";
import { parseChainageKm, formatChainageKm } from "@shared/barSide";
import {
  type ProgressReportState, parseReportState, progressReportUrl, dprLinkWithReturn,
} from "@/lib/progressReportNav";

type ReportItem = { boqItem: ReportBoqItem & { itemName?: string | null; displayName?: string | null; description: string }; entries: ComputedEntry[] };
type Report = {
  project: { id: number; name: string; startDate: string | null };
  defaultFromDate: string | null;
  sites: string[];
  items: ReportItem[];
};

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number | null | undefined, dp = 3) =>
  n == null ? "—" : Number(n.toFixed(dp)).toLocaleString("en-IN");
const itemLabel = (b: ReportItem["boqItem"]) => b.displayName || b.itemName || b.description;

export default function ProgressReport() {
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const state = useMemo(() => parseReportState(search), [search]);

  // Filter/view changes REPLACE the current history entry so browser Back
  // still goes Reports Hub ← Progress Report naturally (no history spam).
  const update = (patch: Partial<ProgressReportState>) =>
    setLocation(progressReportUrl({ ...state, ...patch }), { replace: true });

  const { data: projects } = useQuery<Array<{ id: number; name: string }>>({ queryKey: ["/api/boq/projects"] });
  const effectiveProject = state.projectId || (projects && projects.length === 1 ? String(projects[0].id) : "");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: [`/api/reports/progress?projectId=${effectiveProject}${state.site ? `&site=${encodeURIComponent(state.site)}` : ""}`],
    enabled: !!effectiveProject,
  });

  const effFrom = state.from || report?.defaultFromDate || "1900-01-01";
  const effTo = state.to || today();
  const linkState: ProgressReportState = { ...state, projectId: effectiveProject };

  const abstracts = useMemo(() => {
    if (!report) return [];
    return report.items.map((it) => ({
      it,
      abs: computeItemAbstract(it.entries, it.boqItem, effFrom, effTo),
    }));
  }, [report, effFrom, effTo]);

  const exportExcel = async () => {
    try {
      const params = new URLSearchParams({ projectId: effectiveProject, from: effFrom, to: effTo });
      if (state.site) params.set("site", state.site);
      const res = await fetch(`/api/reports/progress/export?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `progress-report-${effFrom}-to-${effTo}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4" data-testid="page-progress-report">
      {/* Breadcrumb + title (Reports Hub > Progress Report) */}
      <div>
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <Link href="/reports/hub" className="hover:text-slate-800 hover:underline" data-testid="link-reports-hub">Reports Hub</Link>
          <Crumb className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-700 font-medium">Progress Report</span>
        </div>
        <h1 className="text-2xl font-bold font-display mt-1">Progress Report</h1>
        <p className="text-sm text-slate-600">RA-style rollup of submitted DPR actuals</p>
      </div>

      {/* Filters */}
      <Card><CardContent className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Project</div>
          <Select value={effectiveProject} onValueChange={(v) => update({ projectId: v })}>
            <SelectTrigger className="w-56" data-testid="select-project"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{(projects ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Site</div>
          <Select value={state.site || "__all"} onValueChange={(v) => update({ site: v === "__all" ? "" : v })}>
            <SelectTrigger className="w-44" data-testid="select-site"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All sites</SelectItem>
              {(report?.sites ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">From</div>
          <Input type="date" className="w-40" value={effFrom} onChange={(e) => update({ from: e.target.value })} data-testid="input-from" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">To</div>
          <Input type="date" className="w-40" value={effTo} onChange={(e) => update({ to: e.target.value })} data-testid="input-to" />
        </div>
        <Button variant="outline" onClick={() => update({ from: "", to: "" })} data-testid="button-reset">Reset</Button>
        <Button onClick={exportExcel} disabled={!report} data-testid="button-export"><Download className="w-4 h-4 mr-1" />Export Excel</Button>
      </CardContent></Card>

      {!effectiveProject && <div className="text-slate-500 text-sm p-6 text-center">Select a project to build the report.</div>}
      {isLoading && <div className="text-slate-500 text-sm p-6 text-center">Building report…</div>}

      {report && (
        <Tabs value={state.tab} onValueChange={(v) => update({ tab: v as ProgressReportState["tab"] })}>
          <TabsList>
            <TabsTrigger value="item" data-testid="tab-item">Item-wise</TabsTrigger>
            <TabsTrigger value="chainage" data-testid="tab-chainage">Chainage-wise</TabsTrigger>
            <TabsTrigger value="date" data-testid="tab-date">Date-wise</TabsTrigger>
          </TabsList>
          <TabsContent value="item"><ItemWise abstracts={abstracts} from={effFrom} to={effTo} state={linkState} update={update} /></TabsContent>
          <TabsContent value="chainage"><ChainageWise items={report.items} state={linkState} update={update} /></TabsContent>
          <TabsContent value="date"><DateWise items={report.items} from={effFrom} to={effTo} state={linkState} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type Nav = { state: ProgressReportState; update: (p: Partial<ProgressReportState>) => void };

// ── Item-wise (RA/MB register) ───────────────────────────────────────────────

function ItemWise({ abstracts, from, to, state, update }: { abstracts: Array<{ it: ReportItem; abs: ReturnType<typeof computeItemAbstract> }>; from: string; to: string } & Nav) {
  const openId = state.item ? Number(state.item) : null;
  const view = state.view;

  if (abstracts.length === 0) return <div className="text-sm text-slate-500 p-6 text-center">No submitted DPR progress in this project.</div>;

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1">
        <Button size="sm" variant={view === "measurement" ? "default" : "outline"} onClick={() => update({ view: "measurement" })} data-testid="toggle-measurement">Measurement View</Button>
        <Button size="sm" variant={view === "abstract" ? "default" : "outline"} onClick={() => update({ view: "abstract" })} data-testid="toggle-abstract">Abstract View</Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm text-slate-900">
          <thead className="bg-slate-50 text-slate-700">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
              <th>Sl.</th><th>BOQ Item</th><th>UoM</th>
              <th className="text-right">Contract Qty</th><th className="text-right">Previous</th>
              <th className="text-right">This Period</th><th className="text-right">Cumulative</th>
              <th className="text-right">Balance</th><th className="text-right">%</th>
              <th className="text-right">DPRs</th><th></th>
            </tr>
          </thead>
          <tbody>
            {abstracts.map(({ it, abs }, i) => (
              <Fragment key={it.boqItem.id}>
                <tr className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => update({ item: openId === it.boqItem.id ? "" : String(it.boqItem.id) })} data-testid={`row-item-${it.boqItem.id}`}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 max-w-md"><span className="font-medium">{itemLabel(it.boqItem)}</span>
                    {abs.reviewCount > 0 && <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">{abs.reviewCount} review</Badge>}
                    {abs.overlapCount > 0 && <Badge variant="outline" className="ml-2 text-orange-700 border-orange-300">{abs.overlapCount} possible overlap</Badge>}
                  </td>
                  <td className="px-3 py-2">{it.boqItem.unit}</td>
                  <td className="px-3 py-2 text-right">{fmt(abs.contractQty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(abs.previousQty)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(abs.thisPeriodQty)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(abs.cumulativeQty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(abs.balanceQty)}</td>
                  <td className="px-3 py-2 text-right">{abs.pctComplete != null ? `${abs.pctComplete.toFixed(1)}%` : "—"}</td>
                  <td className="px-3 py-2 text-right">{abs.dprCount}</td>
                  <td className="px-2">{openId === it.boqItem.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                </tr>
                {openId === it.boqItem.id && view === "measurement" && (
                  <tr><td colSpan={11} className="bg-slate-50/60 px-3 py-3">
                    <MeasurementSheet item={it} from={from} to={to} state={state} update={update} />
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function MeasurementSheet({ item, from, to, state, update }: { item: ReportItem; from: string; to: string } & Nav) {
  const sort = state.sort;
  const rows = useMemo(() => sortForDisplay(item.entries, sort), [item.entries, sort]);
  const strips = useMemo(() => buildCoverageStrips(item.entries), [item.entries]);
  const anyConverted = item.entries.some((e) => e.converted);

  const layers = useMemo(() => layerBreakdown(item.entries), [item.entries]);

  return (
    <div className="space-y-3">
      {/* 06P: optional layer/lift split — only when 2+ distinct layers were
          recorded; a pure breakdown of the existing total, never a new column. */}
      {layers.length > 0 && (
        <details className="text-xs" data-testid={`layer-breakdown-${item.boqItem.id}`}>
          <summary className="cursor-pointer font-semibold text-slate-700 select-none">Layer details</summary>
          <div className="mt-1 space-y-0.5 pl-4">
            {layers.map((l) => (
              <div key={l.layerNo ?? "none"} className="flex gap-2" data-testid={`layer-row-${item.boqItem.id}-${l.layerNo ?? "none"}`}>
                <span className="text-slate-600">
                  {l.layerNo != null ? layerDisplayName(itemLabel(item.boqItem), l.layerNo) : "No layer recorded"}
                </span>
                <span className="font-medium">— {fmt(l.qty, 4)} {item.boqItem.unit}</span>
                <span className="text-slate-400">({l.entryCount} {l.entryCount === 1 ? "entry" : "entries"})</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {strips.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-700">DPR Chainage Coverage</div>
          {strips.map((s) => <StripBar key={s.label} strip={s} />)}
          <div className="text-[11px] text-slate-500">
            Shows where submitted DPR progress has been recorded. It does not by itself mean the item is fully complete at that chainage.
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">Sort:</span>
        <Button size="sm" variant={sort === "chainage_date" ? "default" : "outline"} onClick={() => update({ sort: "chainage_date" })} data-testid="sort-chainage-date">Chainage → Date</Button>
        <Button size="sm" variant={sort === "date_chainage" ? "default" : "outline"} onClick={() => update({ sort: "date_chainage" })} data-testid="sort-date-chainage">Date → Chainage</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs bg-white rounded border text-slate-900">
          <thead className="bg-slate-100 text-slate-700">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-semibold">
              <th>Sl.</th><th>Date</th><th>Side</th><th>From</th><th>To</th>
              <th className="text-right">L</th><th className="text-right">W</th><th className="text-right">T</th>
              {anyConverted ? <><th className="text-right">Measured Qty</th><th className="text-right">BOQ Qty</th></> : <th className="text-right">Qty</th>}
              <th className="text-right">Running Cum.</th><th>DPR</th><th>Prepared By</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.kind}:${e.entryId}`} className={`border-t ${e.overlaps.length ? "bg-orange-50" : ""}`} data-testid={`row-entry-${e.kind}-${e.entryId}`}>
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{e.dprDate}{(e.dprDate < from || e.dprDate > to) && <span className="text-slate-400 ml-1">(outside period)</span>}</td>
                <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                <td className="px-2 py-1.5">{e.chainageFrom ?? (e.location ? <span className="text-slate-600">{e.location}</span> : "—")}</td>
                <td className="px-2 py-1.5">{e.chainageTo ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">{e.length ?? ""}</td>
                <td className="px-2 py-1.5 text-right">{e.width ?? ""}</td>
                <td className="px-2 py-1.5 text-right">{e.thickness ?? ""}</td>
                {anyConverted ? (
                  <>
                    <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.boqItem.unit}` : "—"}</td>
                  </>
                ) : (
                  <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? item.boqItem.unit}` : "—"}</td>
                )}
                <td className="px-2 py-1.5 text-right font-medium">{fmt(e.runningCumulative, 4)}</td>
                <td className="px-2 py-1.5"><Link href={dprLinkWithReturn(e.dprId, state)} className="text-blue-600 hover:underline" data-testid={`link-dpr-${e.dprId}`}>DPR-{e.dprId}</Link></td>
                <td className="px-2 py-1.5 text-slate-500">{e.engineer ?? "—"}</td>
                <td className="px-2 py-1.5 max-w-xs">
                  {e.reviewFlag && <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{e.reviewFlag}</span>}
                  {e.overlaps.length > 0 && (
                    <span className="text-orange-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />
                      Possible overlap with {e.overlaps.map((o) => `DPR-${o.withDprId} (${o.side ?? "?"} ${formatChainageKm(o.fromKm)}–${formatChainageKm(o.toKm)})`).join(", ")}
                    </span>
                  )}
                  {e.remarks && <span className="text-slate-500">{e.remarks}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StripBar({ strip }: { strip: import("@shared/progressReport").CoverageStrip }) {
  const span = Math.max(strip.extentToKm - strip.extentFromKm, 1e-6);
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 text-[11px] font-medium text-slate-700">{strip.label}</div>
      <div className="relative h-3 flex-1 bg-slate-200 rounded overflow-hidden" title={`${formatChainageKm(strip.extentFromKm)} – ${formatChainageKm(strip.extentToKm)}`}>
        {strip.segments.map((s, i) => (
          <div key={i}
            className={`absolute top-0 h-full ${s.state === "overlap" ? "bg-orange-400" : "bg-emerald-500"}`}
            style={{ left: `${((s.fromKm - strip.extentFromKm) / span) * 100}%`, width: `${Math.max(((s.toKm - s.fromKm) / span) * 100, 0.5)}%` }}
            title={`${s.state === "overlap" ? "Possible overlap" : "Recorded"}: ${formatChainageKm(s.fromKm)}–${formatChainageKm(s.toKm)}`}
          />
        ))}
      </div>
      <div className="text-[10px] text-slate-600 w-28">{formatChainageKm(strip.extentFromKm)}–{formatChainageKm(strip.extentToKm)}</div>
    </div>
  );
}

// ── Chainage-wise ────────────────────────────────────────────────────────────

function ChainageWise({ items, state, update }: { items: ReportItem[] } & Nav) {
  const { chFrom, chTo, chSide } = state;

  const fromKm = parseChainageKm(chFrom);
  const toKm = parseChainageKm(chTo);
  const active = fromKm != null && toKm != null;

  const rows = useMemo(() => {
    if (!active) return [];
    const out: Array<{ e: ComputedEntry; item: ReportItem["boqItem"] }> = [];
    for (const it of items) {
      for (const e of it.entries) {
        if (entryIntersectsRange(e, fromKm!, toKm!, chSide || null)) out.push({ e, item: it.boqItem });
      }
    }
    out.sort((a, b) => (a.e.dprDate < b.e.dprDate ? -1 : a.e.dprDate > b.e.dprDate ? 1 : String(itemLabel(a.item)).localeCompare(String(itemLabel(b.item)))));
    return out;
  }, [items, fromKm, toKm, chSide, active]);

  const totals = useMemo(() => {
    const m = new Map<string, { label: string; unit: string; qty: number }>();
    for (const { e, item } of rows) {
      if (e.boqCreditQty == null) continue;
      const k = `${item.id}`;
      const t = m.get(k) ?? { label: itemLabel(item), unit: item.unit, qty: 0 };
      t.qty += e.boqCreditQty;
      m.set(k, t);
    }
    return Array.from(m.values());
  }, [rows]);

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 flex flex-wrap items-end gap-3">
        <div><div className="text-xs font-medium text-slate-600 mb-1">From Chainage</div><Input className="w-32" placeholder="e.g. 2+000" value={chFrom} onChange={(e) => update({ chFrom: e.target.value })} data-testid="input-ch-from" /></div>
        <div><div className="text-xs font-medium text-slate-600 mb-1">To Chainage</div><Input className="w-32" placeholder="e.g. 3+500" value={chTo} onChange={(e) => update({ chTo: e.target.value })} data-testid="input-ch-to" /></div>
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Side</div>
          <Select value={chSide || "__any"} onValueChange={(v) => update({ chSide: v === "__any" ? "" : v })}>
            <SelectTrigger className="w-36" data-testid="select-ch-side"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any">Any side</SelectItem>
              <SelectItem value="LHS">LHS</SelectItem>
              <SelectItem value="RHS">RHS</SelectItem>
              <SelectItem value="Both Sides">Both Sides</SelectItem>
              <SelectItem value="Full Width">Full Width</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!active && (chFrom || chTo) && <div className="text-xs text-amber-600">Enter valid chainages (e.g. 2+000)</div>}
      </CardContent></Card>
      {active && (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-slate-900">
            <thead className="bg-slate-50 text-slate-700"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
              <th>Date</th><th>BOQ Item</th><th>Side</th><th>From</th><th>To</th><th className="text-right">Qty</th><th className="text-right">BOQ Qty</th><th>DPR</th><th>Remarks</th>
            </tr></thead>
            <tbody>
              {rows.map(({ e, item }) => (
                <tr key={`${e.kind}:${e.entryId}`} className="border-t" data-testid={`row-ch-${e.kind}-${e.entryId}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{e.dprDate}</td>
                  <td className="px-2 py-1.5 max-w-xs font-medium">{itemLabel(item)}</td>
                  <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.chainageFrom ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.chainageTo ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                  <td className="px-2 py-1.5 text-right">{e.converted && e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.unit}` : ""}</td>
                  <td className="px-2 py-1.5"><Link href={dprLinkWithReturn(e.dprId, state)} className="text-blue-600 hover:underline">DPR-{e.dprId}</Link></td>
                  <td className="px-2 py-1.5 max-w-xs text-slate-500">{e.remarks ?? ""}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-500">No submitted DPR progress intersects this range.</td></tr>}
            </tbody>
            {totals.length > 0 && (
              <tfoot className="bg-slate-50 border-t font-medium">
                {totals.map((t) => (
                  <tr key={t.label}><td colSpan={5} className="px-2 py-1.5 text-right">{t.label}</td><td colSpan={2} className="px-2 py-1.5 text-right">{fmt(t.qty, 4)} {t.unit}</td><td colSpan={2} /></tr>
                ))}
              </tfoot>
            )}
          </table>
        </CardContent></Card>
      )}
      {!active && <div className="text-sm text-slate-500 p-4 text-center">Enter a chainage range to see all recorded work in that stretch.</div>}
    </div>
  );
}

// ── Date-wise ────────────────────────────────────────────────────────────────

function DateWise({ items, from, to, state }: { items: ReportItem[]; from: string; to: string; state: ProgressReportState }) {
  const groups = useMemo(() => {
    const m = new Map<string, Array<{ e: ComputedEntry; item: ReportItem["boqItem"] }>>();
    for (const it of items) {
      for (const e of it.entries) {
        if (e.dprDate < from || e.dprDate > to) continue;
        (m.get(e.dprDate) ?? m.set(e.dprDate, []).get(e.dprDate)!).push({ e, item: it.boqItem });
      }
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items, from, to]);

  if (groups.length === 0) return <div className="text-sm text-slate-500 p-6 text-center">No submitted DPR progress in the selected period.</div>;

  return (
    <div className="space-y-4">
      {groups.map(([date, rows]) => (
        <Card key={date}><CardContent className="p-0">
          <div className="px-3 py-2 bg-slate-50 font-semibold text-sm border-b text-slate-800">{date}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-900">
              <thead className="text-slate-700"><tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-semibold">
                <th>BOQ Item</th><th>Side</th><th>From–To / Location</th><th className="text-right">Qty</th><th className="text-right">BOQ Qty</th><th>DPR</th><th>Prepared By</th><th>Remarks</th>
              </tr></thead>
              <tbody>
                {rows.map(({ e, item }) => (
                  <tr key={`${e.kind}:${e.entryId}`} className="border-t" data-testid={`row-date-${e.kind}-${e.entryId}`}>
                    <td className="px-2 py-1.5 max-w-xs font-medium">{itemLabel(item)}</td>
                    <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                    <td className="px-2 py-1.5">{e.chainageFrom ? `${e.chainageFrom} – ${e.chainageTo ?? ""}` : (e.location ?? "—")}</td>
                    <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{e.converted && e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.unit}` : ""}</td>
                    <td className="px-2 py-1.5"><Link href={dprLinkWithReturn(e.dprId, state)} className="text-blue-600 hover:underline">DPR-{e.dprId}</Link></td>
                    <td className="px-2 py-1.5 text-slate-500">{e.engineer ?? "—"}</td>
                    <td className="px-2 py-1.5 max-w-xs text-slate-500">{e.remarks ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}
