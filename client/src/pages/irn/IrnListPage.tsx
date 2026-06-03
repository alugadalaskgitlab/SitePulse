import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  ClipboardList, Plus, ChevronRight, AlertTriangle, Clock,
  CheckCircle2, Archive, ShieldCheck, XCircle, ShoppingCart,
  ListTodo, PackageCheck, Search, X, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InternalRequisitionWithItems } from "@shared/schema";

type ProcurementQueueItem = {
  itemId: number;
  irnId: number;
  irnNo: string;
  irnDate: string;
  raisedBy: string;
  raisedFrom: string;
  irnStatus: string;
  material: string;
  qty: number;
  uom: string;
  urgency: string;
  purpose: string;
  needByDate: string | null;
  procureQty: number | null;
  itemStatus: string;
  storesNotes: string | null;
  linkedPiId: number | null;
};

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "pending_stores", label: "Pending Stores" },
  { key: "stores_verified", label: "Awaiting Approval" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "closed", label: "Closed" },
  { key: "procurement_queue", label: "Procurement Queue" },
];

const URGENCY_COLOR: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  normal: "bg-gray-100 text-gray-600 border-gray-200",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "pending_stores")
    return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 font-medium text-xs gap-1"><Clock className="h-3 w-3" />Pending Stores</Badge>;
  if (status === "stores_verified")
    return <Badge className="bg-blue-50 text-blue-700 border border-blue-200 font-medium text-xs gap-1"><Clock className="h-3 w-3" />Awaiting Approval</Badge>;
  if (status === "approved")
    return <Badge className="bg-green-50 text-green-700 border border-green-200 font-medium text-xs gap-1"><ShieldCheck className="h-3 w-3" />Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-50 text-red-700 border border-red-200 font-medium text-xs gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border border-gray-200 font-medium text-xs gap-1"><Archive className="h-3 w-3" />Closed</Badge>;
}

function UrgencyDot({ items }: { items: InternalRequisitionWithItems["items"] }) {
  const hasUrgent = items.some((i) => i.urgency === "urgent");
  const hasHigh = items.some((i) => i.urgency === "high");
  if (hasUrgent) return <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3 w-3" />Urgent</span>;
  if (hasHigh) return <span className="text-xs text-orange-600">High</span>;
  return <span className="text-xs text-gray-400">Normal</span>;
}

