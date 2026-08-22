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
 *
 * Batch 06V additions:
 *  - Incidental markers in measurement table (no BOQ credit badge + italic row)
 *  - Coverage bar hatched/striped incidental treatment + legend
 *  - Overlap Review panel: every pair with full context, deep-links to DPR/edit
 *  - "Both are valid" two-step dialog with Incidental / Separately Payable paths
 *  - Legacy-layer warning when layer differs only because one is null
 *
 * Instruction 06X additions:
 *  - Incidental / Separately Payable confirm calls
 *    PATCH /api/progress-entries/:entryId/overlap-resolution directly — no
 *    full-DPR fetch or version POST, no DPR_NOT_READY gate.
 *  - On success: invalidates progress/RA queries, shows toast, stays on report.
 */
import { Fragment, useMemo, useRef, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ChevronRight as Crumb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Download, ChevronDown, ChevronRight, AlertTriangle, Layers, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { buildReason, OTHER_VALUE } from "@/lib/overlapReason";
import {
  type ComputedEntry, type ReportBoqItem, type OverlapPair,
  computeItemAbstract, sortForDisplay, buildCoverageStrips, entryIntersectsRange,
  layerBreakdown, buildOverlapPairs,
} from "@shared/progressReport";
import { layerDisplayName } from "@shared/layerDisplay";
import { parseChainageKm, formatChainageKm } from "@shared/barSide";
import {
  type ProgressReportState, parseReportState, progressReportUrl, dprLinkWithReturn,
  isOverlapReviewOpen, overlapReviewTargetId,
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
  const queryClient = useQueryClient();

  // Filter/view changes REPLACE the current history entry so browser Back
  // still goes Reports Hub ← Progress Report naturally (no history spam).
  const update = (patch: Partial<ProgressReportState>) =>
    setLocation(progressReportUrl({ ...state, ...patch }), { replace: true });

  // On mount (or when navigating back), explicitly mark the progress report
  // query stale so it refetches with any changes made in SiteEdit.
  const effectiveProjectRef = useRef<string>("");

  const { data: projects } = useQuery<Array<{ id: number; name: string }>>({ queryKey: ["/api/boq/projects"] });
  const effectiveProject = state.projectId || (projects && projects.length === 1 ? String(projects[0].id) : "");

  useEffect(() => {
    if (effectiveProject && effectiveProject !== effectiveProjectRef.current) {
      effectiveProjectRef.current = effectiveProject;
    }
    // Invalidate on every mount so returning from SiteEdit sees fresh data.
    if (effectiveProject) {
      queryClient.invalidateQueries({
        queryKey: [`/api/reports/progress?projectId=${effectiveProject}${state.site ? `&site=${encodeURIComponent(state.site)}` : ""}`],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                <tr className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => update({ item: openId === it.boqItem.id ? "" : String(it.boqItem.id), overlapAnchor: "" })} data-testid={`row-item-${it.boqItem.id}`}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 max-w-md"><span className="font-medium">{itemLabel(it.boqItem)}</span>
                    {abs.reviewCount > 0 && <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">{abs.reviewCount} review</Badge>}
                    {abs.overlapCount > 0 && (
                      <button
                        type="button"
                        className="ml-2 inline-flex items-center rounded border border-orange-300 px-1.5 py-0.5 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors"
                        data-testid={`badge-overlap-${it.boqItem.id}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          update({ item: String(it.boqItem.id), overlapAnchor: "open", view: "measurement" });
                        }}
                      >
                        {abs.overlapCount} possible overlap
                      </button>
                    )}
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
  const overlapPairs = useMemo(() => buildOverlapPairs(item.entries), [item.entries]);

  // Pair anchors reopen the panel and restore focus to the exact reviewed pair.
  const overlapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOverlapReviewOpen(state.overlapAnchor)) return;
    const frame = requestAnimationFrame(() => {
      const targetId = overlapReviewTargetId(state.overlapAnchor);
      const target = (targetId ? document.getElementById(targetId) : null) ?? overlapRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.overlapAnchor]);

  return (
    <div className="space-y-3">
      {/* 06P: optional layer/lift split */}
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
          {/* 06V: Incidental legend only when any incidental entries exist */}
          {item.entries.some((e) => e.isIncidental) && (
            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-3 rounded-sm bg-emerald-500 shrink-0" />Recorded
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-3 rounded-sm bg-orange-400 shrink-0" />Overlap
              </span>
              <span className="flex items-center gap-1">
                <IncidentalHatch className="w-4 h-3 rounded-sm shrink-0" />Incidental (no BOQ credit)
              </span>
            </div>
          )}
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
            {rows.map((e, i) => {
              const isIncidental = !!e.isIncidental;
              return (
                <tr
                  key={`${e.kind}:${e.entryId}`}
                  className={`border-t ${isIncidental ? "bg-purple-50 italic" : e.overlaps.length ? "bg-orange-50" : ""}`}
                  data-testid={`row-entry-${e.kind}-${e.entryId}`}
                >
                  <td className="px-2 py-1.5">{i + 1}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {e.dprDate}
                    {(e.dprDate < from || e.dprDate > to) && <span className="text-slate-400 ml-1">(outside period)</span>}
                  </td>
                  <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.chainageFrom ?? (e.location ? <span className="text-slate-600">{e.location}</span> : "—")}</td>
                  <td className="px-2 py-1.5">{e.chainageTo ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{e.length ?? ""}</td>
                  <td className="px-2 py-1.5 text-right">{e.width ?? ""}</td>
                  <td className="px-2 py-1.5 text-right">{e.thickness ?? ""}</td>
                  {anyConverted ? (
                    <>
                      <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        {isIncidental ? (
                          <span className="text-purple-700 font-semibold not-italic" title="Incidental — no BOQ credit">—</span>
                        ) : e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.boqItem.unit}` : "—"}
                      </td>
                    </>
                  ) : (
                    <td className="px-2 py-1.5 text-right">
                      {isIncidental ? (
                        <span className="not-italic">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? item.boqItem.unit}` : "—"}</span>
                      ) : (
                        e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? item.boqItem.unit}` : "—"
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right font-medium">
                    {isIncidental ? <span className="text-purple-600 not-italic text-[10px]">incidental</span> : fmt(e.runningCumulative, 4)}
                  </td>
                  <td className="px-2 py-1.5"><Link href={dprLinkWithReturn(e.dprId, state)} className="text-blue-600 hover:underline" data-testid={`link-dpr-${e.dprId}`}>DPR-{e.dprId}</Link></td>
                  <td className="px-2 py-1.5 text-slate-500">{e.engineer ?? "—"}</td>
                  <td className="px-2 py-1.5 max-w-xs">
                    {isIncidental && (
                      <span className="text-purple-700 not-italic flex items-center gap-1 mb-0.5">
                        <Layers className="w-3 h-3 shrink-0" />
                        <span>Incidental — no BOQ credit{e.incidentalDescription ? `: ${e.incidentalDescription}` : ""}</span>
                      </span>
                    )}
                    {e.reviewFlag && <span className="text-amber-700 flex items-center gap-1 not-italic"><AlertTriangle className="w-3 h-3" />{e.reviewFlag}</span>}
                    {e.overlaps.length > 0 && (
                      <span className="text-orange-700 flex items-center gap-1 not-italic"><AlertTriangle className="w-3 h-3" />
                        Possible overlap with {e.overlaps.map((o) => `DPR-${o.withDprId} (${o.side ?? "?"} ${formatChainageKm(o.fromKm)}–${formatChainageKm(o.toKm)})`).join(", ")}
                      </span>
                    )}
                    {e.remarks && <span className="text-slate-500 not-italic">{e.remarks}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 06V: Overlap Review panel — shown when there are overlaps */}
      {overlapPairs.length > 0 && (
        <div ref={overlapRef} data-testid={`overlap-review-${item.boqItem.id}`}>
          <OverlapReview
            item={item}
            pairs={overlapPairs}
            state={state}
            update={update}
            open={isOverlapReviewOpen(state.overlapAnchor)}
            onToggle={() => update({ overlapAnchor: isOverlapReviewOpen(state.overlapAnchor) ? "" : "open" })}
          />
        </div>
      )}
    </div>
  );
}

// ── Coverage strip bar with incidental hatching ──────────────────────────────

/** Inline SVG pattern ID for the incidental hatch — defined once in the document. */
const INCIDENTAL_PATTERN_ID = "pr-incidental-hatch";

function IncidentalHatch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={INCIDENTAL_PATTERN_ID} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#e9d5ff" />
          <rect x="0" y="0" width="3" height="6" fill="#a855f7" opacity="0.4" />
        </pattern>
      </defs>
      <rect width="16" height="12" fill={`url(#${INCIDENTAL_PATTERN_ID})`} />
    </svg>
  );
}

function StripBar({ strip }: { strip: import("@shared/progressReport").CoverageStrip }) {
  const span = Math.max(strip.extentToKm - strip.extentFromKm, 1e-6);
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 text-[11px] font-medium text-slate-700">{strip.label}</div>
      <div className="relative h-3 flex-1 bg-slate-200 rounded overflow-hidden" title={`${formatChainageKm(strip.extentFromKm)} – ${formatChainageKm(strip.extentToKm)}`}>
        {/* Inline pattern definition for incidental hatching */}
        <svg className="absolute inset-0 w-0 h-0 overflow-hidden" aria-hidden="true">
          <defs>
            <pattern id={INCIDENTAL_PATTERN_ID} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#e9d5ff" />
              <rect x="0" y="0" width="3" height="6" fill="#a855f7" opacity="0.4" />
            </pattern>
          </defs>
        </svg>
        {strip.segments.map((s, i) => {
          const left = `${((s.fromKm - strip.extentFromKm) / span) * 100}%`;
          const width = `${Math.max(((s.toKm - s.fromKm) / span) * 100, 0.5)}%`;
          const title = `${s.state === "overlap" ? "Possible overlap" : s.state === "incidental" ? "Incidental (no BOQ credit)" : "Recorded"}: ${formatChainageKm(s.fromKm)}–${formatChainageKm(s.toKm)}`;
          if (s.state === "incidental") {
            return (
              <div key={i} className="absolute top-0 h-full" style={{ left, width }} title={title}>
                <svg className="w-full h-full" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id={`${INCIDENTAL_PATTERN_ID}-${i}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill="#e9d5ff" />
                      <rect x="0" y="0" width="3" height="6" fill="#a855f7" opacity="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#${INCIDENTAL_PATTERN_ID}-${i})`} />
                </svg>
              </div>
            );
          }
          return (
            <div key={i}
              className={`absolute top-0 h-full ${s.state === "overlap" ? "bg-orange-400" : "bg-emerald-500"}`}
              style={{ left, width }}
              title={title}
            />
          );
        })}
      </div>
      <div className="text-[10px] text-slate-600 w-28">{formatChainageKm(strip.extentFromKm)}–{formatChainageKm(strip.extentToKm)}</div>
    </div>
  );
}

// ── 06V: Overlap Review ──────────────────────────────────────────────────────

/**
 * Structured reason picklist for "Separately Payable" resolution.
 * "Different layer" is intentionally omitted (if layers differ we show the
 * legacy-layer warning instead and route through the Incidental path).
 */
const PAYABLE_REASONS = [
  { value: "Vegetation regrowth / repeat clearing", label: "Vegetation regrowth / repeat clearing" },
  { value: "Re-measurement after approved correction", label: "Re-measurement after approved correction" },
  { value: "Genuine separately payable repeated operation", label: "Genuine separately payable repeated operation" },
  { value: "other", label: "Other (specify below)" },
] as const;

type PayableReasonKey = typeof PAYABLE_REASONS[number]["value"];

/** Check if the layer difference is only because one is null (legacy-layer warning). */
function isLegacyLayerOnlyDiff(a: ComputedEntry, b: ComputedEntry): boolean {
  const la = a.layerNo ?? null;
  const lb = b.layerNo ?? null;
  if (la === null && lb === null) return false; // no layer data at all
  if (la !== null && lb !== null && la !== lb) return false; // both non-null and different → real layer diff (no warning)
  // Exactly one is null → "legacy-layer" situation
  return la === null || lb === null;
}

function EntryMiniCard({ entry, item, state, side }: { entry: ComputedEntry; item: ReportItem; state: ProgressReportState; side: "A" | "B" }) {
  return (
    <div className={`rounded border p-2.5 text-xs space-y-0.5 ${side === "A" ? "border-blue-200 bg-blue-50" : "border-violet-200 bg-violet-50"}`}>
      <div className="font-semibold text-slate-800">{side === "A" ? "Entry A" : "Entry B"}</div>
      <div><span className="text-slate-500">DPR:</span> <Link href={dprLinkWithReturn(entry.dprId, state)} className="text-blue-600 hover:underline">DPR-{entry.dprId}</Link> · {entry.dprDate}</div>
      {(entry as any).activity && <div><span className="text-slate-500">Activity:</span> {(entry as any).activity}</div>}
      <div><span className="text-slate-500">BOQ item:</span> {itemLabel(item.boqItem)}</div>
      <div><span className="text-slate-500">Side:</span> {entry.side ?? "—"} · <span className="text-slate-500">From:</span> {entry.chainageFrom ?? "—"} · <span className="text-slate-500">To:</span> {entry.chainageTo ?? "—"}</div>
      {entry.layerNo != null && <div><span className="text-slate-500">Layer:</span> {layerDisplayName(itemLabel(item.boqItem), entry.layerNo)}</div>}
      <div>
        <span className="text-slate-500">Credited qty:</span>{" "}
        {entry.isIncidental
          ? <span className="text-purple-700 font-semibold">Incidental (no credit)</span>
          : entry.boqCreditQty != null ? `${fmt(entry.boqCreditQty, 4)} ${item.boqItem.unit}` : "—"}
      </div>
      {(entry as any).chainageOverrideReason && (
        <div className="text-amber-700"><span className="font-semibold">Override reason:</span> {(entry as any).chainageOverrideReason}</div>
      )}
      {entry.isIncidental && (
        <div className="text-purple-700"><span className="font-semibold">Incidental:</span> {entry.incidentalDescription ?? "(no description)"}</div>
      )}
      {entry.noSiteWork && (
        <div className="text-slate-700">
          <span className="font-semibold">No Site Work:</span> {entry.noSiteWorkDescription ?? "(no reason recorded)"}
        </div>
      )}
    </div>
  );
}

type BothValidStep = "choice" | "incidental" | "payable" | null;

/**
 * Instruction 06X: apply a classification-only PATCH to a single progress
 * entry via the narrow endpoint.  No full-DPR fetch, no version POST.
 * The endpoint does not run DPR readiness or overlap gates.
 */
async function patchOverlapResolution(
  entryId: number,
  payload: { isIncidental: true; incidentalDescription: string } | { chainageOverrideReason: string },
): Promise<void> {
  // apiRequest throws on non-OK via throwIfResNotOk
  await apiRequest("PATCH", `/api/progress-entries/${entryId}/overlap-resolution`, payload);
}

/**
 * Deterministic fallback description used when the entry has no existing
 * incidental description.
 */
const INCIDENTAL_FALLBACK_DESC = "Classified as incidental during overlap review";

/**
 * Invalidate all progress-report and DPR queries after a successful
 * overlap resolution so the report data refreshes automatically.
 */
function invalidateProgressQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ predicate: (q) => {
    const key = String(q.queryKey[0] ?? "");
    return key.startsWith("/api/reports/progress") || key.startsWith("/api/dprs");
  }});
}

function OverlapPairRow({
  pair, item, state, update,
}: {
  pair: OverlapPair;
  item: ReportItem;
  state: ProgressReportState;
  update: (p: Partial<ProgressReportState>) => void;
}) {
  const [dialogStep, setDialogStep] = useState<BothValidStep>(null);
  const [payableReason, setPayableReason] = useState<PayableReasonKey>("Genuine separately payable repeated operation");
  const [payableOther, setPayableOther] = useState("");

  const legacyLayer = isLegacyLayerOnlyDiff(pair.a, pair.b);
  const pairKey = `${pair.a.entryId}:${pair.b.entryId}`;

  const handleBothValidClick = () => setDialogStep("choice");

  const handleChoiceIncidental = () => setDialogStep("incidental");
  const handleChoicePayable = () => {
    if (legacyLayer) return; // should not happen — guarded in JSX
    setDialogStep("payable");
  };

  return (
    <div
      className={`border rounded p-3 space-y-2 bg-white outline-none ${state.overlapAnchor === pairKey ? "ring-2 ring-purple-500 ring-offset-2" : ""}`}
      data-testid={`overlap-pair-${pairKey}`}
      id={`overlap-pair-${pairKey}`}
      tabIndex={-1}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-orange-700 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Possible overlap: {formatChainageKm(pair.segFromKm)} – {formatChainageKm(pair.segToKm)}
          {legacyLayer && (
            <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 border border-amber-300 rounded px-1.5 py-0.5 font-normal" data-testid="legacy-layer-badge">
              Legacy-layer data — one entry has no layer recorded
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <EntryMiniCard entry={pair.a} item={item} state={state} side="A" />
        <EntryMiniCard entry={pair.b} item={item} state={state} side="B" />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="text-xs px-2.5 py-1 rounded border border-green-300 text-green-800 bg-green-50 hover:bg-green-100"
          onClick={handleBothValidClick}
          data-testid={`btn-both-valid-${pairKey}`}
        >
          Both are valid
        </button>
        <Link href={dprLinkWithReturn(pair.a.dprId, state)} className="text-xs px-2.5 py-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
          View DPR-{pair.a.dprId}
        </Link>
        <Link href={dprLinkWithReturn(pair.b.dprId, state)} className="text-xs px-2.5 py-1 rounded border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100">
          View DPR-{pair.b.dprId}
        </Link>
      </div>

      {/* Two-step dialog */}
      <Dialog open={dialogStep !== null} onOpenChange={(open) => { if (!open) setDialogStep(null); }}>
        <DialogContent className="max-w-lg">
          {dialogStep === "choice" && (
            <>
              <DialogHeader>
                <DialogTitle>Both entries are valid — how should they be classified?</DialogTitle>
                <DialogDescription>
                  Select how to classify these two overlapping entries. This will navigate you to
                  the DPR edit page to apply the classification — nothing is saved yet.
                </DialogDescription>
              </DialogHeader>
              {legacyLayer && (
                <div className="rounded bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-800">
                  <strong>Legacy-layer warning:</strong> One of these entries has no layer number recorded.
                  If the work was genuinely on a different layer, please edit the entry without a layer number
                  to add the correct layer before resolving the overlap. The "Separately Payable" option is
                  unavailable until both entries have explicit layer numbers.
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 mt-2">
                <button
                  type="button"
                  className="flex flex-col items-start gap-0.5 rounded border-2 border-purple-500 bg-purple-50 p-3 text-sm text-left hover:bg-purple-100 transition-colors"
                  onClick={handleChoiceIncidental}
                  data-testid="dialog-choose-incidental"
                >
                  <span className="font-semibold text-purple-800">
                    Mark as Incidental
                    <span className="ml-1 rounded bg-purple-200 px-1.5 py-0.5 text-[10px] uppercase">Safer default</span>
                  </span>
                  <span className="text-slate-500 text-xs">
                    One of the entries will be marked as incidental work — it will be recorded for site history
                    but will earn no BOQ credit going forward.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={legacyLayer}
                  className={`flex flex-col items-start gap-0.5 rounded border p-3 text-sm text-left transition-colors ${legacyLayer ? "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed" : "border-emerald-300 hover:bg-emerald-50"}`}
                  onClick={handleChoicePayable}
                  data-testid="dialog-choose-payable"
                >
                  <span className="font-semibold">Separately Payable</span>
                  <span className="text-xs text-slate-500">
                    Both entries are genuine separately-payable work. A structured reason is required.
                    {legacyLayer && " (Unavailable until layer data is corrected.)"}
                  </span>
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogStep(null)}>Cancel</Button>
              </DialogFooter>
            </>
          )}

          {dialogStep === "incidental" && (
            <_IncidentalStep
              pair={pair}
              item={item}
              state={state}
              pairKey={pairKey}
              onBack={() => setDialogStep("choice")}
              onDone={() => setDialogStep(null)}
            />
          )}

          {dialogStep === "payable" && (
            <_PayableStep
              pair={pair}
              item={item}
              state={state}
              pairKey={pairKey}
              payableReason={payableReason}
              setPayableReason={setPayableReason}
              payableOther={payableOther}
              setPayableOther={setPayableOther}
              onBack={() => setDialogStep("choice")}
              onDone={() => setDialogStep(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function _IncidentalStep({
  pair, item, state, pairKey, onBack, onDone,
}: {
  pair: OverlapPair;
  item: ReportItem;
  state: ProgressReportState;
  pairKey: string;
  onBack: () => void;
  /** Called after a successful save to close the dialog and stay on report. */
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const suggested: "a" | "b" =
    pair.a.dprDate > pair.b.dprDate || (pair.a.dprDate === pair.b.dprDate && pair.a.dprId > pair.b.dprId)
      ? "a" : "b";
  const [selected, setSelected] = useState<"a" | "b">(suggested);

  const selectedEntry = selected === "a" ? pair.a : pair.b;

  const mutation = useMutation({
    mutationFn: () => {
      // Reuse existing description when non-blank; otherwise use a deterministic fallback.
      const desc =
        typeof (selectedEntry as any).incidentalDescription === "string" &&
        (selectedEntry as any).incidentalDescription.trim()
          ? (selectedEntry as any).incidentalDescription.trim()
          : INCIDENTAL_FALLBACK_DESC;
      return patchOverlapResolution(selectedEntry.entryId, {
        isIncidental: true,
        incidentalDescription: desc,
      });
    },
    onSuccess: () => {
      invalidateProgressQueries(queryClient);
      toast({ title: "Marked as incidental", description: `Entry in DPR-${selectedEntry.dprId} updated — report will refresh.` });
      onDone();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Unexpected error";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
      // dialog stays open
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark as Incidental — which entry?</DialogTitle>
        <DialogDescription>
          Select which entry should be marked as incidental (no BOQ credit). The suggestion is
          pre-selected below but you must confirm before saving.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2 my-2">
        {(["a", "b"] as const).map((side) => {
          const entry = side === "a" ? pair.a : pair.b;
          const isSelected = selected === side;
          // Suggest the later (chronologically) entry as the incidental one
          const isSuggested = entry.dprDate > (side === "a" ? pair.b : pair.a).dprDate
            || (entry.dprDate === (side === "a" ? pair.b : pair.a).dprDate && entry.dprId > (side === "a" ? pair.b : pair.a).dprId);
          return (
            <button
              key={side}
              type="button"
              disabled={mutation.isPending}
              className={`rounded border p-2.5 text-left text-xs transition-colors ${isSelected ? "border-purple-500 bg-purple-50 ring-2 ring-purple-300" : "border-slate-200 hover:border-purple-300"}`}
              onClick={() => setSelected(side)}
              data-testid={`incidental-choose-${side}-${pairKey}`}
            >
              <div className="font-semibold flex items-center gap-1">
                {side === "a" ? "Entry A" : "Entry B"}
                {isSuggested && <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 rounded px-1">Suggested</span>}
              </div>
              <div><Link href={dprLinkWithReturn(entry.dprId, state)} className="text-blue-600 hover:underline">DPR-{entry.dprId}</Link> · {entry.dprDate}</div>
              {(entry as any).activity && <div>Activity: {(entry as any).activity}</div>}
              <div>{entry.chainageFrom ?? "—"} – {entry.chainageTo ?? "—"} {entry.side ?? ""}</div>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-slate-600 rounded bg-slate-50 border px-3 py-2">
        <strong>Saving:</strong> DPR-{selectedEntry.dprId} · Entry {selectedEntry.entryId} — the entry will be saved as
        incidental and the report will refresh automatically.
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onBack} disabled={mutation.isPending}>← Back</Button>
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          data-testid={`confirm-incidental-${pairKey}`}
        >
          {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Saving…</> : "Confirm — Mark Incidental"}
        </Button>
      </DialogFooter>
    </>
  );
}

function _PayableStep({
  pair, item, state, pairKey, payableReason, setPayableReason, payableOther, setPayableOther, onBack, onDone,
}: {
  pair: OverlapPair;
  item: ReportItem;
  state: ProgressReportState;
  pairKey: string;
  payableReason: PayableReasonKey;
  setPayableReason: (v: PayableReasonKey) => void;
  payableOther: string;
  setPayableOther: (v: string) => void;
  onBack: () => void;
  /** Called after a successful save to close the dialog and stay on report. */
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<"a" | "b">("b");

  const canConfirm = payableReason !== "other" || payableOther.trim().length > 0;
  const selectedEntry = selected === "a" ? pair.a : pair.b;

  const mutation = useMutation({
    mutationFn: () => {
      // PAYABLE_REASONS uses lowercase "other"; buildReason uses OTHER_VALUE ("Other").
      // Normalise so free-text elaboration is correctly selected.
      const normalisedPick = payableReason === "other" ? OTHER_VALUE : payableReason;
      const reason = buildReason(normalisedPick, payableOther);
      return patchOverlapResolution(selectedEntry.entryId, {
        chainageOverrideReason: reason,
      });
    },
    onSuccess: () => {
      invalidateProgressQueries(queryClient);
      toast({ title: "Reason recorded", description: `Entry in DPR-${selectedEntry.dprId} updated — report will refresh.` });
      onDone();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Unexpected error";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
      // dialog stays open
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Separately Payable — provide a reason</DialogTitle>
        <DialogDescription>
          Select the entry to annotate and provide a structured reason. The reason is saved
          directly — the report will refresh automatically.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 my-1">
        <div>
          <div className="text-xs font-medium text-slate-700 mb-1">Entry to annotate</div>
          <div className="grid grid-cols-2 gap-2">
            {(["a", "b"] as const).map((side) => {
              const entry = side === "a" ? pair.a : pair.b;
              return (
                <button
                  key={side}
                  type="button"
                  disabled={mutation.isPending}
                  className={`rounded border p-2 text-left text-xs transition-colors ${selected === side ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300" : "border-slate-200 hover:border-emerald-300"}`}
                  onClick={() => setSelected(side)}
                  data-testid={`payable-choose-${side}-${pairKey}`}
                >
                  <div className="font-semibold">{side === "a" ? "Entry A" : "Entry B"}</div>
                  <div>DPR-{entry.dprId} · {entry.dprDate}</div>
                  {(entry as any).activity && <div>{(entry as any).activity}</div>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-700 mb-1">Reason</div>
          <Select value={payableReason} onValueChange={(v) => setPayableReason(v as PayableReasonKey)} disabled={mutation.isPending}>
            <SelectTrigger data-testid="payable-reason-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYABLE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {payableReason === "other" && (
            <Input
              className="mt-1.5 text-sm"
              placeholder="Describe the reason…"
              value={payableOther}
              onChange={(e) => setPayableOther(e.target.value)}
              disabled={mutation.isPending}
              data-testid="payable-other-input"
            />
          )}
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onBack} disabled={mutation.isPending}>← Back</Button>
        <Button
          disabled={!canConfirm || mutation.isPending}
          onClick={() => mutation.mutate()}
          data-testid={`confirm-payable-${pairKey}`}
        >
          {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Saving…</> : "Confirm — Record Reason"}
        </Button>
      </DialogFooter>
    </>
  );
}

function OverlapReview({
  item, pairs, state, update, open, onToggle,
}: {
  item: ReportItem;
  pairs: OverlapPair[];
  state: ProgressReportState;
  update: (p: Partial<ProgressReportState>) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border rounded-lg bg-orange-50/50">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-orange-800 hover:bg-orange-100/50 rounded-lg transition-colors"
        onClick={onToggle}
        data-testid="overlap-review-toggle"
      >
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          Overlap Review — {pairs.length} {pairs.length === 1 ? "pair" : "pairs"} of possible overlapping entries
        </span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-slate-600">
            Each pair below has chainage ranges that intersect. Review both entries and decide whether
            they are incidental, separately payable, or require correction.
            <strong className="ml-1">A classification is saved only after you confirm it</strong>; DPR links remain available for any correction work.
          </p>
          {pairs.map((pair) => (
            <OverlapPairRow
              key={`${pair.a.entryId}:${pair.b.entryId}`}
              pair={pair}
              item={item}
              state={state}
              update={update}
            />
          ))}
        </div>
      )}
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
                <tr key={`${e.kind}:${e.entryId}`} className={`border-t ${e.isIncidental ? "bg-purple-50 italic" : ""}`} data-testid={`row-ch-${e.kind}-${e.entryId}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{e.dprDate}</td>
                  <td className="px-2 py-1.5 max-w-xs font-medium">{itemLabel(item)}</td>
                  <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.chainageFrom ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.chainageTo ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                  <td className="px-2 py-1.5 text-right not-italic">
                    {e.isIncidental
                      ? <span className="text-purple-700 text-[10px]">incidental</span>
                      : (e.converted && e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.unit}` : "")}
                  </td>
                  <td className="px-2 py-1.5 not-italic"><Link href={dprLinkWithReturn(e.dprId, state)} className="text-blue-600 hover:underline">DPR-{e.dprId}</Link></td>
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
                  <tr key={`${e.kind}:${e.entryId}`} className={`border-t ${e.isIncidental ? "bg-purple-50 italic" : ""}`} data-testid={`row-date-${e.kind}-${e.entryId}`}>
                    <td className="px-2 py-1.5 max-w-xs font-medium">{itemLabel(item)}</td>
                    <td className="px-2 py-1.5">{e.side ?? "—"}</td>
                    <td className="px-2 py-1.5">{e.chainageFrom ? `${e.chainageFrom} – ${e.chainageTo ?? ""}` : (e.location ?? "—")}</td>
                    <td className="px-2 py-1.5 text-right">{e.quantity != null ? `${fmt(e.quantity)} ${e.uom ?? ""}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right not-italic">
                      {e.isIncidental
                        ? <span className="text-purple-700 text-[10px]">incidental</span>
                        : (e.converted && e.boqCreditQty != null ? `${fmt(e.boqCreditQty, 4)} ${item.unit}` : "")}
                    </td>
                    <td className="px-2 py-1.5 not-italic"><Link href={dprLinkWithReturn(e.dprId, state)} className="text-blue-600 hover:underline">DPR-{e.dprId}</Link></td>
                    <td className="px-2 py-1.5 text-slate-500">{e.engineer ?? "—"}</td>
                    <td className="px-2 py-1.5 max-w-xs text-slate-500">
                      {e.isIncidental && <span className="text-purple-700 not-italic">Incidental{e.incidentalDescription ? `: ${e.incidentalDescription}` : ""}</span>}
                      {!e.isIncidental && e.remarks}
                    </td>
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
