import { useState } from "react";
import { Link, useSearch } from "wouter";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, ShoppingCart, Filter, Pencil, Loader2, X, History, Ban, CheckCircle2, FileWarning, Lock } from "lucide-react";
import CancelDialog from "@/components/CancelDialog";
import HistoryDialog from "@/components/HistoryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { AttachmentGallery } from "@/components/AttachmentGallery";
import { useAuth } from "@/lib/auth-context";

interface SitePurchaseItem {
  id: number;
  dprId: number;
  itemDescription: string;
  quantity: number | null;
  uom: string | null;
  vendor: string | null;
  billNo: string | null;
  amount: number | null;
  date: string;
  site: string;
  engineer: string;
  source?: "purchase" | "diesel";
  workType?: string | null;
  documentStatus?: string | null;
  hasRequiredDoc?: boolean;
}

export default function SitePurchasesReport() {
  const { toast } = useToast();
  const { isOwner, isAdmin } = useAuth();
  const isOwnerOrAdmin = isOwner || isAdmin;
  const search = useSearch();
  const sp = new URLSearchParams(search);
  const returnTo = sp.get("returnTo") || "/site/dashboard";

  const urlFilterKeys = ["dateFrom", "dateTo", "site", "workType"];
  const urlHasFilterParams = urlFilterKeys.some((k) => sp.has(k));
  const urlFilterDefaults = urlHasFilterParams
    ? {
        dateFrom: sp.get("dateFrom") ?? "",
        dateTo: sp.get("dateTo") ?? "",
        site: sp.get("site") ?? "",
        workType: sp.get("workType") ?? "",
      }
    : {};

  const [filters, setFilters, resetFilters] = usePersistedFilters(
    "site-purchases-report:filters:v1",
    {
      dateFrom: "",
      dateTo: "",
      site: "",
      workType: "",
      ...urlFilterDefaults,
    },
    { shouldHydrate: !urlHasFilterParams },
  );

  const [cancelItem, setCancelItem] = useState<SitePurchaseItem | null>(null);
  const [historyItem, setHistoryItem] = useState<SitePurchaseItem | null>(null);
  const [editingItem, setEditingItem] = useState<SitePurchaseItem | null>(null);
  const [editForm, setEditForm] = useState({
    itemDescription: "",
    quantity: "",
    uom: "",
    vendor: "",
    billNo: "",
    amount: "",
  });
  const hasActiveFilters =
    !!filters.dateFrom || !!filters.dateTo || !!filters.site || !!filters.workType;

  const queryString = new URLSearchParams({
    ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
    ...(filters.dateTo && { dateTo: filters.dateTo }),
    ...(filters.site && filters.site !== "all" && { site: filters.site }),
    ...(filters.workType && filters.workType !== "all" && { workType: filters.workType }),
  }).toString();

  const { data: purchases, isLoading } = useQuery<SitePurchaseItem[]>({
    queryKey: ["/api/site-purchases", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/site-purchases?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch site purchases");
      return res.json();
    },
  });

  const { data: dprs } = useQuery<any[]>({
    queryKey: ["/api/dprs"],
  });

  const uniqueSites = Array.from(new Set(dprs?.map(d => d.site).filter(Boolean) || [])).sort();

  const totalAmount = purchases?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
  const totalItems = purchases?.length || 0;

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/site-purchases/${id}`, { data });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      setEditingItem(null);
      toast({
        title: "Purchase Updated",
        description: "The site purchase entry has been updated successfully.",
      });
    },
    onError: (error: any) => {
      let msg = "Failed to update purchase";
      try {
        const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        msg = parsed.message || msg;
      } catch { msg = error.message || msg; }
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const finalSubmitMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/site-purchases/${id}/final-submit`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      toast({ title: "Purchase Final Submitted", description: "This purchase is now locked from further edits." });
    },
    onError: (error: any) => {
      let msg = "Failed to final-submit purchase";
      try {
        const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        msg = parsed.message || msg;
      } catch { msg = error.message || msg; }
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const openEdit = (item: SitePurchaseItem) => {
    setEditingItem(item);
    setEditForm({
      itemDescription: item.itemDescription || "",
      quantity: item.quantity?.toString() || "",
      uom: item.uom || "",
      vendor: item.vendor || "",
      billNo: item.billNo || "",
      amount: item.amount?.toString() || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      data: {
        itemDescription: editForm.itemDescription,
        quantity: editForm.quantity ? Number(editForm.quantity) : null,
        uom: editForm.uom || null,
        vendor: editForm.vendor || null,
        billNo: editForm.billNo || null,
        amount: editForm.amount ? Number(editForm.amount) : null,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href={returnTo}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Site Purchases Report</h1>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filters
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto gap-1" data-testid="button-reset-filters">
                  <X className="w-3 h-3" /> Clear
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm">From Date</Label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <Label className="text-sm">To Date</Label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                  data-testid="input-date-to"
                />
              </div>
              <div>
                <Label className="text-sm">Site</Label>
                <Select value={filters.site || "all"} onValueChange={(v) => setFilters(f => ({ ...f, site: v === "all" ? "" : v }))}>
                  <SelectTrigger data-testid="select-site-filter">
                    <SelectValue placeholder="All Sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sites</SelectItem>
                    {uniqueSites.map(site => (
                      <SelectItem key={site} value={site}>{site}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Work Type</Label>
                <Select value={filters.workType || "all"} onValueChange={(v) => setFilters(f => ({ ...f, workType: v === "all" ? "" : v }))}>
                  <SelectTrigger data-testid="select-worktype-filter">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="road">Road</SelectItem>
                    <SelectItem value="structure">Structure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Purchases</p>
              <p className="text-2xl font-bold" data-testid="text-total-items">{totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold text-teal-600" data-testid="text-total-amount">
                {totalAmount.toFixed(3)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : !purchases?.length ? (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-data">
                No site purchases found for the selected filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-purchases">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Site</th>
                      <th className="text-center p-2 font-medium">Source</th>
                      <th className="text-center p-2 font-medium">Work Type</th>
                      <th className="text-left p-2 font-medium">Item</th>
                      <th className="text-left p-2 font-medium">Vendor</th>
                      <th className="text-left p-2 font-medium">Bill No</th>
                      <th className="text-right p-2 font-medium">Qty</th>
                      <th className="text-left p-2 font-medium">UOM</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                      <th className="text-left p-2 font-medium">Reported By</th>
                      <th className="text-center p-2 font-medium">Status</th>
                      <th className="text-center p-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={`${p.source || 'purchase'}-${p.id}`} className="border-b last:border-0" data-testid={`row-purchase-${p.source || 'purchase'}-${p.id}`}>
                        <td className="p-2 whitespace-nowrap">{format(new Date(p.date + 'T00:00:00'), "dd-MMM-yyyy").toUpperCase()}</td>
                        <td className="p-2">{p.site}</td>
                        <td className="p-2 text-center">
                          <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded ${p.source === 'diesel' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
                            {p.source === 'diesel' ? 'DIESEL' : 'PURCHASE'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          {p.workType ? (
                            <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded ${p.workType === "structure" ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700"}`}>
                              {p.workType === "structure" ? "STRUCTURE" : "ROAD"}
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2">{p.itemDescription}</td>
                        <td className="p-2">{p.vendor || "-"}</td>
                        <td className="p-2">{p.billNo || "-"}</td>
                        <td className="p-2 text-right">{p.quantity ?? "-"}</td>
                        <td className="p-2">{p.uom || "-"}</td>
                        <td className="p-2 text-right">{p.amount ? p.amount.toFixed(3) : "-"}</td>
                        <td className="p-2">{p.engineer}</td>
                        <td className="p-2 text-center">
                          {p.source === 'diesel' ? (
                            <span className="text-[12px] text-muted-foreground">-</span>
                          ) : p.documentStatus === "submitted" ? (
                            <Badge variant="outline" className="text-[12px] px-1.5 py-0 border-emerald-400 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 gap-1" data-testid={`badge-doc-status-${p.id}`}>
                              <Lock className="w-3 h-3" /> Final Submitted
                            </Badge>
                          ) : !p.hasRequiredDoc ? (
                            <Badge variant="outline" className="text-[12px] px-1.5 py-0 border-red-400 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 gap-1" data-testid={`badge-doc-status-${p.id}`}>
                              <FileWarning className="w-3 h-3" /> Pending Document
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[12px] px-1.5 py-0 border-sky-400 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20" data-testid={`badge-doc-status-${p.id}`}>
                              Draft
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setHistoryItem(p)}
                              data-testid={`button-history-purchase-${p.id}`}
                              title="History"
                            >
                              <History className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            {p.source !== 'diesel' ? (
                              <>
                                {p.documentStatus !== "submitted" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => finalSubmitMutation.mutate(p.id)}
                                    disabled={finalSubmitMutation.isPending || !p.hasRequiredDoc}
                                    data-testid={`button-final-submit-purchase-${p.id}`}
                                    title={p.hasRequiredDoc ? "Final Submit" : "Upload a bill/invoice/receipt photo first"}
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  </Button>
                                )}
                                {(p.documentStatus !== "submitted" || isOwnerOrAdmin) && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEdit(p)}
                                      data-testid={`button-edit-purchase-${p.id}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setCancelItem(p)}
                                      data-testid={`button-cancel-purchase-${p.id}`}
                                      title="Cancel"
                                    >
                                      <Ban className="w-4 h-4 text-amber-600" />
                                    </Button>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-bold">
                      <td colSpan={9} className="p-2 text-right">Total:</td>
                      <td className="p-2 text-right">{totalAmount.toFixed(3)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Purchase Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Item Description</Label>
              <Input
                value={editForm.itemDescription}
                onChange={(e) => setEditForm(f => ({ ...f, itemDescription: e.target.value.toUpperCase() }))}
                data-testid="input-edit-item"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                  data-testid="input-edit-quantity"
                />
              </div>
              <div>
                <Label className="text-sm">UOM</Label>
                <Input
                  value={editForm.uom}
                  onChange={(e) => setEditForm(f => ({ ...f, uom: e.target.value.toUpperCase() }))}
                  data-testid="input-edit-uom"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Vendor</Label>
              <Input
                value={editForm.vendor}
                onChange={(e) => setEditForm(f => ({ ...f, vendor: e.target.value.toUpperCase() }))}
                data-testid="input-edit-vendor"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Bill No</Label>
                <Input
                  value={editForm.billNo}
                  onChange={(e) => setEditForm(f => ({ ...f, billNo: e.target.value.toUpperCase() }))}
                  data-testid="input-edit-billno"
                />
              </div>
              <div>
                <Label className="text-sm">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm(f => ({ ...f, amount: e.target.value }))}
                  data-testid="input-edit-amount"
                />
              </div>
            </div>
            {editingItem && (
              <div className="space-y-1.5">
                <Label className="text-sm">Attachments <span className="text-muted-foreground">(DC, invoice, photos)</span></Label>
                <AttachmentUploader moduleType="site_purchase" linkedRecordId={editingItem.id} docType="bill" />
                <AttachmentGallery moduleType="site_purchase" linkedRecordId={editingItem.id} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingItem(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelDialog
        open={!!cancelItem}
        onOpenChange={(v) => !v && setCancelItem(null)}
        cancelUrl={`/api/site-purchases/${cancelItem?.id}/cancel`}
        recordLabel={cancelItem ? `Purchase: ${cancelItem.itemDescription} (${cancelItem.site}, ${cancelItem.date})` : ""}
        invalidateQueryKeys={["/api/site-purchases"]}
      />
      <HistoryDialog
        open={!!historyItem}
        onOpenChange={(v) => !v && setHistoryItem(null)}
        module="site_purchases"
        transactionId={historyItem?.id ?? null}
        recordLabel={historyItem ? `Purchase: ${historyItem.itemDescription}` : undefined}
      />
    </div>
  );
}
