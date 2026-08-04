/**
 * Instruction 024 — Earthwork Control Page
 *
 * Accessible at /work-program/:id/earthwork
 * Shows all earthwork BOQ items for a project with arrangement status,
 * classification actions, and links to the arrangement dialog.
 */

import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  EarthworkArrangementCell,
  ArrangementStatusBadge,
} from "@/components/EarthworkArrangementDialog";
import type { EarthworkArrangementSummary } from "@shared/planningEngine";
import { invalidateArrangementQueries } from "@/lib/arrangementCache";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EarthworkRow {
  materialName: string;
  totalDemand: number;
  demandUpToSelectedDate: number;
  uom: string;
  procurementStatus?: string;
  earthworkBoqItemId?: number | null;
  earthworkArrangements?: EarthworkArrangementSummary[];
  earthworkSourceBoqItemIds?: number[];
  boqItemId?: number | null;
}

// ─── Classification row actions ───────────────────────────────────────────────

function ClassifyMaterialActions({
  itemId,
  onSaved,
}: {
  itemId: number;
  onSaved: () => void;
}) {
  const { toast } = useToast();

  const classifyMutation = useMutation({
    mutationFn: async (classification: string) => {
      const res = await fetch(`/api/boq/items/${itemId}/bulk-classification`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
      return data;
    },
    onSuccess: (_, classification) => {
      toast({ title: `Classified as ${classification === "earthwork" ? "Earthwork" : "Vendor Supplied"}` });
      onSaved();
    },
    onError: (err: Error) => {
      toast({ title: "Classification failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex gap-1.5 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] text-teal-700 hover:bg-teal-50 border-teal-200"
        disabled={classifyMutation.isPending}
        onClick={() => classifyMutation.mutate("earthwork")}
      >
        {classifyMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Earthwork
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] text-blue-700 hover:bg-blue-50 border-blue-200"
        disabled={classifyMutation.isPending}
        onClick={() => classifyMutation.mutate("vendor_supplied")}
      >
        {classifyMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Vendor Supplied
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EarthworkControl() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ rows: EarthworkRow[] }>({
    queryKey: ["shortage-check", projectId],
    queryFn: () =>
      fetch(`/api/boq/projects/${projectId}/shortage-check`, { credentials: "include" })
        .then(r => r.json()),
    enabled: projectId > 0,
  });

  const allRows = data?.rows ?? [];
  const earthworkRows = allRows.filter(
    r =>
      r.procurementStatus === "earthwork_arrangement_required" ||
      r.procurementStatus === "earthwork_classification_required"
  );

  // Summary calculations
  const totalQty = earthworkRows.reduce((s, r) => s + r.totalDemand, 0);
  const totalAllocated = earthworkRows.reduce((s, r) => {
    const active = (r.earthworkArrangements ?? []).filter(a => a.status !== "cancelled");
    return s + active.reduce((sum, a) => sum + a.allocatedQty, 0);
  }, 0);
  const totalCompleted = earthworkRows.reduce((s, r) => {
    const active = (r.earthworkArrangements ?? []).filter(a => a.status !== "cancelled");
    return s + active.reduce((sum, a) => sum + (a.completedQty ?? 0), 0);
  }, 0);
  const totalUnallocated = Math.max(0, totalQty - totalAllocated);

  const handleSaved = () => {
    // Instruction 026 A2: refresh all demand-affected queries, not just shortage rows
    invalidateArrangementQueries(queryClient, projectId);
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      {/* 029A Part E: SPA navigation (no full page reload) + breadcrumb context */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/work-program/${projectId}`}
          className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700"
          data-testid="link-back-work-programme"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Work Programme
        </Link>
        <span className="text-slate-300 text-[12px]">|</span>
        <Link
          href={`/work-program/${projectId}/demand`}
          className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700"
          data-testid="link-work-demand"
        >
          Work Demand
        </Link>
      </div>
      <div className="text-[11px] text-slate-400" data-testid="text-breadcrumb">
        Work Programme › Earthwork Control
      </div>
      <div>
        <h1 className="text-xl font-bold text-slate-800">Execution Arrangements — Classification & Demand</h1>
        <Link href={`/work-program/${projectId}/execution-arrangements`} className="text-[12px] text-teal-600 hover:underline ml-2">
          Open register →
        </Link>
        <p className="text-[13px] text-slate-500">
          Manage earthwork execution arrangements and material classifications
        </p>
      </div>

      {/* Summary bar */}
      {!isLoading && earthworkRows.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Total Earthwork Qty</p>
            <p className="text-lg font-bold text-slate-800 font-mono">{totalQty.toLocaleString()} <span className="text-sm font-normal text-slate-500">CUM</span></p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Allocated</p>
            <p className="text-lg font-bold text-blue-700 font-mono">{totalAllocated.toLocaleString()} <span className="text-sm font-normal text-slate-500">CUM</span></p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Completed</p>
            <p className="text-lg font-bold text-emerald-700 font-mono">{totalCompleted.toLocaleString()} <span className="text-sm font-normal text-slate-500">CUM</span></p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Unallocated</p>
            <p className={`text-lg font-bold font-mono ${totalUnallocated > 0 ? "text-amber-700" : "text-slate-500"}`}>
              {totalUnallocated.toLocaleString()} <span className="text-sm font-normal text-slate-500">CUM</span>
            </p>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading earthwork data...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-red-700">Failed to load earthwork data. Please try again.</p>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && earthworkRows.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-slate-500 text-[13px]">No earthwork items found for this project.</p>
          <p className="text-slate-400 text-[12px] mt-1">
            Earthwork BOQ items with "Execution Arrangement Required" or "Classification Required" status will appear here.
          </p>
        </Card>
      )}

      {/* Main table */}
      {!isLoading && earthworkRows.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-[11px] font-semibold text-slate-600 w-[220px]">Material / BOQ Item</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 text-right w-[100px]">Total Qty (CUM)</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 text-right w-[90px]">Allocated</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 text-right w-[90px]">Completed</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 text-right w-[90px]">Balance</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 w-[180px]">Arrangements</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {earthworkRows.map((row, idx) => {
                const activeArrs = (row.earthworkArrangements ?? []).filter(a => a.status !== "cancelled");
                const allocated = activeArrs.reduce((s, a) => s + a.allocatedQty, 0);
                const completed = activeArrs.reduce((s, a) => s + (a.completedQty ?? 0), 0);
                const balance = Math.max(0, row.totalDemand - allocated);
                const isClassificationRequired = row.procurementStatus === "earthwork_classification_required";
                const boqItemId = row.earthworkBoqItemId ?? row.boqItemId ?? null;

                return (
                  <TableRow key={idx} className="align-top">
                    {/* Material name */}
                    <TableCell className="py-3">
                      <p className="text-[12px] font-semibold text-slate-800">{row.materialName}</p>
                      {isClassificationRequired && (
                        <Badge variant="outline" className="mt-1 text-[10px] text-amber-700 border-amber-300 bg-amber-50">
                          Classification Required
                        </Badge>
                      )}
                    </TableCell>

                    {/* Quantities */}
                    <TableCell className="text-right text-[12px] font-mono py-3">
                      {row.totalDemand.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono py-3 text-blue-700">
                      {allocated > 0 ? allocated.toLocaleString() : <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono py-3 text-emerald-700">
                      {completed > 0 ? completed.toLocaleString() : <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell className={`text-right text-[12px] font-mono py-3 ${balance > 0 ? "text-amber-700" : "text-slate-400"}`}>
                      {balance.toLocaleString()}
                    </TableCell>

                    {/* Arrangements summary */}
                    <TableCell className="py-3">
                      {activeArrs.length === 0 ? (
                        <span className="text-[11px] text-slate-400">None</span>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-600">{activeArrs.length} arrangement{activeArrs.length !== 1 ? "s" : ""}</span>
                          <div className="flex flex-wrap gap-1">
                            {activeArrs.map(a => (
                              <ArrangementStatusBadge key={a.id} status={a.status} />
                            ))}
                          </div>
                        </div>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3">
                      {isClassificationRequired ? (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-slate-600">Classify this material:</p>
                          {boqItemId != null ? (
                            <ClassifyMaterialActions itemId={boqItemId} onSaved={handleSaved} />
                          ) : (
                            <span className="text-[11px] text-slate-400">No BOQ item ID</span>
                          )}
                        </div>
                      ) : (
                        <EarthworkArrangementCell
                          row={row}
                          projectId={projectId}
                          onSaved={handleSaved}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
