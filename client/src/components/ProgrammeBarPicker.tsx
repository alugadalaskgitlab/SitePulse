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
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { barSideLabel, isDprSideCompatible } from "@shared/barSide";

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
  arrangement: { id: number; mode: string | null; agency: string | null } | null;
};

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
}: {
  projectId: number;
  boqItemId: number;
  dprDate: string;
  value: number | null;
  onSelect: (bar: PickerBar | null) => void;
  testidPrefix: string;
}) {
  const { data: bars = [] } = useQuery<PickerBar[]>({
    queryKey: ["/api/dpr/programme-bars", projectId, boqItemId],
    queryFn: async () => {
      const res = await fetch(`/api/dpr/programme-bars?projectId=${projectId}&boqItemId=${boqItemId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId && !!boqItemId,
  });

  if (bars.length === 0) return null;

  const isActive = (b: PickerBar) =>
    !b.startDate || !b.endDate || (dprDate >= b.startDate && dprDate <= b.endDate);
  const active = bars.filter(isActive);
  const others = bars.filter(b => !isActive(b));
  const selected = value != null ? bars.find(b => b.id === value) ?? null : null;

  return (
    <div className="mt-1 space-y-1">
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
              onClick={() => onSelect(isSel ? null : b)}
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
              onSelect(b);
            }}
          >
            <SelectTrigger className="h-6 w-auto text-[11px] px-2" data-testid={`${testidPrefix}-other-bars`}>
              <SelectValue placeholder={`Other bars (${others.length})…`} />
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
      {selected?.arrangement && (
        <p className="text-[10px] text-purple-700 dark:text-purple-300" data-testid={`${testidPrefix}-arrangement-context`}>
          Executed under arrangement #{selected.arrangement.id}
          {selected.arrangement.agency ? ` — agency: ${selected.arrangement.agency}` : ""}
          {selected.arrangement.mode ? ` (${selected.arrangement.mode})` : ""}. The executing agency comes from the arrangement, never from who files this DPR.
        </p>
      )}
    </div>
  );
}

/**
 * Live feedback for a progress row linked to a programme bar: side
 * compatibility (hard-blocks on submit) and chainage containment with an
 * override-reason input for legitimate out-of-range work.
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
}) {
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
  const outOfRange = fromKm != null && toKm != null && bar.chainageFrom != null && bar.chainageTo != null
    && (fromKm < Number(bar.chainageFrom) - 1e-9 || toKm > Number(bar.chainageTo) + 1e-9);
  if (sideOk && !outOfRange) return null;
  return (
    <div className="mt-1 space-y-1">
      {!sideOk && (
        <p className="text-[11px] text-red-600 font-medium" data-testid={`${testidPrefix}-warn-side-incompatible`}>
          Side "{sideDisplay || "—"}" doesn't match the bar's planned side ({barSideLabel(bar.side as any)}). Fix the side or link a different bar — submit will be blocked.
        </p>
      )}
      {outOfRange && (
        <div className="space-y-0.5">
          <p className="text-[11px] text-amber-700 font-medium" data-testid={`${testidPrefix}-warn-chainage-range`}>
            Chainage {fromKm}–{toKm} is outside the bar's range ({bar.chainageFrom}–{bar.chainageTo}). Give a reason to proceed:
          </p>
          <Input
            placeholder="Reason for working outside the planned stretch"
            value={overrideReason}
            onChange={(e) => onOverrideReason(e.target.value)}
            className="h-7 text-xs"
            data-testid={`${testidPrefix}-input-chainage-override`}
          />
        </div>
      )}
    </div>
  );
}
