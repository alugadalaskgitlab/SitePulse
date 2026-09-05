/**
 * Instruction 030A — structured programme-bar picker for DPR forms.
 *
 * Fetches bars for one BOQ item from GET /api/dpr/programme-bars (rich
 * context: chainage, side, geometry, dates, planned/reported/remaining qty,
 * approved arrangement). Bars active on the DPR date are shown as one-tap
 * chips; every other bar for the item stays reachable through the "Other
 * bars" dropdown so out-of-sequence work can still be linked deliberately.
 * Selecting a bar never claims its full quantity — the caller only prefills
 * chainage/side/width and the engineer reports today's actual work.
 */
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { barSideLabel, isDprSideCompatible } from "@shared/barSide";
import { chainageOutsideBar, barBalanceFigures, autoMatchBar, isBarCompatible, normalizeDprSideKey } from "@shared/dprProgrammeLink";
import { OutOfRangeChainageModal } from "@/components/OutOfRangeChainageModal";

export type PickerBar = {
  id: number;
  reachLabel: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  side: string | null;
  plannedWidthM: number | null;
  plannedThicknessMm: number | null;
  startDate: string | null;
  endDate: string | null;
  sequenceOrder: number | null;
  plannedQty: number;
  reportedQty: number;
  remainingQty: number;
  unit: string | null;
  /** Batch 1 Part E: side-specific chainage coverage (quantity stays shared). */
  sideCoverage?: {
    lhs: Array<[number, number]>;
    rhs: Array<[number, number]>;
    lhsCoveredKm: number;
    rhsCoveredKm: number;
    lhsFraction: number;
    rhsFraction: number;
    fullyCovered: boolean;
    byLayer?: Array<{
      layerNo: number | null;
      lhs: Array<[number, number]>;
      rhs: Array<[number, number]>;
      lhsCoveredKm: number;
      rhsCoveredKm: number;
      lhsFraction: number;
      rhsFraction: number;
      fullyCovered: boolean;
    }>;
  } | null;
  arrangement: { id: number; mode: string | null; agency: string | null; status: string | null } | null;
  latestOutcome?: ProgrammeBarOutcome | null;
  outcomeHistory?: ProgrammeBarOutcome[];
};

type ProgrammeBarOutcome = {
  id: number; eventDate: string; outcome: string; reason: string;
  reasonOther: string | null; rescheduledDate: string | null;
  actualQuantity: number | null; actualUom: string | null; remarks: string | null;
};
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

const fmtKmRange = (list: Array<[number, number]>): string =>
  list.map(([a, b]) => `${a.toFixed(3)}–${b.toFixed(3)}`).join(", ") || "none";

function barLabel(b: PickerBar): string {
  const bits: string[] = [];
  bits.push(b.reachLabel || `Ch ${b.chainageFrom ?? "?"}–${b.chainageTo ?? "?"}`);
  if (b.reachLabel && (b.chainageFrom != null || b.chainageTo != null)) {
    bits.push(`Ch ${b.chainageFrom ?? "?"}–${b.chainageTo ?? "?"}`);
  }
  if (b.side) bits.push(barSideLabel(b.side as any));
  bits.push(`bal ${Math.round(b.remainingQty * 10) / 10}${b.unit ? ` ${b.unit}` : ""}`);
  return bits.join(" · ");
}

