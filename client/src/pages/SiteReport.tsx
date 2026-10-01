import { useMemo, useState } from "react";
import { useDpr } from "@/hooks/use-dprs";
import { Link, useRoute, useLocation, useSearch } from "wouter";
import { DPR_REGISTER_PATH, resolveReturnTo, withReturnTo } from "@/lib/progressReportNav";
import { ChevronLeft, Loader2, Printer, Trash2, Fuel, Home, ShoppingCart, History, Ban } from "lucide-react";
import { EditPermissionButton } from "@/components/EditPermissionButton";
import { LabourWorkerNamesReadOnly } from "@/components/LabourWorkerNames";
import CancelDialog from "@/components/CancelDialog";
import HistoryDialog from "@/components/HistoryDialog";
import { ReportHeader } from "@/components/ReportHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { DprPhotoGroups } from "@/components/DprPhotoGroups";
import { DprMaterialsReceived } from "@/components/DprMaterialsReceived";
import type { Personnel, Site } from "@shared/schema";
import {
  lifecycleByUsageId,
  lifecycleLabel,
  linkedUsageId,
  type EquipmentDestinationType,
} from "@/lib/equipmentLifecycle";
import { ProgrammeBarOutcomeHistory } from "@/components/ProgrammeBarOutcomeHistory";
import { buildDprEquipmentTableDetails, DprEquipmentTableDetails, DprEquipmentTableBreakdowns } from "@/components/DprEquipmentTableDetails";
import { DprEquipmentEfficiency } from "@/components/DprEquipmentEfficiency";
import { hasCompleteDprPerformanceContext, resolveDprActualEfficiency } from "@/lib/dprEquipmentEfficiency";
import { useDprEquipmentPerformance } from "@/hooks/use-dpr-equipment-performance";
import { DprActivityReadOnly } from "@/components/DprActivityReadOnly";
import { useDprBoqItems } from "@/hooks/use-dpr-boq-items";
import { isVisibleEquipmentRow } from "@shared/equipmentUsage";
import { getBaseSiteName } from "@shared/siteName";
import { dprMeasurementSummary } from "@shared/dprGeometry";
import { formatDprReference } from "@/lib/dprReference";

// Only the equipment audit table needs dense, wrapping print layout. Do not
// change the document's page size/orientation or other report sections.
const equipmentAuditPrintCss = `
@media print {
  .dpr-equipment-audit {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
    box-shadow: none !important;
  }
  .dpr-equipment-audit .dpr-equipment-audit-content {
    padding: 0 !important;
    min-width: 0 !important;
  }
  .dpr-equipment-audit .overflow-auto {
    overflow: visible !important;
    max-height: none !important;
  }
  .dpr-equipment-audit table {
    table-layout: fixed !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
  }
  .dpr-equipment-audit thead { display: table-header-group !important; }
  .dpr-equipment-audit tbody,
  .dpr-equipment-audit tr,
  .dpr-equipment-audit td {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .dpr-equipment-audit th,
  .dpr-equipment-audit td {
    padding: 1.2mm 0.8mm !important;
    height: auto !important;
    vertical-align: top !important;
  }
  .dpr-equipment-audit th,
  .dpr-equipment-audit td,
  .dpr-equipment-audit td * {
    min-width: 0 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: normal !important;
    font-size: 9pt !important;
    line-height: 1.35 !important;
  }
  .dpr-equipment-audit th:nth-child(1) { width: 10%; }
  .dpr-equipment-audit th:nth-child(2) { width: 6%; }
  .dpr-equipment-audit th:nth-child(3) { width: 6%; }
  .dpr-equipment-audit th:nth-child(4) { width: 14%; }
  .dpr-equipment-audit th:nth-child(5) { width: 10%; }
  .dpr-equipment-audit th:nth-child(6) { width: 6%; }
  .dpr-equipment-audit th:nth-child(7) { width: 9%; }
  .dpr-equipment-audit th:nth-child(8) { width: 7%; }
  .dpr-equipment-audit th:nth-child(9) { width: 12%; }
  .dpr-equipment-audit th:nth-child(10) { width: 14%; }
  .dpr-equipment-audit th:nth-child(11) { width: 6%; }
  .dpr-equipment-audit [data-testid^="equipment-table-work-"] section,
  .dpr-equipment-audit [data-testid^="equipment-table-work-"] .grid > div {
    padding: 1mm 0 !important;
  }
  .dpr-equipment-audit [data-testid^="equipment-table-work-"] .grid {
    display: block !important;
  }
  .dpr-equipment-audit [data-testid^="equipment-table-work-"] .flex {
    flex-wrap: wrap !important;
    gap: 1mm !important;
  }
  .dpr-equipment-audit td svg {
    width: 9pt !important;
    height: 9pt !important;
    flex-shrink: 0 !important;
  }
  /* Preserve an attachment's filename as printed audit text; this narrow
     override never exposes Lifecycle buttons or other interactive controls. */
  .dpr-equipment-audit [data-testid^="equipment-table-breakdowns-"] button {
    display: inline !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
  }
}
`;

