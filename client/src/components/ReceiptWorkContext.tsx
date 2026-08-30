/**
 * Batch 06E-F — Work Context section for the standalone Site Material Trip
 * (Material Received) form, plus a read-only context display for saved trips.
 *
 * Raw IDs are never shown as the primary UI —
 * users pick a Project, a Work Item, an Execution Arrangement, and (where a
 * reliable one exists) a Programme / Reach by readable labels. The shared
 * seam `shared/materialReceiptSummary.ts` decides which arrangements apply
 * and when auto-prefill is allowed (exactly one applicable arrangement).
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { boqItemDisplayName } from "@shared/boqItemName";
import { barSideLabel } from "@shared/barSide";
import {
  resolveApplicableArrangements,
  receiptRelevanceForType,
  type ApplicableArrangementInput,
  type ArrangementBarAllocation,
} from "@shared/materialReceiptSummary";
import type { Site } from "@shared/schema";

export interface TripWorkContext {
  boqProjectId: number | null;
  boqItemId: number | null;
  programmeBarId: number | null;
  earthworkArrangementId: number | null;
}

export const EMPTY_WORK_CONTEXT: TripWorkContext = {
  boqProjectId: null,
  boqItemId: null,
  programmeBarId: null,
  earthworkArrangementId: null,
};

/** BOQ-item changes are atomic: a programme reach and commercial arrangement
 * from the previous item must never survive the transition. */
export function workContextForBoqItem(
  value: TripWorkContext,
  boqItemId: number | null,
): TripWorkContext {
  return { ...value, boqItemId, programmeBarId: null, earthworkArrangementId: null };
}

export function hasRequiredWorkContext(value: TripWorkContext): boolean {
  return value.boqProjectId != null && value.boqItemId != null;
}

type BoqItemRow = { id: number; description: string; itemCode: string | null; unit: string; displayName?: string | null };
type BarRow = { id: number; reachLabel: string | null; chainageFrom: number | null; chainageTo: number | null; side: string | null; startDate: string | null; endDate: string | null };
type ArrangementRow = ApplicableArrangementInput & {
  workDescription?: string | null;
  agreedRate?: number | string | null;
  uom?: string | null;
  chainageFrom?: number | string | null;
  chainageTo?: number | string | null;
};

const fmtCh = (v: number | string | null | undefined) => {
  const n = v == null ? null : Number(v);
  if (n == null || !Number.isFinite(n)) return null;
  const km = Math.floor(n);
  return `${km}+${String(Math.round((n - km) * 1000)).padStart(3, "0")}`;
};

export function arrangementLabel(a: ArrangementRow): string {
  const parts = [
    [a.agencyName, a.materialLabel ?? a.workDescription].filter(Boolean).join(" — "),
  ];
  const ch = fmtCh(a.chainageFrom) && fmtCh(a.chainageTo) ? `Ch. ${fmtCh(a.chainageFrom)}–${fmtCh(a.chainageTo)}` : null;
  if (ch) parts.push(ch);
  const rate = a.agreedRate != null && Number(a.agreedRate) > 0 ? `₹${Number(a.agreedRate)}/${a.uom ?? ""}`.replace(/\/$/, "") : null;
  if (rate) parts.push(rate);
  return parts.filter(Boolean).join(" · ") || `Arrangement #${a.id}`;
}

export function barLabel(b: BarRow): string {
  const bits = [
    b.side ? barSideLabel(b.side) : null,
    fmtCh(b.chainageFrom) != null && fmtCh(b.chainageTo) != null ? `Ch. ${fmtCh(b.chainageFrom)}–${fmtCh(b.chainageTo)}` : b.reachLabel,
    b.startDate && b.endDate ? `${b.startDate} → ${b.endDate}` : null,
  ].filter(Boolean);
  return bits.join(" · ") || `Bar #${b.id}`;
}

