/**
 * Batch 06 — Progress Report (RA-style item-wise / chainage-wise / date-wise
 * rollup of SUBMITTED DPR actuals). READ-ONLY audit surface.
 *
 * All quantity math lives in shared/progressReport.ts (same functions the
 * server export uses). Running cumulative arrives from the server already
 * computed chronologically — display sorting here never recomputes it.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HubShell } from "@/components/HubShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type ComputedEntry, type ReportBoqItem, type MeasurementSort,
  computeItemAbstract, sortForDisplay, buildCoverageStrips, entryIntersectsRange,
} from "@shared/progressReport";
import { parseChainageKm, formatChainageKm } from "@shared/barSide";

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
  const [projectId, setProjectId] = useState<string>("");
  const [site, setSite] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>(today());

  const { data: projects } = useQuery<Array<{ id: number; name: string }>>({ queryKey: ["/api/boq/projects"] });
  const effectiveProject = projectId || (projects && projects.length === 1 ? String(projects[0].id) : "");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: [`/api/reports/progress?projectId=${effectiveProject}${site ? `&site=${encodeURIComponent(site)}` : ""}`],
    enabled: !!effectiveProject,
  });

  const effFrom = from || report?.defaultFromDate || "1900-01-01";
  const effTo = to || today();

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
      if (site) params.set("site", site);
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
    <HubShell title="Progress Report" subtitle="RA-style rollup of submitted DPR actuals" backHref="/reports/hub" backLabel="Reports Hub">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Filters */}
        <Card><CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-slate-500 mb-1">Project</div>
            <Select value={effectiveProject} onValueChange={setProjectId}>
              <SelectTrigger className="w-56" data-testid="select-project"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{(projects ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Site</div>
            <Select value={site || "__all"} onValueChange={(v) => setSite(v === "__all" ? "" : v)}>
              <SelectTrigger className="w-44" data-testid="select-site"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All sites</SelectItem>
                {(report?.sites ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">From</div>
            <Input type="date" className="w-40" value={effFrom} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" />
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">To</div>
            <Input type="date" className="w-40" value={effTo} onChange={(e) => setTo(e.target.value)} data-testid="input-to" />
          </div>
          <Button variant="outline" onClick={() => { setFrom(""); setTo(today()); }} data-testid="button-reset">Reset</Button>
          <Button onClick={exportExcel} disabled={!report} data-testid="button-export"><Download className="w-4 h-4 mr-1" />Export Excel</Button>
        </CardContent></Card>

        {!effectiveProject && <div className="text-slate-500 text-sm p-6 text-center">Select a project to build the report.</div>}
        {isLoading && <div className="text-slate-500 text-sm p-6 text-center">Building report…</div>}

        {report && (
          <Tabs defaultValue="item">
            <TabsList>
              <TabsTrigger value="item" data-testid="tab-item">Item-wise</TabsTrigger>
              <TabsTrigger value="chainage" data-testid="tab-chainage">Chainage-wise</TabsTrigger>
              <TabsTrigger value="date" data-testid="tab-date">Date-wise</TabsTrigger>
            </TabsList>
            <TabsContent value="item"><ItemWise abstracts={abstracts} from={effFrom} to={effTo} /></TabsContent>
            <TabsContent value="chainage"><ChainageWise items={report.items} /></TabsContent>
            <TabsContent value="date"><DateWise items={report.items} from={effFrom} to={effTo} /></TabsContent>
          </Tabs>
        )}
      </div>
    </HubShell>
  );
}

// ── Item-wise (RA/MB register) ───────────────────────────────────────────────

function ItemWise({ abstracts, from, to }: { abstracts: Array<{ it: ReportItem; abs: ReturnType<typeof computeItemAbstract> }>; from: string; to: string }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [view, setView] = useState<"measurement" | "abstract">("measurement");

  if (abstracts.length === 0) return <div className="text-sm text-slate-500 p-6 text-center">No submitted DPR progress in this project.</div>;

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1">
        <Button size="sm" variant={view === "measurement" ? "default" : "outline"} onClick={() => setView("measurement")} data-testid="toggle-measurement">Measurement View</Button>
        <Button size="sm" variant={view === "abstract" ? "default" : "outline"} onClick={() => setView("abstract")} data-testid="toggle-abstract">Abstract View</Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
              <th>Sl.</th><th>BOQ Item</th><th>UoM</th>
              <th className="text-right">Contract Qty</th><th className="text-right">Previous</th>
              <th className="text-right">This Period</th><th className="text-right">Cumulative</th>
              <th className="text-right">Balance</th><th className="text-right">%</th>
              <th className="text-right">DPRs</th><th></th>
            </tr>
          </thead>
          <tbody>
            {abstracts.map(({ it, abs }, i) => (
              <>
                <tr key={it.boqItem.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setOpenId(openId === it.boqItem.id ? null : it.boqItem.id)} data-testid={`row-item-${it.boqItem.id}`}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 max-w-md"><span className="font-medium">{itemLabel(it.boqItem)}</span>
                    {abs.reviewCount > 0 && <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">{abs.reviewCount} review</Badge>}
                    {abs.overlapCount > 0 && <Badge variant="outline" className="ml-2 text-orange-700 border-orange-300">{abs.overlapCount} possible overlap</Badge>}
                  </td>
                  <td className="px-3 py-2">{it.boqItem.unit}</td>
                  <td className="px-3 py-2 text-right">{fmt(abs.contractQty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(abs.previousQty)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(abs.thisPeriodQty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(abs.cumulativeQty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(abs.balanceQty)}</td>
                  <td className="px-3 py-2 text-right">{abs.pctComplete != null ? `${abs.pctComplete.toFixed(1)}%` : "—"}</td>
                  <td className="px-3 py-2 text-right">{abs.dprCount}</td>
                  <td className="px-2">{openId === it.boqItem.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                </tr>
                {openId === it.boqItem.id && view === "measurement" && (
                  <tr key={`d${it.boqItem.id}`}><td colSpan={11} className="bg-slate-50/60 px-3 py-3">
                    <MeasurementSheet item={it} from={from} to={to} />
                  </td></tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function MeasurementSheet({ item, from, to }: { item: ReportItem; from: string; to: string }) {
  const [sort, setSort] = useState<MeasurementSort>("chainage_date");
  const rows = useMemo(() => sortForDisplay(item.entries, sort), [item.entries, sort]);
  const strips = useMemo(() => buildCoverageStrips(item.entries), [item.entries]);
  const anyConverted = item.entries.some((e) => e.converted);

  return (
    <div className="space-y-3">
      {strips.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-600">DPR Chainage Coverage</div>
          {strips.map((s) => <StripBar key={s.label} strip={s} />)}
          <div className="text-[11px] text-slate-500">
            Shows where submitted DPR progress has been recorded. It does not by itself mean the item is fully complete at that chainage.
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Sort:</span>
        <Button size="sm" variant={sort === "chainage_date" ? "default" : "outline"} onClick={() => setSort("chainage_date")} data-testid="sort-chainage-date">Chainage → Date</Button>
        <Button size="sm" variant={sort === "date_chainage" ? "default" : "outline"} onClick={() => setSort("date_chainage")} data-testid="sort-date-chainage">Date → Chainage</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs bg-white rounded border">
          <thead className="bg-slate-100 text-slate-600">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
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
                <td className="px-2 py-1.5">{e.chainageFrom ?? (e.location ? <span className="text-slate-500">{e.location}</span> : "—")}</td>
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
                <td className="px-2 py-1.5"><Link href={`/site/report/${e.dprId}`} className="text-blue-600 hover:underline" data-testid={`link-dpr-${e.dprId}`}>DPR-{e.dprId}</Link></td>
                <td className="px-2 py-1.5">{e.engineer ?? "—"}</td>
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
      <div className="w-24 text-[11px] text-slate-600">{strip.label}</div>
      <div className="relative h-3 flex-1 bg-slate-200 rounded overflow-hidden" title={`${formatChainageKm(strip.extentFromKm)} – ${formatChainageKm(strip.extentToKm)}`}>
        {strip.segments.map((s, i) => (
          <div key={i}
            className={`absolute top-0 h-full ${s.state === "overlap" ? "bg-orange-400" : "bg-emerald-500"}`}
            style={{ left: `${((s.fromKm - strip.extentFromKm) / span) * 100}%`, width: `${Math.max(((s.toKm - s.fromKm) / span) * 100, 0.5)}%` }}
            title={`${s.state === "overlap" ? "Possible overlap" : "Recorded"}: ${formatChainageKm(s.fromKm)}–${formatChainageKm(s.toKm)}`}
          />
        ))}
      </div>
      <div className="text-[10px] text-slate-500 w-28">{formatChainageKm(strip.extentFromKm)}–{formatChainageKm(strip.extentToKm)}</div>
    </div>
  );
}

// ── Chainage-wise ────────────────────────────────────────────────────────────

function ChainageWise({ items }: { items: ReportItem[] }) {
  const [fromCh, setFromCh] = useState("");
  const [toCh, setToCh] = useState("");
  const [side, setSide] = useState("");

  const fromKm = parseChainageKm(fromCh);
  const toKm = parseChainageKm(toCh);
  const active = fromKm != null && toKm != null;

  const rows = useMemo(() => {
    if (!active) return [];
    const out: Array<{ e: ComputedEntry; item: ReportItem["boqItem"] }> = [];
    for (const it of items) {
      for (const e of it.entries) {
        if (entryIntersectsRange(e, fromKm!, toKm!, side || null)) out.push({ e, item: it.boqItem });
      }
    }
    out.sort((a, b) => (a.e.dprDate < b.e.dprDate ? -1 : a.e.dprDate > b.e.dprDate ? 1 : String(itemLabel(a.item)).localeCompare(String(itemLabel(b.item)))));
    return out;
  }, [items, fromKm, toKm, side, active]);

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
        <div><div className="text-xs text-slate-500 mb-1">From Chainage</div><Input className="w-32" placeholder="e.g. 2+000" value={fromCh} onChange={(e) => setFromCh(e.target.value)} data-testid="input-ch-from" /></div>
        <div><div className="text-xs text-slate-500 mb-1">To Chainage</div><Input className="w-32" placeholder="e.g. 3+500" value={toCh} onChange={(e) => setToCh(e.target.value)} data-testid="input-ch-to" /></div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Side</div>
          <Select value={side || "__any"} onValueChange={(v) => setSide(v === "__any" ? "" : v)}>
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
        {!active && (fromCh || toCh) && <div className="text-xs text-amber-600">Enter valid chainages (e.g. 2+000)</div>}
      </CardContent></Card>
      {active && (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th>Date</th><th>BOQ Item</th><th>Side</th><th>From</th><th>To</th><th className="text-right">Qty</th><th className="text-right">BOQ Qty</th><th>DPR</th><th>Remarks</th>
            </tr></thead>
            <tbody>
              {rows.map(({ e, item }) => (
                <tr key={`${e.kind}:${e.entryId}`} className="border-t" data-testid={`row-ch-${e.kind}-${e.entryId}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{e.dprDate}</td>
                  <td className="px-2 py-1.5 max-w-xs">{itemLabel(item)}</td>
                  <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.chainageFrom ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.chainageTo ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                  <td className="px-2 py-1.5 text-right">{e.converted && e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.unit}` : ""}</td>
                  <td className="px-2 py-1.5"><Link href={`/site/report/${e.dprId}`} className="text-blue-600 hover:underline">DPR-{e.dprId}</Link></td>
                  <td className="px-2 py-1.5 max-w-xs">{e.remarks ?? ""}</td>
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

function DateWise({ items, from, to }: { items: ReportItem[]; from: string; to: string }) {
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
          <div className="px-3 py-2 bg-slate-50 font-medium text-sm border-b">{date}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500"><tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                <th>BOQ Item</th><th>Side</th><th>From–To / Location</th><th className="text-right">Qty</th><th className="text-right">BOQ Qty</th><th>DPR</th><th>Prepared By</th><th>Remarks</th>
              </tr></thead>
              <tbody>
                {rows.map(({ e, item }) => (
                  <tr key={`${e.kind}:${e.entryId}`} className="border-t" data-testid={`row-date-${e.kind}-${e.entryId}`}>
                    <td className="px-2 py-1.5 max-w-xs">{itemLabel(item)}</td>
                    <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                    <td className="px-2 py-1.5">{e.chainageFrom ? `${e.chainageFrom} – ${e.chainageTo ?? ""}` : (e.location ?? "—")}</td>
                    <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{e.converted && e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.unit}` : ""}</td>
                    <td className="px-2 py-1.5"><Link href={`/site/report/${e.dprId}`} className="text-blue-600 hover:underline">DPR-{e.dprId}</Link></td>
                    <td className="px-2 py-1.5">{e.engineer ?? "—"}</td>
                    <td className="px-2 py-1.5 max-w-xs">{e.remarks ?? ""}</td>
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
