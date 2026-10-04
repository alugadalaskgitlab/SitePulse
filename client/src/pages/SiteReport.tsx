import { useMemo, useState } from "react";
import { useDpr } from "@/hooks/use-dprs";
import { Link, useRoute, useLocation, useSearch } from "wouter";
import { DPR_REGISTER_PATH, resolveReturnTo, withReturnTo } from "@/lib/progressReportNav";
import { ChevronLeft, Printer } from "lucide-react";
import { EditPermissionButton } from "@/components/EditPermissionButton";
import CancelDialog from "@/components/CancelDialog";
import HistoryDialog from "@/components/HistoryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { DprMaterialsReceived } from "@/components/DprMaterialsReceived";
import type { Personnel, Site } from "@shared/schema";
import { lifecycleByUsageId, lifecycleLabel, linkedUsageId, type EquipmentDestinationType } from "@/lib/equipmentLifecycle";
import { ProgrammeBarOutcomeHistory } from "@/components/ProgrammeBarOutcomeHistory";
import { DprEquipmentReadOnlyRow, DprEquipmentReadOnlyTable } from "@/components/DprEquipmentReadOnlyRow";
import { hasCompleteDprPerformanceContext, resolveDprActualEfficiency } from "@/lib/dprEquipmentEfficiency";
import { useDprEquipmentPerformance } from "@/hooks/use-dpr-equipment-performance";
import { DprActivityReadOnly } from "@/components/DprActivityReadOnly";
import { useDprBoqItems } from "@/hooks/use-dpr-boq-items";
import { isVisibleEquipmentRow } from "@shared/equipmentUsage";
import { getBaseSiteName } from "@shared/siteName";
import { useDprMaterialReceipts } from "@/hooks/use-dpr-material-receipts";
import { buildManagementShare, managementNumber, managementReceivedEntry, managementReceivedGroups, managementSummaryList, managementWorkEntries, shareManagementReport } from "@/lib/dprManagementPresentation";
import "@/components/dprManagement.css";