/** Data hooks shared by the form section and the read-only display. */
function useProjectContextData(boqProjectId: number | null, boqItemId: number | null) {
  const { data: items = [] } = useQuery<BoqItemRow[]>({
    queryKey: ["/api/boq/projects", boqProjectId, "items"],
    enabled: boqProjectId != null,
  });
  const { data: arrangements = [] } = useQuery<ArrangementRow[]>({
    queryKey: ["earthwork-arrangements-item", boqProjectId, boqItemId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/earthwork-arrangements/item/${boqItemId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: boqProjectId != null && boqItemId != null,
  });
  const { data: allocations = [] } = useQuery<ArrangementBarAllocation[]>({
    queryKey: ["arrangement-programme-allocations", boqProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${boqProjectId}/arrangement-programme-allocations`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: boqProjectId != null,
  });
  const { data: bars = [] } = useQuery<BarRow[]>({
    queryKey: ["/api/dpr/programme-bars", boqProjectId, boqItemId],
    queryFn: async () => {
      const res = await fetch(`/api/dpr/programme-bars?projectId=${boqProjectId}&boqItemId=${boqItemId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: boqProjectId != null && boqItemId != null,
  });
  return { items, arrangements, allocations, bars };
}

export function ReceiptWorkContext({
  siteName,
  sitesList,
  value,
  onChange,
  onArrangementPrefill,
  required = false,
  testIdPrefix = "work-ctx",
}: {
  siteName: string;
  sitesList: Site[];
  value: TripWorkContext;
  onChange: (next: TripWorkContext) => void;
  /** Called when an arrangement is (auto-)selected so the parent form can
      prefill Material/Supplier — the parent decides whether to overwrite. */
  onArrangementPrefill?: (p: { material: string | null; supplier: string | null; clientSupplied: boolean; external: boolean }) => void;
  /** Standalone trip entry requires a project and intended BOQ activity. */
  required?: boolean;
  testIdPrefix?: string;
}) {
  const siteId = useMemo(() => sitesList.find((s) => s.name === siteName)?.id ?? null, [sitesList, siteName]);
  const { data: projects = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/boq/projects", siteId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects?siteId=${siteId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: siteId != null,
  });

  // A site normally has exactly one BOQ project — auto-select it.
  useEffect(() => {
    if (value.boqProjectId == null && projects.length === 1) {
      onChange({ ...EMPTY_WORK_CONTEXT, boqProjectId: projects[0].id });
    }
    // Site changed away from the linked project → clear stale context.
    if (value.boqProjectId != null && projects.length > 0 && !projects.some((p) => p.id === value.boqProjectId)) {
      onChange(EMPTY_WORK_CONTEXT);
    }
  }, [projects, value.boqProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { items, arrangements, allocations, bars } = useProjectContextData(value.boqProjectId, value.boqItemId);

  const resolution = useMemo(
    () =>
      value.boqProjectId != null && value.boqItemId != null
        ? resolveApplicableArrangements(arrangements, { boqProjectId: value.boqProjectId, boqItemId: value.boqItemId, programmeBarId: value.programmeBarId }, allocations)
        : null,
    [arrangements, allocations, value.boqProjectId, value.boqItemId, value.programmeBarId],
  );

  // Auto-preselect when exactly one arrangement applies; fire prefill hook.
  useEffect(() => {
    if (!resolution) return;
    if (resolution.prefill && value.earthworkArrangementId == null) {
      onChange({ ...value, earthworkArrangementId: resolution.prefill.id });
      const rel = receiptRelevanceForType(resolution.prefill.arrangementType);
      onArrangementPrefill?.({
        material: resolution.prefill.materialLabel ?? null,
        supplier: rel === "none" ? null : resolution.prefill.agencyName ?? null,
        clientSupplied: resolution.prefill.arrangementType === "client_supplied",
        external: rel !== "none",
      });
    }
    // Selected arrangement no longer applicable (item changed) → clear it.
    if (value.earthworkArrangementId != null && !resolution.applicable.some((a) => a.id === value.earthworkArrangementId)) {
      onChange({ ...value, earthworkArrangementId: null });
    }
  }, [resolution?.prefill?.id, resolution?.applicable?.length, value.boqItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedArrangement = resolution?.applicable.find((a) => a.id === value.earthworkArrangementId) ?? null;

  if (siteId == null || projects.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3" data-testid={`${testIdPrefix}-section`}>
      <div className="flex items-center gap-2">
        <Label className="text-sm font-semibold">BOQ Item / Intended Activity{required ? " *" : ""}</Label>
        <span className="text-xs text-muted-foreground">
          {required ? "(required for this material trip)" : "(links this receipt to the work it serves)"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {projects.length > 1 && (
          <div>
            <Label className="text-xs">Project{required ? " *" : ""}</Label>
            <Select
              value={value.boqProjectId != null ? String(value.boqProjectId) : ""}
              onValueChange={(v) => onChange({ ...EMPTY_WORK_CONTEXT, boqProjectId: Number(v) })}
            >
              <SelectTrigger data-testid={`${testIdPrefix}-select-project`}><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label className="text-xs">Work Item / BOQ Activity{required ? " *" : ""}</Label>
          <Select
            value={value.boqItemId != null ? String(value.boqItemId) : "none"}
            onValueChange={(v) =>
              onChange(workContextForBoqItem(value, v === "none" ? null : Number(v)))
            }
            disabled={value.boqProjectId == null}
          >
            <SelectTrigger data-testid={`${testIdPrefix}-select-item`}><SelectValue placeholder="Select work item" /></SelectTrigger>
            <SelectContent>
              {!required && <SelectItem value="none">— Not linked to a work item —</SelectItem>}
              {items.map((it) => (
                <SelectItem key={it.id} value={String(it.id)}>{boqItemDisplayName(it)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {value.boqItemId != null && resolution && !resolution.none && (
          <div>
            <Label className="text-xs">Execution Arrangement</Label>
            {resolution.applicable.length === 1 ? (
              <p className="text-xs mt-1.5 font-medium" data-testid={`${testIdPrefix}-arrangement-single`}>
                {arrangementLabel(resolution.applicable[0])}
                {resolution.applicable[0].arrangementType === "client_supplied" && (
                  <Badge variant="outline" className="ml-1.5 text-[10px]">Client supplied</Badge>
                )}
              </p>
            ) : (
              <Select
                value={value.earthworkArrangementId != null ? String(value.earthworkArrangementId) : ""}
                onValueChange={(v) => {
                  const a = resolution.applicable.find((x) => x.id === Number(v));
                  onChange({ ...value, earthworkArrangementId: Number(v) });
                  if (a) {
                    const rel = receiptRelevanceForType(a.arrangementType);
                    onArrangementPrefill?.({
                      material: a.materialLabel ?? null,
                      supplier: rel === "none" ? null : a.agencyName ?? null,
                      clientSupplied: a.arrangementType === "client_supplied",
                      external: rel !== "none",
                    });
                  }
                }}
              >
                <SelectTrigger data-testid={`${testIdPrefix}-select-arrangement`}><SelectValue placeholder="Select arrangement (multiple apply)" /></SelectTrigger>
                <SelectContent>
                  {resolution.applicable.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{arrangementLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        {value.boqItemId != null && resolution?.none && (
          <div className="flex items-end pb-1">
            <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-no-arrangement`}>
              No execution arrangement linked — receipt entry still works.
            </span>
          </div>
        )}
        {value.boqItemId != null && bars.length > 0 && (
          <div>
            <Label className="text-xs">Programme / Reach <span className="text-muted-foreground">(where applicable)</span></Label>
            <Select
              value={value.programmeBarId != null ? String(value.programmeBarId) : "none"}
              onValueChange={(v) => onChange({ ...value, programmeBarId: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger data-testid={`${testIdPrefix}-select-bar`}><SelectValue placeholder="Not linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Not linked to a programme reach —</SelectItem>
                {bars.map((b) => <SelectItem key={b.id} value={String(b.id)}>{barLabel(b)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {selectedArrangement && receiptRelevanceForType(selectedArrangement.arrangementType) === "none" && (
        <p className="text-xs text-amber-700" data-testid={`${testIdPrefix}-reused-note`}>
          This item's material comes from the Roadway Excavation cut-fill ledger, not an external delivery.
        </p>
      )}
    </div>
  );
}

/** Read-only "Linked Work / Arrangement / Reach" context under a saved trip. */
export function TripWorkContextSummary({ trip, testIdPrefix = "trip-ctx" }: {
  trip: { id: number; boqProjectId?: number | null; boqItemId?: number | null; programmeBarId?: number | null; earthworkArrangementId?: number | null };
  testIdPrefix?: string;
}) {
  const hasAny = trip.boqProjectId != null || trip.boqItemId != null || trip.programmeBarId != null || trip.earthworkArrangementId != null;
  const { items, arrangements, bars } = useProjectContextData(hasAny ? trip.boqProjectId ?? null : null, trip.boqItemId ?? null);
  if (!hasAny) return null;
  const item = trip.boqItemId != null ? items.find((i) => i.id === trip.boqItemId) : null;
  const arrangement = trip.earthworkArrangementId != null ? arrangements.find((a) => a.id === trip.earthworkArrangementId) : null;
  const bar = trip.programmeBarId != null ? bars.find((b) => b.id === trip.programmeBarId) : null;
  return (
    <div className="text-[11px] text-muted-foreground space-y-0.5 mt-1" data-testid={`${testIdPrefix}-${trip.id}`}>
      {item && <div><span className="font-medium text-foreground">Linked Work:</span> {boqItemDisplayName(item)}</div>}
      {arrangement && (
        <div>
          <span className="font-medium text-foreground">Arrangement:</span> {arrangementLabel(arrangement)}
          {arrangement.arrangementType === "client_supplied" && <Badge variant="outline" className="ml-1 text-[10px]">Client supplied</Badge>}
        </div>
      )}
      {bar && <div><span className="font-medium text-foreground">Programme / Reach:</span> {barLabel(bar)}</div>}
      {!item && !arrangement && !bar && <div>Linked to work context</div>}
    </div>
  );
}
