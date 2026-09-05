import { useMemo, useState } from "react";
import { useDpr } from "@/hooks/use-dprs";
import { Link, useRoute, useLocation, useSearch } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { resolveReturnTo } from "@/lib/progressReportNav";
import { ChevronLeft, Loader2, Printer, Trash2, Fuel, Home, ShoppingCart, History, Ban } from "lucide-react";
import { EditPermissionButton } from "@/components/EditPermissionButton";
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
import type { Personnel, Site } from "@shared/schema";
import { shortItemName } from "@/lib/itemName";
import {
  lifecycleByUsageId,
  lifecycleLabel,
  linkedUsageId,
  type EquipmentDestinationType,
} from "@/lib/equipmentLifecycle";
import { ProgrammeBarOutcomeHistory } from "@/components/ProgrammeBarOutcomeHistory";
import { DprEquipmentCompact } from "@/components/DprEquipmentCompact";

export default function SiteReport() {
  const [, params] = useRoute("/site/report/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: dpr, isLoading, error } = useDpr(id);
  const { toast } = useToast();
  const { sectionCan, user } = useAuth();
  const canEdit = sectionCan("site_dprs", "edit");
  const canDelete = !!user?.isAdmin;
  const { data: personnelList } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"],
  });
  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const getPersonnelNames = (ids: number[] | undefined) => {
    if (!ids?.length || !personnelList) return null;
    return ids.map(id => personnelList.find(p => p.id === id)?.name).filter(Boolean).join(", ");
  };
  const { appendOrigin } = useOrigin();
  const searchString = useSearch();
  // Batch 06A — context-aware Back: honour a validated in-app `returnTo`
  // (e.g. from the Progress Report drill-down); otherwise keep the existing
  // default destination so all other entry contexts behave exactly as before.
  const backLink = resolveReturnTo(
    searchString || (typeof window !== "undefined" ? window.location.search : ""),
    appendOrigin("/site/dashboard"),
  );

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
      setLocation(appendOrigin(`/site/edit/${id}`));
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

  // Materials Abstract: Group by Material + UOM
  const materialsAbstract = dpr.materials.reduce((acc: any[], m: any) => {
    if (!m.material) return acc;
    const key = `${m.material}|${m.uom}`;
    const existing = acc.find(item => item.key === key);
    if (existing) {
      existing.total += m.quantity || 0;
      existing.trips += 1;
    } else {
      acc.push({
        key,
        material: m.material,
        uom: m.uom,
        total: m.quantity || 0,
        trips: 1,
      });
    }
    return acc;
  }, []);

  // Total Diesel
  const totalDiesel = dpr.equipment.reduce((sum: number, e: any) => sum + (e.diesel || 0), 0);

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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-display">Site Report</h1>
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
        date={dpr.date} 
        site={dpr.site} 
        engineer={dpr.engineer} 
        submittedAt={dpr.submittedAt || undefined}
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
            <p className="text-2xl font-bold text-primary">{dpr.equipment.length}</p>
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
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dpr as any).structureItems?.map((item: any, i: number) => (
                    <TableRow key={i} data-testid={`row-structure-${i}`}>
                      <TableCell><Badge variant="secondary">{item.structureType}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.structureSubType || '-'}</TableCell>
                      <TableCell className="font-medium">{item.structureName || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.stage || '-'}</TableCell>
                      <TableCell>{item.itemOfWork}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity != null ? item.quantity : '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{item.uom || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.remarks || '-'}</TableCell>
                    </TableRow>
                  ))}
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
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Length (m)</TableHead>
                  <TableHead className="text-right">Width (m)</TableHead>
                  <TableHead className="text-right">Thickness (m)</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dpr.progress.map((item: any, i: number) => {
                  const personnelNames = getPersonnelNames(item.personnelIds);
                  if (item.noSiteWork) {
                    return (
                      <TableRow key={i} data-testid={`row-progress-${i}`}>
                        <TableCell className="font-medium max-w-[320px]">
                          <div title={item.activity}>{shortItemName(item.activity) || item.activity}</div>
                          {item.programmeBarId != null && (
                            <ProgrammeBarOutcomeHistory
                              projectId={(dpr as any).boqProjectId}
                              boqItemId={item.boqItemId}
                              programmeBarId={Number(item.programmeBarId)}
                              testidPrefix={`progress-${i}`}
                            />
                          )}
                          {item.noSiteWorkDescription && (
                            <div className="text-sm text-muted-foreground mt-1">{item.noSiteWorkDescription}</div>
                          )}
                          {personnelNames && (
                            <div className="text-sm text-muted-foreground mt-1">Personnel: {personnelNames}</div>
                          )}
                        </TableCell>
                        <TableCell colSpan={8} className="text-muted-foreground italic">No site work</TableCell>
                      </TableRow>
                    );
                  }

                  const derivedLength = (!item.length && item.chainageFrom && item.chainageTo) 
                    ? Math.abs((parseFloat(item.chainageTo) - parseFloat(item.chainageFrom)) * 1000)
                    : null;
                  const displayLength = item.length || (derivedLength ? derivedLength.toFixed(0) : null);
                  
                  return (
                    <TableRow key={i} data-testid={`row-progress-${i}`}>
                      <TableCell className="font-medium max-w-[320px]">
                        <div title={item.activity}>{shortItemName(item.activity) || item.activity}</div>
                          {item.programmeBarId != null && (
                            <ProgrammeBarOutcomeHistory
                              projectId={(dpr as any).boqProjectId}
                              boqItemId={item.boqItemId}
                              programmeBarId={Number(item.programmeBarId)}
                              testidPrefix={`progress-${i}`}
                            />
                          )}
                        {/* Batch 06V: incidental badge — shown in the activity cell */}
                        {item.isIncidental && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">
                              Incidental / Non-BOQ · No BOQ Credit
                            </Badge>
                            {item.incidentalDescription && (
                              <div className="text-xs text-muted-foreground mt-0.5">{item.incidentalDescription}</div>
                            )}
                          </div>
                        )}
                        {personnelNames && (
                          <div className="text-sm text-muted-foreground mt-1">Personnel: {personnelNames}</div>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{item.side || '-'}</Badge></TableCell>
                      <TableCell>{item.chainageFrom || '-'}</TableCell>
                      <TableCell>{item.chainageTo || '-'}</TableCell>
                      <TableCell className="text-right">{displayLength || '-'}</TableCell>
                      <TableCell className="text-right">{item.width || '-'}</TableCell>
                      <TableCell className="text-right">{item.thickness || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity?.toFixed(3) || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout for Resources */}
      <div className="grid grid-cols-1 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Equipment Log</CardTitle>
          </CardHeader>
          <CardContent>
            {dpr.equipment.length === 0 ? (
              <p className="text-muted-foreground italic">No equipment usage recorded.</p>
            ) : (
              <div className="space-y-2">
              <div className="space-y-2">
                {dpr.equipment.map((item: any, i: number) => (
                  <DprEquipmentCompact
                    key={i}
                    row={item}
                    equipment={equipmentById.get(item.equipmentId)}
                    editable={false}
                    index={i}
                  />
                ))}
              </div>
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
                  {dpr.equipment.map((item: any, i: number) => {
                    const et = item.entryType || "time_meter";
                    const isTripBased = et === "trip_based";
                    const operatingQuantity = item.hoursWorked != null
                      ? `${Number(item.hoursWorked).toFixed(3)} h`
                      : item.totalKm != null ? `${Number(item.totalKm).toFixed(3)} km` : "—";
                    const persistedExpected = item.expectedDiesel != null ? Number(item.expectedDiesel) : null;
                    const persistedNorm = item.dieselNorm != null ? Number(item.dieselNorm) : null;
                    const persistedNormUnit = item.totalKm != null ? "L/km" : item.hoursWorked != null ? "L/hr" : "";
                    
                    const hasReading = item.openingReading != null && item.closingReading != null;
                    const hasTime = item.startTime && item.endTime;
                    const readingSource = hasReading 
                      ? `Meter: ${item.openingReading} - ${item.closingReading}`
                      : (hasTime ? `Time: ${item.startTime} - ${item.endTime}` : '-');

                    const dieselSourceLabel = item.dieselSource === 'direct_purchase' ? 'Direct Purchase'
                      : item.dieselSource === 'contractor' ? 'Contractor'
                      : item.dieselSource === 'plant_stock' ? 'Plant Stock' : '-';
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
                        </TableCell>
                        <TableCell>{item.vehicleNo || '-'}</TableCell>
                        <TableCell>{item.operator || '-'}</TableCell>
                        <TableCell className="text-sm">{item.task || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {readingSource}
                          {isTripBased && item.numberOfTrips && item.tripDistance && (
                            <div className="text-[12px] text-muted-foreground">{item.numberOfTrips} trips × {item.tripDistance} km</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {operatingQuantity}
                        </TableCell>
                        <TableCell className="text-right">{item.diesel || '-'}</TableCell>
                        <TableCell className="text-right">
                          {persistedExpected != null ? `${persistedExpected.toFixed(3)} L` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {persistedNorm != null ? `${persistedNorm.toFixed(3)}${persistedNormUnit ? ` ${persistedNormUnit}` : ""}` : "—"}
                          {persistedExpected != null && item.diesel != null && (
                            <div className="text-xs text-muted-foreground">
                              Actual variance: {(Number(item.diesel) - persistedExpected).toFixed(3)} L
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {linkedRows.length === 0 ? "-" : linkedRows.map((log: any) => (
                            <div key={log.id} className="mb-1">
                              <Badge variant={log.status === "resolved" ? "outline" : "secondary"}>{log.status}</Badge>
                              <span className="ml-1">{log.fromTime && log.toTime ? `${log.fromTime}–${log.toTime} (${log.downtimeHours ?? "-"} h)` : `${log.downtimeHours ?? "-"} h`}</span>
                              <div className="text-xs text-muted-foreground">{log.description}{log.responsibility ? ` · ${String(log.responsibility).toUpperCase()}` : ""}</div>
                            </div>
                          ))}
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
                      <TableCell>{item.category}</TableCell>
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
          {dpr.materials.length === 0 ? (
            <p className="text-muted-foreground italic">No materials recorded.</p>
          ) : (
            <>
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

              {/* Materials Abstract Summary */}
              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Materials Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {materialsAbstract.map((item: any, i: number) => (
                    <div 
                      key={i} 
                      className="p-3 bg-muted/50 border rounded-lg"
                      data-testid={`card-material-abstract-${i}`}
                    >
                      <p className="text-sm font-medium">{item.material}</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <p className="text-xl font-bold text-primary">{item.total.toFixed(3)}</p>
                        <p className="text-sm text-muted-foreground">{item.uom}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.trips} trip{item.trips > 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
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