export default function SiteReport() {
  const [, params] = useRoute("/site/report/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: dpr, isLoading, error, refetch } = useDpr(id);
  const { toast } = useToast();
  const { sectionCan, user } = useAuth();
  const canEdit = sectionCan("site_dprs", "edit");
  const canDelete = !!user?.isAdmin;
  const canViewPerformance = sectionCan("equipment_performance_report", "view") || sectionCan("plant_equipment", "view");
  const completePerformanceContext = hasCompleteDprPerformanceContext(user);
  const performance = useDprEquipmentPerformance(dpr, canViewPerformance, user?.id, completePerformanceContext);
  const { data: personnelList } = useQuery<Personnel[]>({ queryKey: ["/api/personnel"] });
  const { data: sites = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const { items: reportBoqItems } = useDprBoqItems<any>({
    siteName: getBaseSiteName(dpr?.site ?? ""), sites, preferredProjectId: dpr?.boqProjectId ?? null,
  });
  const receipts = useDprMaterialReceipts(dpr?.site ?? "", dpr?.date ?? "");
  const searchString = useSearch();
  const backLink = resolveReturnTo(searchString || (typeof window !== "undefined" ? window.location.search : ""), DPR_REGISTER_PATH);
  const reportHref = withReturnTo(`/site/report/${id}`, backLink);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [movingUsageId, setMovingUsageId] = useState<number | null>(null);
  const [moveDestination, setMoveDestination] = useState("");
  const [successorDate, setSuccessorDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shareText, setShareText] = useState<string | null>(null);
  const linkedUsageIds = useMemo(() => Array.from(new Set(
    (dpr?.equipment ?? []).map((row: any) => linkedUsageId(row)).filter((value): value is number => value != null),
  )), [dpr?.equipment]);
  const { data: lifecyclePayload } = useQuery<unknown>({
    queryKey: ["/api/equipment-usage/lifecycle", linkedUsageIds.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/equipment-usage/lifecycle?ids=${encodeURIComponent(linkedUsageIds.join(","))}`, { credentials: "include" });
      if (!res.ok) throw new Error("Lifecycle is unavailable");
      return res.json();
    }, enabled: linkedUsageIds.length > 0,
  });
  const lifecycle = useMemo(() => lifecycleByUsageId(lifecyclePayload), [lifecyclePayload]);
  const dprEquipmentLogIds = useMemo(() => (dpr?.equipment ?? []).map((row: any) => Number(row.id)).filter(Number.isInteger), [dpr?.equipment]);
  const { data: equipmentMaster = [] } = useQuery<any[]>({
    queryKey: ["/api/plant-module/equipment", "report"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/equipment?includeInactive=true", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });
  const { data: linkedBreakdowns = [] } = useQuery<any[]>({
    queryKey: ["/api/maintenance/logs", "dpr_log", dprEquipmentLogIds.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/maintenance/logs?sourceType=dpr_log&sourceRecordIds=${encodeURIComponent(dprEquipmentLogIds.join(","))}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    }, enabled: dprEquipmentLogIds.length > 0,
  });
  const equipmentById = useMemo(() => new Map(equipmentMaster.map((item: any) => [item.id, item])), [equipmentMaster]);
  const breakdownsBySourceId = useMemo(() => {
    const result = new Map<number, any[]>();
    linkedBreakdowns.forEach(log => {
      if (log.sourceRecordId == null) return;
      const rows = result.get(Number(log.sourceRecordId)) ?? [];
      rows.push(log); result.set(Number(log.sourceRecordId), rows);
    });
    return result;
  }, [linkedBreakdowns]);
  const moveMutation = useMutation({
    mutationFn: async ({ usageId, destinationType, destinationSite }: { usageId: number; destinationType: EquipmentDestinationType; destinationSite?: string }) => {
      const response = await apiRequest("POST", `/api/equipment-usage/${usageId}/move`, {
        destinationType, ...(destinationSite ? { destinationSite } : {}), successorDate,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-usage/lifecycle"] });
      setMovingUsageId(null); setMoveDestination("");
      toast({ title: "Equipment sent onward", description: "The completed source segment remains unchanged." });
    },
    onError: (error: Error) => toast({ title: "Could not move equipment", description: error.message, variant: "destructive" }),
  });
  const submitMove = () => {
    if (movingUsageId == null || !moveDestination) return;
    const destinationType: EquipmentDestinationType = moveDestination === "__hmp__" ? "hmp" : moveDestination === "__rmc__" ? "rmc" : "site";
    moveMutation.mutate({ usageId: movingUsageId, destinationType, destinationSite: destinationType === "site" ? moveDestination : undefined });
  };
  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/dprs/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({ title: "Report Deleted", description: "The report has been deleted." }); setLocation(backLink);
    }, onError: () => toast({ title: "Error", description: "Failed to delete report", variant: "destructive" }),
  });
  const handleEditClick = () => {
    if (canEdit) {
      const role = user?.isAdmin ? "admin" : "manager";
      sessionStorage.setItem(`edit_pin_${id}`, role); sessionStorage.setItem(`auth_role_${id}`, role);
      setLocation(withReturnTo(`/site/edit/${id}`, reportHref));
    }
  };
  if (isLoading) return <div className="dpr-management space-y-4" role="status" aria-label="Loading report">{[1, 2, 3].map(n => <div key={n} className="h-24 rounded bg-muted/50" />)}</div>;
  if (error || !dpr) return <div className="dpr-management" role="alert">Failed to load report. <Button variant="outline" onClick={() => refetch()}>Retry</Button></div>;
  const visibleEquipment = dpr.equipment.map((item: any) => ({
    ...item, breakdowns: item.breakdowns ?? breakdownsBySourceId.get(Number(item.id)) ?? [],
  })).filter(isVisibleEquipmentRow);
  const totalDiesel = visibleEquipment.reduce((sum: number, e: any) => sum + (Number(e.diesel) || 0), 0);
  const headcount = dpr.labour.reduce((sum: number, row: any) => sum + (Number(row.count) || 0), 0);
  const activities = (dpr as any).workType === "structure" ? ((dpr as any).structureItems ?? []).map((item: any) => ({ ...item, kind: "structure", activity: item.itemOfWork })) : dpr.progress;
  const workItems = managementWorkEntries(activities, reportBoqItems);
  const workSummary = workItems.length > 1 ? `${workItems.length} items` : workItems.length === 1
    ? workItems[0].quantity : "No site work";
  const working = visibleEquipment.filter((row: any) => row.usageStatus === "working").length;
  const bulk = managementReceivedGroups(receipts.data ?? []).filter(group => group.totalQty !== 0);
  const hasHours = dpr.labour.some((row: any) => row.hours != null);
  const issues = (dpr.materials ?? []).filter((row: any) => row.type === "Issued" || row.type === "Consumed");
  const handleShare = async () => {
    const text = buildManagementShare(dpr, visibleEquipment, receipts.data ?? [], reportBoqItems);
    try {
      const result = await shareManagementReport(text);
      if (result === "copied") toast({ title: "DPR summary copied" });
    } catch { setShareText(text); toast({ title: "Select and copy the summary", description: "Sharing is unavailable in this browser." }); }
  };
  const movingIndex = visibleEquipment.findIndex((row: any) => linkedUsageId(row) === movingUsageId);
  return <article className="dpr-management">
    <header className="dpr-management-header">
      <div>
        <Link href={backLink} className="inline-flex items-center text-xs text-muted-foreground mb-2 print:hidden" data-testid="button-back"><ChevronLeft className="w-4 h-4" /> Back</Link>
        <h1>{dpr.site}</h1>
        <p className="dpr-management-subtle mt-1">Daily Progress Report · {format(parseISO(dpr.date.slice(0, 10)), "EEE dd MMM yyyy")} · DPR #{dpr.id} · Engineer: {dpr.engineer} · <strong className="text-foreground">{(dpr as any).dprStatus || "Submitted"}</strong></p>
      </div>
      <div className="dpr-management-actions print:hidden">
        <Button size="sm" variant="outline" onClick={() => window.print()} data-testid="button-print"><Printer className="w-4 h-4 mr-1" />Print / PDF</Button>
        <Button size="sm" variant="outline" onClick={handleShare} data-testid="button-share-whatsapp" disabled={receipts.isPending || receipts.isError}>Share on WhatsApp</Button>
        {canEdit && <EditPermissionButton recordType="dpr" recordId={id} onEditGranted={handleEditClick} label="Edit" size="sm" variant="secondary" />}
      </div>
    </header>
    <div className="dpr-management-summary">
      <div><strong>{workSummary}</strong><span className="dpr-management-subtle">Work done{workItems.length === 1 && ` · ${workItems[0].name}${workItems[0].marker}`}</span>
        {workItems.length > 1 && <span className="dpr-management-summary-list">{managementSummaryList(workItems.map(item => `${item.shortName} ${item.quantity}${item.marker}`))}</span>}
      </div>
      {working > 0 && <div><strong>{working} / {visibleEquipment.length}</strong><span className="dpr-management-subtle">Machines working</span></div>}
      {totalDiesel > 0 && <div><strong>{managementNumber(totalDiesel, 1)} L</strong><span className="dpr-management-subtle">Diesel issued</span></div>}
      {headcount > 0 && <div><strong>{headcount}</strong><span className="dpr-management-subtle">Labour</span></div>}
      {bulk.length > 0 && <div><strong>{bulk.length === 1 ? `${managementNumber(bulk[0].totalQty)} ${bulk[0].uom}` : `${bulk.length} materials`}</strong><span className="dpr-management-subtle">Bulk received{bulk.length === 1 ? ` · ${bulk[0].material} · ${bulk[0].tripCount} trips` : ""}</span>
        {bulk.length > 1 && <span className="dpr-management-summary-list">{managementSummaryList(bulk.map(managementReceivedEntry))}</span>}
      </div>}
    </div>
    <section><h2>Work done</h2>
      {!activities.length ? <p className="dpr-management-subtle">No site work</p> : <table className="dpr-management-table dpr-work-table" aria-label="Work done">
        <thead><tr>{["Item", "Chainage from → to", "Size (L × W × T)", "Quantity", "Programme"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{activities.map((item: any, i: number) => <DprActivityReadOnly management key={item.entryKey ?? item.id ?? i} item={item} index={i} boqItem={reportBoqItems.find((b: any) => b.id === item.boqItemId)} nameStyle="activity"
          personnelNames={item.personnelIds?.map((pid: number) => personnelList?.find(p => p.id === pid)?.name).filter(Boolean).join(", ")}>
          {item.programmeBarId != null && <ProgrammeBarOutcomeHistory management projectId={(dpr as any).boqProjectId} boqItemId={item.boqItemId} programmeBarId={Number(item.programmeBarId)} testidPrefix={`progress-${i}`} />}
        </DprActivityReadOnly>)}</tbody>
      </table>}
    </section>
    <section><h2>Equipment</h2>
      {!visibleEquipment.length ? <p className="dpr-management-subtle">No equipment usage recorded.</p> : <DprEquipmentReadOnlyTable management rows={visibleEquipment} equipmentFor={row => equipmentById.get(row.equipmentId)}
        canonicalFor={row => resolveDprActualEfficiency({ dpr, row, report: performance.data, canView: canViewPerformance, hasCompleteContext: completePerformanceContext, isLoading: performance.isLoading || performance.isFetching, error: performance.error })}>
        {visibleEquipment.map((item: any, i: number) => {
          const usageId = linkedUsageId(item);
          const usageLifecycle = usageId != null ? lifecycle.get(usageId) : undefined;
          const lifecycleText = lifecycleLabel(usageLifecycle);
          const canMove = canEdit
                      && usageId != null
                      && usageLifecycle?.status === "closed"
                      && usageLifecycle.successorId == null;
          return <DprEquipmentReadOnlyRow management key={item.id ?? i} row={item} equipment={equipmentById.get(item.equipmentId)} index={i} boqItems={reportBoqItems}
            canonical={resolveDprActualEfficiency({ dpr, row: item, report: performance.data, canView: canViewPerformance, hasCompleteContext: completePerformanceContext, isLoading: performance.isLoading || performance.isFetching, error: performance.error })}
            lifecycleSlot={lifecycleText ? <div className="flex flex-wrap gap-1 items-center">
              <Badge variant={usageLifecycle?.status === "open" ? "secondary" : "outline"} data-testid={`badge-equipment-lifecycle-${i}`}>{lifecycleText}</Badge>
              {canMove && <Button size="sm" variant="outline" onClick={() => { setMovingUsageId(usageId); setSuccessorDate(dpr.date); }} data-testid={`button-move-equipment-${i}`}>Send onward</Button>}
            </div> : undefined} />;
        })}
      </DprEquipmentReadOnlyTable>}
    </section>
    <div className="dpr-management-columns">
      <section><h2>Labour</h2>{!dpr.labour.length ? <p className="dpr-management-subtle">No labour recorded.</p> : <table className="dpr-management-table" aria-label="Labour">
        <thead><tr><th>Gang / contractor</th><th>Category (+ gender)</th><th>Count</th>{hasHours && <th>Hours</th>}<th>Task</th></tr></thead>
        <tbody>{dpr.labour.map((item: any, i: number) => <tr key={item.id ?? i} data-testid={`row-labour-${i}`}>
          <td data-label="Gang / contractor">{item.contractor || ""}</td><td data-label="Category (+ gender)">{[item.category, item.gender].filter(Boolean).join(" · ")}</td>
          <td data-label="Count"><strong>{item.count}</strong></td>{hasHours && <td data-label="Hours">{item.hours == null ? "" : `${managementNumber(item.hours, 1)} h`}</td>}<td data-label="Task">{item.task || ""}</td>
        </tr>)}</tbody>
        <tfoot><tr><td colSpan={2}>Total</td><td data-label="Count">{headcount}</td>{hasHours && <td />}<td /></tr></tfoot>
      </table>}</section>
      <DprMaterialsReceived management site={dpr.site} date={dpr.date} issues={issues} purchases={dpr.sitePurchases ?? []} />
    </div>
    <section><h2>Remarks / hold-ups</h2><p className="whitespace-pre-wrap break-words" data-testid="dpr-remarks">{(dpr as any).remarks?.trim() || "— none recorded —"}</p></section>
    <nav className="flex flex-wrap gap-2 mt-4 print:hidden" aria-label="Report administration">
      <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)} data-testid="button-history">History</Button>
      {canEdit && <Button size="sm" variant="ghost" onClick={() => setShowCancel(true)} data-testid="button-cancel-dpr">Cancel report</Button>}
      {canDelete && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setShowDeleteConfirm(true)} disabled={deleteMutation.isPending} data-testid="button-admin-delete">Delete</Button>}
      <Link href="/" className="text-xs text-muted-foreground self-center" data-testid="button-home">Home</Link>
    </nav>
    <Dialog open={movingUsageId != null} onOpenChange={open => { if (!open) { setMovingUsageId(null); setMoveDestination(""); } }}>
      <DialogContent className="dpr-management-dialog"><DialogTitle>Send equipment onward</DialogTitle><DialogDescription>Choose the destination and next start date.</DialogDescription>
        <Select value={moveDestination} onValueChange={setMoveDestination}><SelectTrigger data-testid={`select-move-destination-${movingIndex}`}><SelectValue placeholder="Send to…" /></SelectTrigger><SelectContent>
          <SelectItem value="__hmp__">HMP Plant</SelectItem><SelectItem value="__rmc__">RMC Plant</SelectItem>{sites.filter(site => site.isActive === 1).map(site => <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>)}
        </SelectContent></Select>
        <Input type="date" value={successorDate} onChange={event => setSuccessorDate(event.target.value)} data-testid={`input-successor-date-${movingIndex}`} />
        <Button size="sm" onClick={submitMove} disabled={!moveDestination || moveMutation.isPending} data-testid={`button-confirm-move-${movingIndex}`}>{moveMutation.isPending ? "Sending…" : "Send"}</Button>
        <Button variant="ghost" onClick={() => { setMovingUsageId(null); setMoveDestination(""); }}>Cancel</Button>
      </DialogContent>
    </Dialog>
    <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}><DialogContent><DialogTitle>Delete report?</DialogTitle><DialogDescription>This action cannot be undone.</DialogDescription><Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => { deleteMutation.mutate(); setShowDeleteConfirm(false); }}>Delete</Button></DialogContent></Dialog>
    <Dialog open={shareText != null} onOpenChange={open => { if (!open) setShareText(null); }}><DialogContent className="dpr-management-dialog"><DialogTitle>DPR summary</DialogTitle><DialogDescription>Select and copy this summary.</DialogDescription><textarea readOnly value={shareText ?? ""} className="w-full min-h-64 border p-2 text-sm" onFocus={e => e.target.select()} /></DialogContent></Dialog>
    <CancelDialog open={showCancel} onOpenChange={setShowCancel} cancelUrl={`/api/dprs/${id}/cancel`} recordLabel={`DPR for ${dpr.site} (${dpr.date})`} invalidateQueryKeys={["/api/dprs", ["/api/dprs", id]]} />
    <HistoryDialog open={showHistory} onOpenChange={setShowHistory} module="dprs" transactionId={id} recordLabel={`DPR for ${dpr.site} (${dpr.date})`} />
  </article>;
}