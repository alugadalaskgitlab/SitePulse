import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { ClipboardList, Plus, ChevronRight, AlertTriangle, Clock, CheckCircle2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import type { InternalRequisitionWithItems } from "@shared/schema";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "pending_stores", label: "Pending Stores" },
  { key: "stores_verified", label: "Stores Verified" },
  { key: "closed", label: "Closed" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "pending_stores")
    return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 font-medium text-xs gap-1"><Clock className="h-3 w-3" />Pending Stores</Badge>;
  if (status === "stores_verified")
    return <Badge className="bg-green-50 text-green-700 border border-green-200 font-medium text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Stores Verified</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border border-gray-200 font-medium text-xs gap-1"><Archive className="h-3 w-3" />Closed</Badge>;
}

function UrgencyDot({ items }: { items: InternalRequisitionWithItems["items"] }) {
  const hasUrgent = items.some((i) => i.urgency === "urgent");
  const hasHigh = items.some((i) => i.urgency === "high");
  if (hasUrgent) return <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3 w-3" />Urgent</span>;
  if (hasHigh) return <span className="text-xs text-orange-600">High</span>;
  return <span className="text-xs text-gray-400">Normal</span>;
}

export default function IrnListPage() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const { sectionCan } = useAuth();
  const canRaise = sectionCan("irn_raise", "create");

  const { data: irns, isLoading } = useQuery<InternalRequisitionWithItems[]>({
    queryKey: ["/api/irn", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/irn${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch IRNs");
      return res.json();
    },
  });

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
              <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
                <Plus className="h-4 w-4" /> Raise New IRN
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">
        {/* Status tabs */}
        <div className="flex gap-1 bg-white border rounded-lg p-1 mb-5 w-fit">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                statusFilter === tab.key
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !irns?.length ? (
            <div className="py-16 text-center">
              <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No requisitions found</p>
              <p className="text-sm text-gray-400 mt-1">
                {statusFilter === "all" ? "Raise your first IRN to get started" : `No ${STATUS_TABS.find(t => t.key === statusFilter)?.label.toLowerCase()} requisitions`}
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {irns.map((irn) => (
                  <tr
                    key={irn.id}
                    className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/irn/${irn.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700">{irn.irnNo}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{irn.raisedBy}</td>
                    <td className="px-4 py-3 text-gray-600">{irn.raisedFrom}</td>
                    <td className="px-4 py-3 text-gray-600">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{irn.items.length} item{irn.items.length !== 1 ? "s" : ""}</td>
                    <td className="px-4 py-3"><UrgencyDot items={irn.items} /></td>
                    <td className="px-4 py-3"><StatusBadge status={irn.status} /></td>
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
