/**
 * Batch 06B — READ-ONLY prior-DPR preview, opened from a chainage-overlap
 * warning over the LIVE DPR entry form. The entry form stays mounted; closing
 * returns to it exactly as it was. Deliberately exposes NO Edit / Cancel /
 * Delete or any other mutation action — the purpose is only "show me what was
 * recorded earlier so I can decide whether today's overlap is legitimate".
 * The referenced progress row is highlighted so the engineer doesn't have to
 * hunt for it.
 */
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatChainageKm } from "@shared/barSide";
import { DprPhotoGroups } from "@/components/DprPhotoGroups";
import { layerDisplayName } from "@shared/layerDisplay";

type PreviewDpr = {
  id: number;
  date: string;
  site: string | null;
  engineer: string | null;
  weather?: string | null;
  remarks?: string | null;
  dprStatus?: string | null;
  progress: Array<{
    id: number;
    activity: string | null;
    side: string | null;
    chainageFrom: string | null;
    chainageTo: string | null;
    chainageFromKm: number | null;
    chainageToKm: number | null;
    length: number | null;
    width: number | null;
    thickness: number | null;
    layerNo: number | null;
    quantity: number | null;
    uom: string | null;
    chainageOverrideReason?: string | null;
    entryKey?: string | null;
  }>;
  equipment?: Array<{ id: number; machine: string | null; hoursWorked: number | null; numberOfTrips: number | null; diesel: number | null }>;
};

function chLabel(p: { chainageFrom: string | null; chainageTo: string | null; chainageFromKm: number | null; chainageToKm: number | null }): string {
  if (p.chainageFrom || p.chainageTo) return `${p.chainageFrom ?? "?"} – ${p.chainageTo ?? "?"}`;
  if (p.chainageFromKm != null || p.chainageToKm != null) {
    return `${formatChainageKm(p.chainageFromKm ?? undefined) || "?"} – ${formatChainageKm(p.chainageToKm ?? undefined) || "?"}`;
  }
  return "—";
}

export function DprPreviewDialog({
  dprId, highlightEntryId, onClose,
}: {
  dprId: number | null;
  highlightEntryId?: number | null;
  onClose: () => void;
}) {
  const { data: dpr, isLoading, isError } = useQuery<PreviewDpr>({
    queryKey: ["/api/dprs", dprId],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/${dprId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load DPR");
      return res.json();
    },
    enabled: dprId != null,
    staleTime: 60_000,
  });

  return (
    <Dialog open={dprId != null} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dpr-preview-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            DPR-{dprId}
            <Badge variant="secondary" data-testid="dpr-preview-readonly-badge">Read-only</Badge>
          </DialogTitle>
          <DialogDescription>
            Previously submitted report — shown for reference while you complete today's entry.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-slate-500 py-4">Loading…</p>}
        {isError && <p className="text-sm text-red-600 py-4">Could not load this DPR.</p>}
        {dpr && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div><p className="text-xs text-slate-500">Date</p><p className="font-medium text-slate-900 dark:text-slate-100" data-testid="dpr-preview-date">{dpr.date}</p></div>
              <div><p className="text-xs text-slate-500">Site</p><p className="font-medium text-slate-900 dark:text-slate-100">{dpr.site ?? "—"}</p></div>
              <div><p className="text-xs text-slate-500">Engineer</p><p className="font-medium text-slate-900 dark:text-slate-100">{dpr.engineer ?? "—"}</p></div>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Activity progress</p>
              <div className="border rounded-md divide-y">
                {(dpr.progress ?? []).length === 0 && <p className="px-3 py-2 text-slate-500">No progress rows.</p>}
                {(dpr.progress ?? []).map((p) => {
                  const highlighted = highlightEntryId != null && p.id === highlightEntryId;
                  return (
                    <div
                      key={p.id}
                      className={`px-3 py-2 ${highlighted ? "bg-amber-50 dark:bg-amber-950/40 border-l-4 border-l-amber-500" : ""}`}
                      ref={highlighted ? (el) => { el?.scrollIntoView({ block: "center" }); } : undefined}
                      data-testid={highlighted ? "dpr-preview-highlight-row" : undefined}
                    >
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {p.activity ?? "—"}
                        {p.layerNo != null && (
                          <Badge variant="outline" className="ml-2">
                            {layerDisplayName(p.activity, p.layerNo)}
                          </Badge>
                        )}
                        {highlighted && <Badge className="ml-2 bg-amber-500 text-white">Referenced row</Badge>}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        {p.side ? `${p.side} · ` : ""}Ch. {chLabel(p)}
                        {p.quantity != null ? ` · ${p.quantity} ${p.uom ?? ""}` : ""}
                        {p.width != null ? ` · W ${p.width}m` : ""}
                        {p.thickness != null ? ` · T ${p.thickness}m` : ""}
                      </p>
                      {p.chainageOverrideReason && (
                        <p className="text-xs text-slate-500 mt-0.5">Reason recorded: {p.chainageOverrideReason}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {(dpr.equipment ?? []).length > 0 && (
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Equipment</p>
                <div className="border rounded-md divide-y">
                  {(dpr.equipment ?? []).map((e) => (
                    <div key={e.id} className="px-3 py-1.5 text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{e.machine ?? "—"}</span>
                      {e.hoursWorked != null ? ` · ${e.hoursWorked} hrs` : ""}
                      {e.numberOfTrips != null ? ` · ${e.numberOfTrips} trips` : ""}
                      {e.diesel != null ? ` · ${e.diesel} L diesel` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dpr.remarks && (
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks</p>
                <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{dpr.remarks}</p>
              </div>
            )}
            {/* Task #1409: photos, grouped per activity (read-only) */}
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Photos</p>
              <DprPhotoGroups
                dprId={dpr.id}
                progress={dpr.progress ?? []}
                allowDelete={false}
                emptyText="No photos on this report."
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