export default function SiteReport() {
  const [, params] = useRoute("/site/report/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: dpr, isLoading, error } = useDpr(id);
  const { toast } = useToast();
  const { sectionCan, user } = useAuth();
  const canEdit = sectionCan("site_dprs", "edit");
  const canDelete = !!user?.isAdmin;
  const canViewPerformance = sectionCan("equipment_performance_report", "view") || sectionCan("plant_equipment", "view");
  const completePerformanceContext = hasCompleteDprPerformanceContext(user);
  const performance = useDprEquipmentPerformance(dpr, canViewPerformance, user?.id, completePerformanceContext);
  const { data: personnelList } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"],
  });
  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });
  const { items: reportBoqItems } = useDprBoqItems<any>({
    siteName: getBaseSiteName(dpr?.site ?? ""),
    sites,
    preferredProjectId: dpr?.boqProjectId ?? null,
  });

  const getPersonnelNames = (ids: number[] | undefined) => {
    if (!ids?.length || !personnelList) return null;
    return ids.map(id => personnelList.find(p => p.id === id)?.name).filter(Boolean).join(", ");
  };
  const searchString = useSearch();
  // Batch 06A — context-aware Back: honour a validated in-app `returnTo`
  // (e.g. from the Progress Report drill-down); otherwise keep the existing
  // default destination so all other entry contexts behave exactly as before.
  const backLink = resolveReturnTo(
    searchString || (typeof window !== "undefined" ? window.location.search : ""),
    DPR_REGISTER_PATH,
  );
  const reportHref = withReturnTo(`/site/report/${id}`, backLink);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [movingUsageId, setMovingUsageId] = useState<number | null>(null);
  const [moveDestination, setMoveDestination] = useState("");
  const [successorDate, setSuccessorDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const linkedUsageIds = useMemo(
    () => Array.from(new Set(
      (dpr?.equipment ?? [])
        .map((row: any) => linkedUsageId(row))
        .filter((value): value is number => value != null),
    )),
    [dpr?.equipment],
  );
  const { data: lifecyclePayload } = useQuery<unknown>({
    queryKey: ["/api/equipment-usage/lifecycle", linkedUsageIds.join(",")],
    queryFn: async () => {
      const res = await fetch(
        `/api/equipment-usage/lifecycle?ids=${encodeURIComponent(linkedUsageIds.join(","))}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Lifecycle is unavailable");
      return res.json();
    },
    enabled: linkedUsageIds.length > 0,
  });
  const lifecycle = useMemo(() => lifecycleByUsageId(lifecyclePayload), [lifecyclePayload]);
  const dprEquipmentLogIds = useMemo(
    () => (dpr?.equipment ?? []).map((row: any) => Number(row.id)).filter(Number.isInteger),
    [dpr?.equipment],
  );
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
    },
    enabled: dprEquipmentLogIds.length > 0,
  });
  const equipmentById = useMemo(
    () => new Map(equipmentMaster.map((item: any) => [item.id, item])),
    [equipmentMaster],
  );
  const breakdownsBySourceId = useMemo(() => {
    const result = new Map<number, any[]>();
    linkedBreakdowns.forEach((log) => {
      if (log.sourceRecordId == null) return;
      const rows = result.get(Number(log.sourceRecordId)) ?? [];
      rows.push(log);
      result.set(Number(log.sourceRecordId), rows);
    });
    return result;
  }, [linkedBreakdowns]);

  const moveMutation = useMutation({
    mutationFn: async ({
      usageId,
      destinationType,
      destinationSite,
    }: {
      usageId: number;
      destinationType: EquipmentDestinationType;
      destinationSite?: string;
    }) => {
      const response = await apiRequest("POST", `/api/equipment-usage/${usageId}/move`, {
        destinationType,
        ...(destinationSite ? { destinationSite } : {}),
        successorDate,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-usage/lifecycle"] });
      setMovingUsageId(null);
      setMoveDestination("");
      toast({
        title: "Equipment sent onward",
        description: "The completed source segment remains unchanged.",
      });
    },
    onError: (error: Error) => toast({
      title: "Could not move equipment",
      description: error.message,
      variant: "destructive",
    }),
  });

  const submitMove = () => {
    if (movingUsageId == null || !moveDestination) return;
    const destinationType: EquipmentDestinationType = moveDestination === "__hmp__"
      ? "hmp"
      : moveDestination === "__rmc__"
        ? "rmc"
        : "site";
    moveMutation.mutate({
      usageId: movingUsageId,
      destinationType,
      destinationSite: destinationType === "site" ? moveDestination : undefined,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/dprs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "Report Deleted",
        description: "The report has been deleted.",
      });
      setLocation(backLink);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete report",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    if (canEdit) {
      const role = user?.isAdmin ? "admin" : "manager";
      sessionStorage.setItem(`edit_pin_${id}`, role);
      sessionStorage.setItem(`auth_role_${id}`, role);
      setLocation(withReturnTo(`/site/edit/${id}`, reportHref));
    }
  };

  const handleDeleteClick = () => {
    if (canDelete) setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
    setShowDeleteConfirm(false);
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-8 h-8" /></div>;
  if (error || !dpr) return <div className="p-20 text-center text-red-500">Failed to load report.</div>;

  // One child-aware collection drives every report count/card/table. Legacy
  // untouched placeholder logs never appear as a resource, while a blank
  // parent with a linked stoppage remains visible.
  const visibleEquipment = dpr.equipment
    .map((item: any) => ({
      ...item,
      // The DPR detail response includes both draft and submitted stoppages.
      // Older responses without that field can use the already-loaded linked
      // maintenance rows; an explicitly empty list is still authoritative.
      breakdowns: item.breakdowns ?? breakdownsBySourceId.get(Number(item.id)) ?? [],
    }))
    .filter(isVisibleEquipmentRow);
  const totalDiesel = visibleEquipment.reduce((sum: number, e: any) => sum + (e.diesel || 0), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300 print:p-0">
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold mb-2">Delete Report?</h3>
              <p className="text-muted-foreground mb-6">
                Are you sure you want to delete this report? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between print:hidden flex-col md:flex-row gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold font-display">
              Site Report <span className="text-primary whitespace-nowrap">· {formatDprReference(dpr.id)}</span>
            </h1>
            {dpr && (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium whitespace-nowrap ${
                  (dpr as any).workType === "structure"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                }`}
                data-testid="badge-worktype-header"
              >
                {(dpr as any).workType === "structure" ? "Structure" : "Road"}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {canEdit && (
            <EditPermissionButton
              recordType="dpr"
              recordId={id}
              onEditGranted={handleEditClick}
              label="Edit"
              size="sm"
              variant="secondary"
              className="gap-2"
            />
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowHistory(true)}
            data-testid="button-history"
          >
            <History className="w-4 h-4" />
            History
          </Button>
          {canEdit && (
            <Button
              variant="outline"
              className="gap-2 text-amber-600 hover:text-amber-700"
              onClick={() => setShowCancel(true)}
              data-testid="button-cancel-dpr"
            >
              <Ban className="w-4 h-4" />
              Cancel
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleDeleteClick}
              disabled={deleteMutation.isPending}
              data-testid="button-admin-delete"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()} className="gap-2" data-testid="button-print">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Link href="/">
            <Button variant="ghost" className="gap-2" data-testid="button-home">
              <Home className="w-4 h-4" /> Home
            </Button>
          </Link>
        </div>
      </div>

      {/* Report Info Header with HLC Logo */}
      <ReportHeader 
        dprId={dpr.id}
        date={dpr.date} 
        site={dpr.site} 
        engineer={dpr.engineer} 
        submittedAt={dpr.submittedAt || undefined}
        dprStatus={(dpr as any).dprStatus}
        createdAt={(dpr as any).createdAt}
        authorName={(dpr as any).authorName}
        lastEditedAt={(dpr as any).lastEditedAt}
        lastEditedByName={(dpr as any).lastEditedByName}
        submittedByName={(dpr as any).submittedByName}
        workType={(dpr as any).workType}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Badge variant={(dpr as any).workType === "structure" ? "default" : "outline"} className="text-sm">
                {(dpr as any).workType === "structure" ? "Structure" : "Road"}
              </Badge>
            </div>
            <p className="text-2xl font-bold text-primary">
              {(dpr as any).workType === "structure"
                ? ((dpr as any).structureItems?.length ?? 0)
                : dpr.progress.length}
            </p>
            <p className="text-sm text-muted-foreground">
              {(dpr as any).workType === "structure" ? "Structure Items" : "Activities"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{visibleEquipment.length}</p>
            <p className="text-sm text-muted-foreground">Equipment</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{dpr.labour.reduce((sum: number, l: any) => sum + l.count, 0)}</p>
            <p className="text-sm text-muted-foreground">Workers</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              <p className="text-2xl font-bold text-primary">{totalDiesel.toFixed(3)} L</p>
            </div>
            <p className="text-sm text-muted-foreground">Total Diesel</p>
          </CardContent>
        </Card>
        {dpr.sitePurchases && dpr.sitePurchases.length > 0 && (
          <Card className="border-teal-500/30 bg-teal-500/5">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <ShoppingCart className="w-5 h-5 text-teal-600" />
                <p className="text-2xl font-bold text-teal-600" data-testid="text-purchases-count">{dpr.sitePurchases.length}</p>
              </div>
              <p className="text-sm text-muted-foreground">Purchases</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Activity Progress / Structure Items */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <CardTitle>
            {(dpr as any).workType === "structure" ? "Structure Works Progress" : "Activity Progress"}
          </CardTitle>
          <Badge variant={(dpr as any).workType === "structure" ? "default" : "outline"} className="text-sm">
            {(dpr as any).workType === "structure" ? "Structure DPR" : "Road DPR"}
          </Badge>
        </CardHeader>
        <CardContent>
          {(dpr as any).workType === "structure" ? (
            (dpr as any).structureItems?.length === 0 ? (
              <p className="text-muted-foreground italic">No structure items recorded.</p>
            ) : (
              <div className="overflow-x-auto">
              <details className="rounded-md border border-border/60">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">Open detailed audit fields</summary>
              <div className="overflow-x-auto p-1">
              <details className="rounded-md border border-border/60">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">Open detailed audit fields</summary>
                <div className="overflow-x-auto p-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Sub-type</TableHead>
                    <TableHead>Name / Location</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Item of Work</TableHead>
                    <TableHead className="text-right">Physical measurement</TableHead>
                    <TableHead className="text-right">BOQ credit</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dpr as any).structureItems?.map((item: any, i: number) => {
                    const boqItem = item.boqItemId != null
                      ? reportBoqItems.find((candidate: any) => candidate.id === item.boqItemId) ?? null
                      : null;
                    const measurement = dprMeasurementSummary({
                      ...item,
                      kind: "structure",
                      rowConversionFactor: item.rowConversionFactor ?? item.dprConversionFactor ?? null,
                    }, boqItem);
                    return (
                    <TableRow key={i} data-testid={`row-structure-${i}`}>
                      <TableCell><Badge variant="secondary">{item.structureType}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.structureSubType || '-'}</TableCell>
                      <TableCell className="font-medium">{item.structureName || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.stage || '-'}</TableCell>
                      <TableCell>{item.itemOfWork}</TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        {measurement.measuredQty != null ? `${measurement.measuredQty} ${measurement.measuredUom ?? "(unit unavailable)"}` : "-"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {measurement.boqQty != null
                          ? `${Number(measurement.boqQty.toFixed(6))} ${measurement.boqUom ?? "(BOQ unit unavailable)"}`
                          : <span className="text-amber-700">Needs unit review</span>}
                        {measurement.warnings.length > 0 && <div className="text-[10px] text-amber-700 whitespace-normal">{measurement.warnings.join(" · ")}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.remarks || '-'}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
                </div>
              </details>
              </div>
              </details>
              </div>
            )
          ) : dpr.progress.length === 0 ? (
            <p className="text-muted-foreground italic">No activities recorded.</p>
          ) : (
            <div className="space-y-2">
                {dpr.progress.map((item: any, i: number) => {
                  const personnelNames = getPersonnelNames(item.personnelIds);
                  const boqItem = item.boqItemId != null
                    ? reportBoqItems.find((candidate: any) => candidate.id === item.boqItemId) ?? null
                    : null;
                  return (
                    <DprActivityReadOnly key={item.entryKey ?? item.id ?? i} item={item} index={i} boqItem={boqItem} personnelNames={personnelNames} nameStyle="activity">
                      {item.programmeBarId != null && (
                        <ProgrammeBarOutcomeHistory
                          projectId={(dpr as any).boqProjectId}
                          boqItemId={item.boqItemId}
                          programmeBarId={Number(item.programmeBarId)}
                          testidPrefix={`progress-${i}`}
                        />
                      )}
                    </DprActivityReadOnly>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout for Resources */}
      <div className="grid grid-cols-1 gap-8">
        <Card className="dpr-equipment-audit">
          <style data-testid="equipment-audit-print-style">{equipmentAuditPrintCss}</style>
          <CardHeader>
            <CardTitle>Equipment Log</CardTitle>
          </CardHeader>
          <CardContent className="dpr-equipment-audit-content">
            {visibleEquipment.length === 0 ? (
              <p className="text-muted-foreground italic">No equipment usage recorded.</p>
            ) : (
              <div className="space-y-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>Vehicle No</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Time/Meter</TableHead>
                    <TableHead className="text-right">Operating Quantity</TableHead>
                    <TableHead className="text-right">Diesel (L)</TableHead>
                    <TableHead className="text-right">Expected Diesel</TableHead>
                    <TableHead>Norm / Efficiency</TableHead>
                    <TableHead>Breakdown / Stoppage</TableHead>
                    <TableHead>Diesel Source</TableHead>
                    <TableHead className="print:hidden">Lifecycle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEquipment.map((item: any, i: number) => {
                    const et = item.entryType || "time_meter";
                    const isTripBased = et === "trip_based";
                    const operatingQuantity = item.hoursWorked != null
                      ? `${Number(item.hoursWorked).toFixed(3)} h`
                      : item.totalKm != null ? `${Number(item.totalKm).toFixed(3)} km` : "—";
                    const persistedExpected = item.expectedDiesel != null ? Number(item.expectedDiesel) : null;
                    const persistedNorm = item.dieselNorm != null ? Number(item.dieselNorm) : null;
                    const persistedNormUnit = item.totalKm != null ? "L/km" : item.hoursWorked != null ? "L/hr" : "";
                    const tableDetails = buildDprEquipmentTableDetails(item, equipmentById.get(item.equipmentId));

                    const dieselSourceLabel = item.dieselSource === 'direct_purchase' ? 'Direct Purchase'
                      : item.dieselSource === 'contractor' ? 'Contractor'
                      : item.dieselSource === 'plant_stock' ? 'Plant Stock' : String(item.dieselSource || '-').replace("_", " ");
                    const usageId = linkedUsageId(item);
                    const usageLifecycle = usageId != null ? lifecycle.get(usageId) : undefined;
                    const lifecycleText = lifecycleLabel(usageLifecycle);
                    const canMove = canEdit
                      && usageId != null
                      && usageLifecycle?.status === "closed"
                      && usageLifecycle.successorId == null;
                    const linkedRows = breakdownsBySourceId.get(Number(item.id)) ?? [];
                    
                    return (
                      <TableRow key={i} data-testid={`row-equipment-${i}`}>
                        <TableCell className="font-medium">
                          {item.machine}
                          {et === "hourly" && <Badge variant="outline" className="ml-1 text-[12px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">Hourly Hire</Badge>}
                          {et === "daily" && <Badge variant="outline" className="ml-1 text-[12px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">Daily Hire</Badge>}
                          {et === "monthly" && <Badge variant="outline" className="ml-1 text-[12px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">Monthly Hire</Badge>}
                          {et === "trip_based" && <Badge variant="outline" className="ml-1 text-[12px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">Trip Based</Badge>}
                          <DprEquipmentTableDetails section="identity" row={item} details={tableDetails} index={i} />
                        </TableCell>
                        <TableCell>{item.vehicleNo || '-'}</TableCell>
                        <TableCell>{item.operator || '-'}</TableCell>
                        <TableCell className="text-sm">
                          <span className="whitespace-pre-wrap">{item.task || '-'}</span>
                          <DprEquipmentTableDetails section="work" row={item} details={tableDetails} index={i}
                            boqItems={reportBoqItems}
                            programmeBars={(dpr.progress ?? []).flatMap((entry: any) => entry.programmeBarId != null && entry.boqItemId != null ? [{
                              id: Number(entry.programmeBarId),
                              boqItemId: Number(entry.boqItemId),
                              reachLabel: [entry.chainageFrom, entry.chainageTo].filter(Boolean).join("–") || null,
                              side: entry.side || null,
                            }] : [])} />
                        </TableCell>
                        <TableCell className="text-sm">
                          <DprEquipmentTableDetails section="readings" row={item} details={tableDetails} index={i} />
                          {isTripBased && item.numberOfTrips && item.tripDistance && (
                            <div className="text-[12px] text-muted-foreground">{item.numberOfTrips} trips × {item.tripDistance} km</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-xs text-muted-foreground">Saved quantity: </span>{operatingQuantity}
                          <DprEquipmentTableDetails section="quantity" row={item} details={tableDetails} index={i} />
                        </TableCell>
                        <TableCell className="text-right">
                          {item.diesel ?? '-'}
                          <DprEquipmentTableDetails section="tank" row={item} details={tableDetails} index={i} />
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-xs text-muted-foreground">Saved expected: </span>
                          {persistedExpected != null ? `${persistedExpected.toFixed(3)} L` : "—"}
                          <DprEquipmentTableDetails section="expected" row={item} details={tableDetails} index={i} />
                        </TableCell>
                        <TableCell className="text-sm">
                          <DprEquipmentEfficiency norm={persistedNorm} normUnit={persistedNormUnit} index={i}
                            actual={resolveDprActualEfficiency({
                              dpr, row: item, report: performance.data, canView: canViewPerformance,
                              hasCompleteContext: completePerformanceContext,
                              isLoading: performance.isLoading || performance.isFetching, error: performance.error,
                            })} />
                          {persistedExpected != null && item.diesel != null && (
                            <div className="text-xs text-muted-foreground">
                              Issued − expected: {(Number(item.diesel) - persistedExpected).toFixed(3)} L
                            </div>
                          )}
                          <DprEquipmentTableDetails section="performance" row={item} details={tableDetails} index={i} showLegacyRate={false} />
                        </TableCell>
                        <TableCell className="text-sm">
                          <DprEquipmentTableBreakdowns stops={item.breakdowns} linkedRows={linkedRows} index={i} />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{dieselSourceLabel}</span>
                          {item.dieselSource === 'direct_purchase' && (
                            <div className="text-sm text-muted-foreground mt-0.5">
                              {item.fuelStation && <span>{item.fuelStation}</span>}
                              {item.billNumber && <span> | Bill: {item.billNumber}</span>}
                              {item.amountPaid && <span> | Rs. {item.amountPaid}</span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="print:hidden">
                          {lifecycleText ? (
                            <div className="space-y-2">
                              <Badge
                                variant={usageLifecycle?.status === "open" ? "secondary" : "outline"}
                                data-testid={`badge-equipment-lifecycle-${i}`}
                              >
                                {lifecycleText}
                              </Badge>
                              {canMove && (
                                movingUsageId === usageId ? (
                                  <div className="space-y-2 min-w-52">
                                    <Select value={moveDestination} onValueChange={setMoveDestination}>
                                      <SelectTrigger data-testid={`select-move-destination-${i}`}>
                                        <SelectValue placeholder="Send to…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__hmp__">HMP Plant</SelectItem>
                                        <SelectItem value="__rmc__">RMC Plant</SelectItem>
                                        {sites
                                          .filter((site) => site.isActive === 1)
                                          .map((site) => (
                                            <SelectItem key={site.id} value={site.name}>
                                              {site.name}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      type="date"
                                      value={successorDate}
                                      onChange={(event) => setSuccessorDate(event.target.value)}
                                      data-testid={`input-successor-date-${i}`}
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={submitMove}
                                        disabled={!moveDestination || moveMutation.isPending}
                                        data-testid={`button-confirm-move-${i}`}
                                      >
                                        {moveMutation.isPending ? "Sending…" : "Send"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setMovingUsageId(null);
                                          setMoveDestination("");
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setMovingUsageId(usageId);
                                      setSuccessorDate(dpr.date);
                                    }}
                                    data-testid={`button-move-equipment-${i}`}
                                  >
                                    Send onward
                                  </Button>
                                )
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Labour Strength</CardTitle>
          </CardHeader>
          <CardContent>
             {dpr.labour.length === 0 ? (
              <p className="text-muted-foreground italic">No labour recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead>Task/Work</TableHead>
                    <TableHead>Contractor/Gang</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.labour.map((item: any, i: number) => (
                    <TableRow key={i} data-testid={`row-labour-${i}`}>
                      <TableCell>{item.category}<LabourWorkerNamesReadOnly row={item} /></TableCell>
                      <TableCell>{item.gender}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{item.count}</TableCell>
                      <TableCell>{item.task || '-'}</TableCell>
                      <TableCell>{item.contractor || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Materials Log */}
      <Card>
        <CardHeader>
          <CardTitle>Materials Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <DprMaterialsReceived site={dpr.site} date={dpr.date} />
          {dpr.materials.length === 0 ? (
            <p className="text-muted-foreground italic">No materials recorded.</p>
          ) : (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">DPR material records</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Vehicle No.</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Location/Task</TableHead>
                    <TableHead>Receipt No.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.materials.map((item: any, i: number) => (
                    <TableRow key={i} data-testid={`row-material-${i}`}>
                      <TableCell>
                        <Badge variant={item.type === 'Received' ? 'default' : item.type === 'Issued' ? 'secondary' : 'outline'}>
                          {item.type || 'Received'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{item.material}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity?.toFixed(3) || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                      <TableCell>{item.vehicleNumber || '-'}</TableCell>
                      <TableCell>{item.supplier || '-'}</TableCell>
                      <TableCell>{item.location || '-'}</TableCell>
                      <TableCell>{item.receiptNumber || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site Purchases */}
      {dpr.sitePurchases && dpr.sitePurchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Site Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Description</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill No</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dpr.sitePurchases.map((item: any, i: number) => (

                  <TableRow key={i} data-testid={`row-site-purchase-${i}`}>
                    <TableCell className="font-medium">{item.itemDescription}</TableCell>
                    <TableCell>{item.vendor || '-'}</TableCell>
                    <TableCell>{item.billNo || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{item.amount ? Number(item.amount).toFixed(3) : '-'}</TableCell>
                    <TableCell className="text-right">{item.quantity ? Number(item.quantity).toFixed(3) : '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.uom || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Photos */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <DprPhotoGroups
            dprId={id}
            progress={(dpr.progress ?? []) as any[]}
            allowDelete={canEdit}
            emptyText="No photos attached"
          />
        </CardContent>
      </Card>

      <CancelDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        cancelUrl={`/api/dprs/${id}/cancel`}
        recordLabel={`DPR for ${dpr.site} (${dpr.date})`}
        invalidateQueryKeys={["/api/dprs", ["/api/dprs", id]]}
      />
      <HistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        module="dprs"
        transactionId={id}
        recordLabel={`DPR for ${dpr.site} (${dpr.date})`}
      />
    </div>
  );
}