export function ProgrammeBarPicker({
  projectId,
  boqItemId,
  dprDate,
  value,
  onSelect,
  testidPrefix,
  autoSelect = false,
  sideLabel = null,
  fromKm = null,
  toKm = null,
}: {
  projectId: number;
  boqItemId: number;
  dprDate: string;
  value: number | null;
  onSelect: (bar: PickerBar | null) => void;
  testidPrefix: string;
  /**
   * Instruction 031 Part C: when exactly one compatible bar exists for the
   * item (preferring bars active on the DPR date), link it automatically.
   * The chips stay visible so the user can still "change planned reach".
   */
  autoSelect?: boolean;
  /**
   * Guided correction: the entry's currently chosen side/chainage. When
   * provided, side-incompatible bars are hidden from the primary chips
   * (still reachable via "Change planned reach") and the auto-matcher
   * re-attempts as side + chainage narrow the candidates to exactly one.
   */
  sideLabel?: string | null;
  fromKm?: number | null;
  toKm?: number | null;
}) {
  const { data: bars = [] } = useQuery<PickerBar[]>({
    queryKey: ["/api/dpr/programme-bars", projectId, boqItemId],
    queryFn: async () => {
      const res = await fetch(`/api/dpr/programme-bars?projectId=${projectId}&boqItemId=${boqItemId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId && !!boqItemId,
  });

  // Part C auto-match: fires once per (item, bar-list) while nothing is linked.
  // A deliberate unlink (user clicks the linked chip off) suppresses re-linking.
  const autoLinkedRef = useRef<string | null>(null);
  const [autoLinkedBarId, setAutoLinkedBarId] = useState<number | null>(null);
  // 06T §2: a deliberate in-session pick (chip / "Change planned reach") is a
  // manual override — reconciliation never silently undoes it. Links loaded
  // from the DB or auto-matched ARE reconciled when chainage/side change.
  const manualPickRef = useRef(false);
  // 06T §2: user-facing reconciliation state — "relinked" shows the
  // "Reach updated to match your entry" notice; "no_match" is the single
  // "Outside planned reach" message after a stale link was cleared.
  const [reconcile, setReconcile] = useState<{ kind: "relinked" | "no_match"; barId?: number } | null>(null);
  const reconcileRef = useRef<string | null>(null);
  // 06T §2: chips collapsed by default — "Programme context" disclosure.
  const [chipsOpen, setChipsOpen] = useState(false);
  const sideKey = sideLabel ? normalizeDprSideKey(sideLabel) : null;
  useEffect(() => {
    if (!autoSelect || bars.length === 0 || value != null) return;
    // Re-attempts as side/chainage narrow the candidates — item + side +
    // chainage identifying exactly one compatible bar links it automatically,
    // for suggested AND manually-added entries alike.
    const key = `${boqItemId}:${dprDate}:${sideKey ?? ""}:${fromKm ?? ""}:${toKm ?? ""}:${bars.map(b => b.id).join(",")}`;
    if (autoLinkedRef.current === key) return;
    autoLinkedRef.current = key;
    const match = autoMatchBar(bars as any, { dprDate, sideKey, fromKm, toKm });
    if (match.kind === "auto") {
      setAutoLinkedBarId(match.bar.id);
      onSelect(match.bar as any as PickerBar);
    }
  }, [autoSelect, bars, value, boqItemId, dprDate, sideKey, fromKm, toKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // 06T §2: re-reconciliation — when a bar is ALREADY linked but the entered
  // chainage/side no longer fall inside it, re-run the matcher instead of
  // leaving a stale checked chip beside an "outside planned reach" warning.
  //  - exactly one compatible bar → re-link + "Reach updated" notice
  //  - none / several → clear the stale link, show ONE clear message
  useEffect(() => {
    if (bars.length === 0 || value == null) return;
    if (manualPickRef.current) return; // deliberate manual override stands
    if (fromKm == null && toKm == null) return; // nothing entered yet
    const linked = bars.find(b => b.id === value);
    if (!linked) return;
    if (isBarCompatible(linked as any, { sideKey, fromKm, toKm })) {
      if (reconcile) setReconcile(null);
      return;
    }
    const key = `${value}:${sideKey ?? ""}:${fromKm ?? ""}:${toKm ?? ""}:${bars.map(b => b.id).join(",")}`;
    if (reconcileRef.current === key) return;
    reconcileRef.current = key;
    const match = autoMatchBar(bars as any, { dprDate, sideKey, fromKm, toKm });
    if (match.kind === "auto" && match.bar.id !== value) {
      setReconcile({ kind: "relinked", barId: match.bar.id });
      setAutoLinkedBarId(null);
      onSelect(match.bar as any as PickerBar);
    } else if (match.kind !== "auto") {
      setReconcile({ kind: "no_match" });
      setAutoLinkedBarId(null);
      onSelect(null);
    }
  }, [bars, value, sideKey, fromKm, toKm, dprDate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bars.length === 0) return null;

  const isActive = (b: PickerBar) =>
    !b.startDate || !b.endDate || (dprDate >= b.startDate && dprDate <= b.endDate);
  // Side-incompatible bars never show as primary chips when the entry's side
  // is known — they stay reachable through "Change planned reach".
  const sideOkChip = (b: PickerBar) => !sideKey || isBarCompatible(b as any, { sideKey });
  const active = bars.filter(b => isActive(b) && sideOkChip(b));
  const others = bars.filter(b => !isActive(b) || !sideOkChip(b));
  const selected = value != null ? bars.find(b => b.id === value) ?? null : null;

  return (
    <div className="mt-1 space-y-1">
      {/* 06T §2: the reach chips live inside a secondary "Programme context"
          disclosure — the main card leads with what the engineer entered. */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] font-semibold text-muted-foreground">Programme context:</span>
        {selected ? (
          <span className="text-[11px]" data-testid={`${testidPrefix}-linked-summary`}>{barLabel(selected)}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground" data-testid={`${testidPrefix}-linked-summary`}>No planned reach linked</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-5 text-[10px] px-1.5 underline"
          onClick={() => setChipsOpen(o => !o)}
          data-testid={`${testidPrefix}-toggle-programme-context`}
        >
          {chipsOpen ? "Hide options" : "Change planned reach"}
        </Button>
      </div>
      {reconcile?.kind === "relinked" && value === reconcile.barId && (
        <p className="text-[10px] text-blue-700 dark:text-blue-300" data-testid={`${testidPrefix}-reconcile-relinked`}>
          Reach updated to match your entry.
        </p>
      )}
      {reconcile?.kind === "no_match" && value == null && (
        <p className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-700" data-testid={`${testidPrefix}-reconcile-no-match`}>
          <AlertTriangle className="w-3 h-3" /> Outside planned reach — review required
        </p>
      )}
      {chipsOpen && (
      <div className="flex flex-wrap gap-1 items-center">
        {active.map(b => {
          const isSel = value === b.id;
          return (
            <Button
              key={b.id}
              type="button"
              size="sm"
              variant={isSel ? "default" : "outline"}
              className="h-6 text-xs px-2"
              title={isSel
                ? "Linked to this programme bar — click to unlink"
                : `Link to this bar${b.side ? ` (planned side: ${barSideLabel(b.side as any)})` : " (side unspecified)"}${b.plannedWidthM != null ? `, width ${b.plannedWidthM} m` : ""}. Prefills chainage — enter today's actual executed range; you never claim the whole bar.`}
              onClick={() => {
                manualPickRef.current = !isSel;
                setReconcile(null);
                onSelect(isSel ? null : b);
              }}
              data-testid={`button-prefill-bar-${b.id}`}
            >
              {isSel ? "✓ " : ""}{barLabel(b)}
            </Button>
          );
        })}
        {others.length > 0 && (
          <Select
            value={selected && !isActive(selected) ? String(selected.id) : undefined}
            onValueChange={val => {
              const b = bars.find(x => x.id === Number(val)) ?? null;
              manualPickRef.current = b != null;
              setReconcile(null);
              onSelect(b);
            }}
          >
            <SelectTrigger className="h-6 w-auto text-[11px] px-2" data-testid={`${testidPrefix}-other-bars`}>
              <SelectValue placeholder={`Change planned reach (${others.length})…`} />
            </SelectTrigger>
            <SelectContent>
              {others.map(b => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {barLabel(b)}{b.startDate ? ` · ${b.startDate}→${b.endDate}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      )}
      {autoLinkedBarId != null && value === autoLinkedBarId && selected && (
        <p className="text-[10px] text-muted-foreground" data-testid={`${testidPrefix}-auto-linked-note`}>
          Linked automatically: {barLabel(selected)}
          {selected.side ? ` · Planned ${barSideLabel(selected.side as any)}` : ""}
          {sideLabel ? ` — Actual execution: ${sideLabel}` : ""}
          {" "}— use “Change planned reach” if this isn't right.
        </p>
      )}
       {selected?.arrangement && ["approved", "mobilisation_pending", "in_progress"].includes(String(selected.arrangement.status ?? "").toLowerCase()) && (
         <details className="rounded border border-muted px-2 py-1 text-[10px]" data-testid={`${testidPrefix}-outcome-context`}>
           <summary className="cursor-pointer font-medium" data-testid={`${testidPrefix}-outcome-summary`}>
             Execution Arrangement: {label(selected.arrangement.status ?? "")}
           </summary>
           <div className="pt-1 text-muted-foreground">
             Planned {selected.startDate || "unscheduled"}{selected.endDate ? ` → ${selected.endDate}` : ""}
             {selected.arrangement ? ` · Arrangement #${selected.arrangement.id}${selected.arrangement.agency ? ` · ${selected.arrangement.agency}` : ""}` : ""}
           </div>
           {selected.latestOutcome && (
             <p className="mt-1 text-muted-foreground">
               Latest outcome: {label(selected.latestOutcome.outcome)} on {selected.latestOutcome.eventDate}
             </p>
           )}
           {selected.outcomeHistory?.length ? (
             <div className="mt-1 space-y-0.5" data-testid={`${testidPrefix}-outcome-history`}>
               <p className="font-semibold">Immutable outcome history ({selected.outcomeHistory.length})</p>
               {selected.outcomeHistory.map(event => <div key={event.id}>{event.eventDate}: {label(event.outcome)}{event.reason ? ` — ${label(event.reason)}` : ""}{event.reasonOther ? ` (${event.reasonOther})` : ""}{event.actualQuantity != null ? ` · actual ${event.actualQuantity} ${event.actualUom ?? ""}` : ""}{event.rescheduledDate ? ` · moved to ${event.rescheduledDate}` : ""}</div>)}
             </div>
           ) : <p className="mt-1">No status changes recorded.</p>}
         </details>
       )}
    </div>
  );
}

/**
 * Instruction 031 — live feedback for a progress row linked to a programme
 * bar, shared by BOTH DPR screens (Detailed + Guided) and SiteEdit:
 *  - Part D: bar-scoped Planned / Done / Balance ("Selected reach"), with the
 *    whole-BOQ-item totals shown smaller and clearly separate when provided.
 *  - side compatibility (hard-blocks on submit),
 *  - Part F: out-of-range chainage handled through the shared modal (reason
 *    required to continue; drafts saveable with a visible "Reason required"
 *    flag; submit blocked without a reason by the caller + server).
 *  - Part G: out-of-range rows show "Outside planned reach — review required".
 *  - Part H: arrangement context; partly-outsourced bars require "Executed by".
 */
export function BarLinkFeedback({
  projectId,
  boqItemId,
  programmeBarId,
  sideKey,
  sideLabel: sideDisplay,
  fromKm,
  toKm,
  overrideReason,
  onOverrideReason,
  testidPrefix,
  boqQty,
  itemTotals,
  executedBy,
  onExecutedBy,
  warnOverBalance = false,
}: {
  projectId: number | null;
  boqItemId: number | null;
  programmeBarId: number;
  sideKey: string | null;
  sideLabel: string;
  fromKm: number | null;
  toKm: number | null;
  overrideReason: string;
  onOverrideReason: (v: string) => void;
  testidPrefix: string;
  /** Today's BOQ-unit credit for this row (for over-balance hinting). */
  boqQty?: number | null;
  /** Warn (review, non-blocking) when BOQ-unit credit exceeds the selected reach balance. */
  warnOverBalance?: boolean;
  /** Whole-BOQ-item totals, shown smaller/separate from the reach figures. */
  itemTotals?: { currentQty: number; totalActual: number; balance: number; unit: string } | null;
  /** Part H: who executed this row (required when arrangement is partly outsourced). */
  executedBy?: string | null;
  onExecutedBy?: (v: "hlc" | "agency") => void;
}) {
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const { data: bars = [] } = useQuery<PickerBar[]>({
    queryKey: ["/api/dpr/programme-bars", projectId, boqItemId],
    queryFn: async () => {
      const res = await fetch(`/api/dpr/programme-bars?projectId=${projectId}&boqItemId=${boqItemId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId && !!boqItemId,
  });
  const bar = bars.find(b => b.id === programmeBarId);
  if (!bar) return null;
  const sideOk = isDprSideCompatible(bar.side as any, sideKey as any);
  const outOfRange = chainageOutsideBar(fromKm, toKm, bar);
  const scoped = barBalanceFigures(bar);
  const partlyOutsourced = !!bar.arrangement && /part/i.test(bar.arrangement.mode ?? "");
  return (
    <div className="mt-1 space-y-1">
      {scoped && (
        <div className="flex flex-wrap items-center gap-1" data-testid={`${testidPrefix}-reach-balance`}>
          <span className="text-[10px] font-semibold text-muted-foreground">Selected reach:</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Planned {scoped.currentQty}{scoped.unit ? ` ${scoped.unit}` : ""}</Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Done {scoped.totalActual}</Badge>
          <Badge variant={scoped.balance <= 0 ? "destructive" : "outline"} className="text-[10px] px-1.5 py-0">Balance {scoped.balance}</Badge>
          {itemTotals && (
            <span className="text-[9px] text-muted-foreground ml-1" data-testid={`${testidPrefix}-item-totals`}>
              (BOQ item total: {itemTotals.currentQty} · done {itemTotals.totalActual} · bal {itemTotals.balance}{itemTotals.unit ? ` ${itemTotals.unit}` : ""})
            </span>
          )}
        </div>
      )}
      {/* Batch 1 Part E: a Both-Sides/Full-Width bar shares ONE quantity
          balance, but chainage coverage is per side — executing LHS never
          marks RHS covered, and "fully covered" needs both sides accounted. */}
      {bar.sideCoverage && (bar.side === "both_sides" || bar.side === "full_width") && (bar.sideCoverage.lhsCoveredKm > 0 || bar.sideCoverage.rhsCoveredKm > 0) && (
        (bar.sideCoverage.byLayer?.length ?? 0) > 0 ? (
          <div className="text-[10px] text-muted-foreground space-y-0.5" data-testid={`${testidPrefix}-side-coverage`}>
            <p className="font-medium">Recorded layer coverage — this does not indicate that all required layers are complete.</p>
            {bar.sideCoverage.byLayer!.map((layer) => (
              <p key={layer.layerNo ?? "unrecorded"}>
                {layer.layerNo != null ? `Layer ${layer.layerNo}` : "Layer not recorded"} — LHS: {fmtKmRange(layer.lhs)} · RHS: {fmtKmRange(layer.rhs)}
                {layer.fullyCovered ? " · full range recorded for this layer only" : ""}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground" data-testid={`${testidPrefix}-side-coverage`}>
            Covered so far — LHS: {fmtKmRange(bar.sideCoverage.lhs)} · RHS: {fmtKmRange(bar.sideCoverage.rhs)}
            {bar.sideCoverage.fullyCovered ? " · full range covered on both sides" : ""}
          </p>
        )
      )}
      {warnOverBalance && scoped && boqQty != null && boqQty > scoped.balance + 1e-9 && (
        <p className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-700" data-testid={`${testidPrefix}-warn-over-balance`}>
          <AlertTriangle className="w-3 h-3" />
          Reported BOQ quantity {boqQty}{scoped.unit ? ` ${scoped.unit}` : ""} exceeds this reach's balance ({scoped.balance}) — review before submitting. BOQ-item totals are shown separately.
        </p>
      )}
      {!sideOk && (
        <p className="text-[11px] text-red-600 font-medium" data-testid={`${testidPrefix}-warn-side-incompatible`}>
          Side "{sideDisplay || "—"}" doesn't match the bar's planned side ({barSideLabel(bar.side as any)}). Fix the side or link a different bar — submit will be blocked.
        </p>
      )}
      {outOfRange && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`${testidPrefix}-warn-chainage-range`}>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-700">
            <AlertTriangle className="w-3 h-3" /> Outside planned reach — review required
          </span>
          {overrideReason.trim() ? (
            <span className="text-[10px] text-muted-foreground" data-testid={`${testidPrefix}-override-reason-display`}>
              Reason: {overrideReason}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-red-600" data-testid={`${testidPrefix}-flag-reason-required`}>
              Reason required
            </span>
          )}
          <Button type="button" size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => setReasonModalOpen(true)} data-testid={`${testidPrefix}-button-give-reason`}>
            {overrideReason.trim() ? "Edit reason" : "Give reason"}
          </Button>
          <OutOfRangeChainageModal
            open={reasonModalOpen}
            onOpenChange={setReasonModalOpen}
            plannedFromKm={bar.chainageFrom}
            plannedToKm={bar.chainageTo}
            enteredFromKm={fromKm}
            enteredToKm={toKm}
            initialReason={overrideReason}
            onContinue={(r) => onOverrideReason(r)}
            onCorrect={() => {}}
            testidPrefix={testidPrefix}
          />
        </div>
      )}
      {!outOfRange && overrideReason.trim() !== "" && (
        // Range corrected back inside the bar — stale reason cleared by caller
        // on save; show nothing here.
        null
      )}
      {bar.arrangement && (
        <div className="space-y-0.5">
          <p className="text-[10px] text-purple-700 dark:text-purple-300" data-testid={`${testidPrefix}-arrangement-mode`}>
            Arrangement: {bar.arrangement.mode ?? "—"}{bar.arrangement.agency ? ` — agency: ${bar.arrangement.agency}` : ""}. Executing agency comes from the arrangement, never from who files this DPR.
          </p>
          {onExecutedBy && (partlyOutsourced || executedBy) && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold">Executed by{partlyOutsourced ? " *" : ""}:</span>
              <Select value={executedBy ?? undefined} onValueChange={(v) => onExecutedBy(v as "hlc" | "agency")}>
                <SelectTrigger className="h-6 w-auto text-[11px] px-2" data-testid={`${testidPrefix}-select-executed-by`}>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hlc">HLC (own execution)</SelectItem>
                  <SelectItem value="agency">{bar.arrangement.agency ? `Agency — ${bar.arrangement.agency}` : "Agency"}</SelectItem>
                </SelectContent>
              </Select>
              {partlyOutsourced && !executedBy && (
                <span className="text-[10px] font-semibold text-red-600" data-testid={`${testidPrefix}-flag-executed-by-required`}>Required — record HLC and agency work as separate rows</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
