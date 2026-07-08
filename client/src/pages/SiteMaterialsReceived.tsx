import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { format } from "date-fns";
import { ChevronLeft, Filter, X, Package, Loader2, Truck, Trash2, BarChart2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { AttachmentGallery } from "@/components/AttachmentGallery";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { EditPermissionButton } from "@/components/EditPermissionButton";
import { useAuth } from "@/lib/auth-context";

const MATERIAL_OPTIONS = [
  "WMM", "GSB", "Soil", "Dust", "6MM DOWN", "10/12MM", "20MM", "BC Mix", "DBM Mix",
  "Water", "Bitumen", "Emulsion", "Diesel",
];

function SourceBadge({ source }: { source: string }) {
  if (source === "dpr")
    return <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300">DPR</Badge>;
  if (source === "trip")
    return <Badge variant="outline" className="text-[11px] bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-300">TRIP</Badge>;
  return <Badge variant="outline" className="text-[11px] bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-300">EQUIP</Badge>;
}

function WorkTypeBadge({ workType }: { workType?: string }) {
  if (!workType) return <span className="text-xs text-muted-foreground">—</span>;
  if (workType === "structure")
    return <Badge variant="outline" className="text-[11px] bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300">STRUCTURE</Badge>;
  return <Badge variant="outline" className="text-[11px] bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-900/20 dark:text-sky-300">ROAD</Badge>;
}

export default function SiteMaterialsReceived() {
  const { toast } = useToast();
  const search = useSearch();
  const sp = new URLSearchParams(search);
  const returnTo = sp.get("returnTo") || "/site/hub";
  const { isAdmin, isOwner } = useAuth();
  const isOwnerOrAdmin = isAdmin || isOwner;

  const mgmtReportSite = sp.get("from") === "management-report" ? (sp.get("site") || null) : null;

  const urlFilterKeys = ["dateFrom", "dateTo", "site", "material", "supplier", "workType"];
  const urlHasFilterParams = urlFilterKeys.some((k) => sp.has(k));
  const urlFilterDefaults = urlHasFilterParams ? {
    dateFrom: sp.get("dateFrom") ?? "",
    dateTo: sp.get("dateTo") ?? "",
    site: sp.get("site") ?? "",
    material: sp.get("material") ?? "",
    supplier: sp.get("supplier") ?? "",
    workType: sp.get("workType") ?? "",
  } : {};

  const [filters, setFilters, resetFilters] = usePersistedFilters(
    "site-materials-received:filters:v3",
    {
      dateFrom: "",
      dateTo: "",
      site: "",
      material: "",
      supplier: "",
      workType: "",
      ...urlFilterDefaults,
    },
    { shouldHydrate: !urlHasFilterParams },
  );

  const [selectedTrip, setSelectedTrip] = useState<any | null>(null);
  const [editUnlocked, setEditUnlocked] = useState(false);

  const hasActiveFilters =
    !!filters.dateFrom ||
    !!filters.dateTo ||
    !!filters.site ||
    !!filters.material ||
    !!filters.supplier ||
    !!filters.workType;

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.site) params.set("site", filters.site);
    if (filters.material) params.set("material", filters.material);
    if (filters.supplier) params.set("supplier", filters.supplier);
    if (filters.workType) params.set("workType", filters.workType);
    const qs = params.toString();
    return qs ? `/api/materials-received?${qs}` : "/api/materials-received";
  };

  const { data: trips = [], isLoading } = useQuery<any[]>({
    queryKey: [buildUrl()],
  });

  const { data: supplierList = [] } = useQuery<string[]>({
    queryKey: ["/api/materials/suppliers"],
  });

  const uniqueSites = useMemo(() => {
    const s = new Set<string>();
    trips.forEach((t: any) => { if (t.site) s.add(t.site); });
    return Array.from(s).sort();
  }, [trips]);

  const byMaterial = useMemo(() => {
    const grouped: Record<string, { count: number; totalQty: number; uom: string }> = {};
    trips.forEach((t: any) => {
      const k = t.material;
      if (!k) return;
      if (!grouped[k]) grouped[k] = { count: 0, totalQty: 0, uom: t.uom || "" };
      grouped[k].count++;
      grouped[k].totalQty += Number(t.quantity) || 0;
    });
    return grouped;
  }, [trips]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/site-material-trips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0].startsWith("/api/site-material-trips") || q.queryKey[0].startsWith("/api/materials-received"))
      });
      toast({ title: "Deleted", description: "Material entry removed." });
      setSelectedTrip(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={returnTo}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold">Materials Received</h1>
          </div>
        </div>

        {/* Management Report context banner */}
        {mgmtReportSite && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300" data-testid="banner-management-report">
            <BarChart2 className="w-4 h-4 flex-shrink-0 text-amber-500" />
            <span>From Management Report — Filtered to: <strong>{mgmtReportSite}</strong></span>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto gap-1" data-testid="button-reset-filters">
                  <X className="w-3 h-3" /> Reset
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">From Date</Label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))} data-testid="input-date-from" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">To Date</Label>
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))} data-testid="input-date-to" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Site</Label>
                <Select value={filters.site || "__all__"} onValueChange={(v) => setFilters(f => ({ ...f, site: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-site-filter"><SelectValue placeholder="All Sites" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sites</SelectItem>
                    {uniqueSites.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Material</Label>
                <Select value={filters.material || "__all__"} onValueChange={(v) => setFilters(f => ({ ...f, material: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-material-filter"><SelectValue placeholder="All Materials" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Materials</SelectItem>
                    {MATERIAL_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Supplier / Party</Label>
                <Select value={filters.supplier || "__all__"} onValueChange={(v) => setFilters(f => ({ ...f, supplier: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-supplier-filter"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Suppliers</SelectItem>
                    {supplierList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Work Type</Label>
                <Select value={filters.workType || "__all__"} onValueChange={(v) => setFilters(f => ({ ...f, workType: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-worktype-filter"><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Types</SelectItem>
                    <SelectItem value="road">Road</SelectItem>
                    <SelectItem value="structure">Structure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {Object.keys(byMaterial).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(byMaterial).map(([material, data]) => (
              <Card key={material} data-testid={`card-material-${material}`}>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold">{data.totalQty.toFixed(2)}</div>
                  <div className="text-sm text-muted-foreground">{data.uom}</div>
                  <div className="font-medium mt-1">{material}</div>
                  <div className="text-sm text-muted-foreground">{data.count} trip{data.count !== 1 ? "s" : ""}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Material Entries ({trips.length})
            </h3>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : trips.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No material entries found for the selected filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 border text-sm">Date / Time</th>
                      <th className="text-left p-2 border text-sm">Site</th>
                      <th className="text-left p-2 border text-sm">Vehicle</th>
                      <th className="text-left p-2 border text-sm">Material</th>
                      <th className="text-right p-2 border text-sm">Qty / UOM</th>
                      <th className="text-left p-2 border text-sm">Supplier</th>
                      <th className="text-left p-2 border text-sm">Receipt No.</th>
                      <th className="text-center p-2 border text-sm">Work Type</th>
                      <th className="text-center p-2 border text-sm">Source</th>
                      <th className="text-left p-2 border text-sm">Photos</th>
                      <th className="text-center p-2 border text-sm w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((trip: any) => (
                      <tr
                        key={`${trip.source}-${trip.id}`}
                        className="border-b hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => setSelectedTrip(trip)}
                        data-testid={`row-material-${trip.source}-${trip.id}`}
                      >
                        <td className="p-2 border text-sm">
                          <div>{trip.date ? format(new Date(trip.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase() : "-"}</div>
                          {trip.time && <div className="text-muted-foreground text-xs">{trip.time}</div>}
                        </td>
                        <td className="p-2 border text-sm">{trip.site || "-"}</td>
                        <td className="p-2 border text-sm">{trip.vehicleNumber || "-"}</td>
                        <td className="p-2 border text-sm font-medium">{trip.material || "-"}</td>
                        <td className="p-2 border text-sm text-right">{trip.quantity} {trip.uom}</td>
                        <td className="p-2 border text-sm">{trip.supplier || "-"}</td>
                        <td className="p-2 border text-sm">{trip.receiptNumber || "-"}</td>
                        <td className="p-2 border text-center"><WorkTypeBadge workType={trip.workType} /></td>
                        <td className="p-2 border text-center"><SourceBadge source={trip.source} /></td>
                        <td className="p-2 border" onClick={e => e.stopPropagation()}>
                          {trip.source === "trip" ? (
                            <AttachmentGallery
                              moduleType="site_material_trip"
                              linkedRecordId={trip.id}
                              allowDelete={false}
                              emptyText="—"
                              className="flex flex-wrap gap-1"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 border text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => setSelectedTrip(trip)}
                              title="View details"
                              data-testid={`button-view-${trip.id}`}
                            >
                              <Eye className="w-3 h-3 text-muted-foreground" />
                            </Button>
                            {trip.source === "trip" && (isOwnerOrAdmin) && (
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => deleteMutation.mutate(trip.id)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-${trip.id}`}
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTrip} onOpenChange={(open) => { if (!open) { setSelectedTrip(null); setEditUnlocked(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600" />
              Material Entry — {selectedTrip?.material}
            </DialogTitle>
          </DialogHeader>

          {selectedTrip && (
            <div className="space-y-4">
              {/* Edit Request button for all non-admin/owner users on trip entries */}
              {selectedTrip.source === "trip" && !isOwnerOrAdmin && (
                <div className="flex justify-end">
                  <EditPermissionButton
                    recordType="site_material_trip"
                    recordId={selectedTrip.id}
                    onEditGranted={() => setEditUnlocked(true)}
                    label="Request Edit"
                    size="sm"
                  />
                </div>
              )}

              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Date</p>
                  <p className="font-semibold mt-0.5">
                    {selectedTrip.date ? format(new Date(selectedTrip.date + "T00:00:00"), "dd MMM yyyy") : "—"}
                    {selectedTrip.time ? ` · ${selectedTrip.time}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Site</p>
                  <p className="font-semibold mt-0.5">{selectedTrip.site || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Material</p>
                  <p className="font-semibold mt-0.5">{selectedTrip.material || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Quantity</p>
                  <p className="font-semibold mt-0.5">{selectedTrip.quantity} {selectedTrip.uom}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Vehicle No.</p>
                  <p className="font-semibold mt-0.5">{selectedTrip.vehicleNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Supplier / Party</p>
                  <p className="font-semibold mt-0.5">{selectedTrip.supplier || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Receipt / Challan No.</p>
                  <p className="font-semibold mt-0.5">{selectedTrip.receiptNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Work Type</p>
                  <div className="mt-0.5"><WorkTypeBadge workType={selectedTrip.workType} /></div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Source</p>
                  <div className="mt-0.5"><SourceBadge source={selectedTrip.source} /></div>
                </div>
                {selectedTrip.remarks && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Remarks</p>
                    <p className="font-semibold mt-0.5">{selectedTrip.remarks}</p>
                  </div>
                )}
              </div>

              {/* Photos */}
              {selectedTrip.source === "trip" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Photos</p>
                  {(isOwnerOrAdmin || editUnlocked) && (
                    <AttachmentUploader
                      moduleType="site_material_trip"
                      linkedRecordId={selectedTrip.id}
                      docType="challan"
                      label="Add Photo"
                    />
                  )}
                  <AttachmentGallery
                    moduleType="site_material_trip"
                    linkedRecordId={selectedTrip.id}
                    allowDelete={isOwnerOrAdmin}
                    emptyText="No photos attached to this entry."
                    className="grid grid-cols-3 gap-2"
                  />
                </div>
              )}

              {/* Delete (admin/owner only) */}
              {selectedTrip.source === "trip" && isOwnerOrAdmin && (
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => deleteMutation.mutate(selectedTrip.id)}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-dialog"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    {deleteMutation.isPending ? "Deleting…" : "Delete Entry"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