function ProcurementQueueTab() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const canProcure = useAuth().sectionCan("site_procurement", "create");

  const { data: queueItems, isLoading } = useQuery<ProcurementQueueItem[]>({
    queryKey: ["/api/irn/procurement-queue"],
  });

  const raisePiMutation = useMutation({
    mutationFn: (irnId: number) =>
      apiRequest("POST", `/api/irn/${irnId}/raise-pi`).then(r => r.json()),
    onSuccess: (pi) => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn/procurement-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      toast({ title: "PI Raised", description: `${pi.indentNo} created from IRN queue` });
      navigate(`/plant/purchase-indents`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to raise PI", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="p-4 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (!queueItems?.length) {
    return (
      <div className="py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Procurement queue is empty</p>
        <p className="text-sm text-gray-400 mt-1">Items queued for purchase from verified IRNs will appear here</p>
      </div>
    );
  }

  const grouped = new Map<number, { header: ProcurementQueueItem; items: ProcurementQueueItem[] }>();
  for (const item of queueItems) {
    if (!grouped.has(item.irnId)) {
      grouped.set(item.irnId, { header: item, items: [] });
    }
    grouped.get(item.irnId)!.items.push(item);
  }

  return (
    <div className="divide-y divide-gray-100">
      {[...grouped.values()].map(({ header, items }) => {
        const hasPi = items.some(i => i.linkedPiId != null);
        const piId = items.find(i => i.linkedPiId != null)?.linkedPiId;
        const isRaising = raisePiMutation.isPending && raisePiMutation.variables === header.irnId;
        const hasProcureableItems = items.some(i => (i.procureQty ?? i.qty) > 0);

        return (
          <div key={header.irnId} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => navigate(`/irn/${header.irnId}`)}
                  className="font-mono font-semibold text-amber-700 text-sm hover:underline"
                >
                  {header.irnNo}
                </button>
                <span className="text-sm text-gray-600">{header.raisedBy}</span>
                <span className="text-xs text-gray-400">{header.raisedFrom}</span>
                <span className="text-xs text-gray-400">
                  {header.irnDate ? format(new Date(header.irnDate), "dd MMM yyyy") : "—"}
                </span>
                {hasPi && piId && (
                  <button
                    onClick={() => navigate("/plant/purchase-indents")}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-indigo-50 border-indigo-200 text-indigo-700 hover:opacity-80"
                  >
                    <ShoppingCart className="h-3 w-3" /> PI #{piId} Raised
                  </button>
                )}
              </div>
              {canProcure && !hasPi && hasProcureableItems && (
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shrink-0"
                  disabled={isRaising}
                  onClick={() => raisePiMutation.mutate(header.irnId)}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {isRaising ? "Raising…" : "Raise PI"}
                </Button>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Material</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Procure Qty</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Urgency</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Need By</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => (
                    <tr key={item.itemId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-800">{item.material}</p>
                        <p className="text-xs text-gray-400">{item.purpose}</p>
                        {item.storesNotes && <p className="text-xs text-blue-600 mt-0.5">Stores: {item.storesNotes}</p>}
                      </td>
                      <td className="px-3 py-2 font-semibold text-gray-800">
                        {item.procureQty ?? item.qty} <span className="font-normal text-gray-500">{item.uom}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${URGENCY_COLOR[item.urgency] ?? URGENCY_COLOR.normal}`}>
                          {item.urgency === "urgent" ? "🔴 Urgent" : item.urgency === "high" ? "🟠 High" : "Normal"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {item.needByDate ? format(new Date(item.needByDate), "dd MMM yyyy") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {item.itemStatus === "queued_procurement" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                            <ListTodo className="h-3 w-3" /> Queued
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                            <PackageCheck className="h-3 w-3" /> Partial Issue
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function IrnListPage() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [raisedByFilter, setRaisedByFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { sectionCan } = useAuth();
  const canRaise = sectionCan("irn_raise", "create");

  const hasFilters = keyword || raisedByFilter || dateFrom || dateTo;

  function clearFilters() {
    setKeyword("");
    setRaisedByFilter("");
    setDateFrom("");
    setDateTo("");
  }

  const apiParams = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p.toString();
  }, [statusFilter, dateFrom, dateTo]);

  const { data: irns, isLoading } = useQuery<InternalRequisitionWithItems[]>({
    queryKey: ["/api/irn", statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const qs = apiParams ? `?${apiParams}` : "";
      const res = await fetch(`/api/irn${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch IRNs");
      return res.json();
    },
    enabled: statusFilter !== "procurement_queue",
  });

  const filteredIrns = useMemo(() => {
    if (!irns) return [];
    const kw = keyword.trim().toLowerCase();
    const rb = raisedByFilter.trim().toLowerCase();
    return irns.filter((irn) => {
      if (kw) {
        const irnNoMatch = irn.irnNo.toLowerCase().includes(kw);
        const itemMatch = irn.items.some((i) => i.material.toLowerCase().includes(kw));
        if (!irnNoMatch && !itemMatch) return false;
      }
      if (rb && !irn.raisedBy.toLowerCase().includes(rb)) return false;
      return true;
    });
  }, [irns, keyword, raisedByFilter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <ClipboardList className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Internal Requisitions</h1>
              <p className="text-xs text-gray-500">Raise and track material requests through stores</p>
            </div>
          </div>
          {canRaise && (
            <Link href="/irn/new">
              <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2" data-testid="button-raise-irn">
                <Plus className="h-4 w-4" /> Raise New IRN
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">
        {/* Status tabs */}
        <div className="flex gap-1 bg-white border rounded-lg p-1 mb-4 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              data-testid={`tab-status-${tab.key}`}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                statusFilter === tab.key
                  ? tab.key === "procurement_queue"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-amber-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search / filter bar — hidden on procurement queue tab */}
        {statusFilter !== "procurement_queue" && (
          <div className="bg-white border rounded-lg p-3 mb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Keyword */}
              <div className="sm:col-span-2 lg:col-span-1 space-y-1">
                <Label className="text-xs font-medium text-gray-500">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    data-testid="input-irn-keyword"
                    className="pl-8 h-8 text-sm"
                    placeholder="IRN no. or item…"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </div>
              </div>

              {/* Raised by */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500">Raised By</Label>
                <Input
                  data-testid="input-irn-raised-by"
                  className="h-8 text-sm"
                  placeholder="Name…"
                  value={raisedByFilter}
                  onChange={(e) => setRaisedByFilter(e.target.value)}
                />
              </div>

              {/* Date From */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> From
                </Label>
                <Input
                  data-testid="input-irn-date-from"
                  type="date"
                  className="h-8 text-sm"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              {/* Date To */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> To
                </Label>
                <Input
                  data-testid="input-irn-date-to"
                  type="date"
                  className="h-8 text-sm"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {hasFilters && (
              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-xs text-gray-500">
                  {filteredIrns.length} result{filteredIrns.length !== 1 ? "s" : ""} matching filters
                </span>
                <button
                  data-testid="button-clear-filters"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        <div className="bg-white border rounded-lg overflow-hidden">
          {statusFilter === "procurement_queue" ? (
            <ProcurementQueueTab />
          ) : isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !filteredIrns.length ? (
            <div className="py-16 text-center">
              <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium" data-testid="text-no-irns">
                {hasFilters ? "No requisitions match your filters" : "No requisitions found"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {hasFilters
                  ? "Try adjusting your search or date range"
                  : statusFilter === "all"
                  ? "Raise your first IRN to get started"
                  : `No ${STATUS_TABS.find(t => t.key === statusFilter)?.label.toLowerCase()} requisitions`}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IRN No.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Raised By</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Section</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Urgency</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action By</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIrns.map((irn) => (
                  <tr
                    key={irn.id}
                    data-testid={`row-irn-${irn.id}`}
                    className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/irn/${irn.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700">{irn.irnNo}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{irn.raisedBy}</td>
                    <td className="px-4 py-3 text-gray-600">{irn.raisedFrom}</td>
                    <td className="px-4 py-3 text-gray-600">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="text-xs text-gray-400 block">{irn.items.length} item{irn.items.length !== 1 ? "s" : ""}</span>
                      <span className="text-xs text-gray-700 leading-snug">
                        {irn.items.slice(0, 3).map(i => i.material).join(", ")}
                        {irn.items.length > 3 ? ` +${irn.items.length - 3} more` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3"><UrgencyDot items={irn.items} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={irn.status} />
                        {(irn as any).linkedPiId && (
                          <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium text-xs gap-1">
                            <ShoppingCart className="h-3 w-3" />PI Raised
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {irn.status === "approved" && irn.approvedBy
                        ? <span className="text-green-700">{irn.approvedBy}{irn.approvedAt ? ` · ${format(new Date(irn.approvedAt), "dd MMM")}` : ""}</span>
                        : irn.status === "rejected" && irn.rejectedBy
                        ? <span className="text-red-600">{irn.rejectedBy}{irn.rejectedAt ? ` · ${format(new Date(irn.rejectedAt), "dd MMM")}` : ""}</span>
                        : irn.status === "stores_verified" && irn.storesVerifiedBy
                        ? <span className="text-blue-600">{irn.storesVerifiedBy}</span>
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
