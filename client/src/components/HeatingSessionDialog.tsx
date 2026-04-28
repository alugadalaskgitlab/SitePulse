import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { Save, Loader2, Trash2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HEATING_SESSION_TYPE_LABELS } from "@shared/schema";
import type { BitumenHeatingSession, GeneratorLog } from "@shared/schema";
import DryerSourceFixDialog, { type DryerSourceFixTarget } from "@/components/DryerSourceFixDialog";

type DgMode = "none" | "inline" | "link";

function emptyForm(date: string, plantName: string) {
  return {
    id: undefined as number | undefined,
    date,
    sessionType: "NIGHT_PREHEAT",
    plantName,
    staffName: "",
    staffRole: "",
    startTime: "",
    endTime: "",
    hotOilTempStart: "",
    hotOilTempEnd: "",
    hotOilSupplyTemp: "",
    hotOilReturnTemp: "",
    bitumenTank1TempStart: "",
    bitumenTank1TempEnd: "",
    bitumenTank2TempStart: "",
    bitumenTank2TempEnd: "",
    ldoTank1OpeningMeter: "",
    ldoTank1ClosingMeter: "",
    // Heating sessions only meter the boiler (Tank-1); this field is
    // recorded for the day's record. Routing of dryer-meter consumption
    // happens on the matching Plant Shift Log.
    dryerFedFrom: "TANK_2" as "TANK_1" | "TANK_2",
    dgMode: "inline" as DgMode,
    dgGeneratorName: "",
    dgStartTime: "",
    dgEndTime: "",
    dgOpeningHourMeter: "",
    dgClosingHourMeter: "",
    dgOpeningDiesel: "",
    dgIssuedDiesel: "",
    dgClosingDiesel: "",
    generatorLogId: null as number | null,
    linkSelection: "" as string,
    remarks: "",
    isFinalized: 0,
    autoFilledOpening: false,
    autoFilledSource: "" as string,
  };
}

type FormState = ReturnType<typeof emptyForm>;

function durationHrs(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(eh)) return null;
  let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

function sessionToForm(s: BitumenHeatingSession): FormState {
  return {
    id: s.id,
    date: s.date,
    sessionType: s.sessionType,
    plantName: s.plantName,
    staffName: s.staffName || "",
    staffRole: s.staffRole || "",
    startTime: s.startTime || "",
    endTime: s.endTime || "",
    hotOilTempStart: s.hotOilTempStart?.toString() || "",
    hotOilTempEnd: s.hotOilTempEnd?.toString() || "",
    hotOilSupplyTemp: s.hotOilSupplyTemp?.toString() || "",
    hotOilReturnTemp: s.hotOilReturnTemp?.toString() || "",
    bitumenTank1TempStart: s.bitumenTank1TempStart?.toString() || "",
    bitumenTank1TempEnd: s.bitumenTank1TempEnd?.toString() || "",
    bitumenTank2TempStart: s.bitumenTank2TempStart?.toString() || "",
    bitumenTank2TempEnd: s.bitumenTank2TempEnd?.toString() || "",
    ldoTank1OpeningMeter: s.ldoTank1OpeningMeter?.toString() || "",
    ldoTank1ClosingMeter: s.ldoTank1ClosingMeter?.toString() || "",
    dryerFedFrom: (s.dryerFedFrom === "TANK_1" ? "TANK_1" : "TANK_2") as "TANK_1" | "TANK_2",
    dgMode: (s.dgMode as DgMode) || "none",
    dgGeneratorName: s.dgGeneratorName || "",
    dgStartTime: s.dgStartTime || "",
    dgEndTime: s.dgEndTime || "",
    dgOpeningHourMeter: s.dgOpeningHourMeter?.toString() || "",
    dgClosingHourMeter: s.dgClosingHourMeter?.toString() || "",
    dgOpeningDiesel: s.dgOpeningDiesel?.toString() || "",
    dgIssuedDiesel: s.dgIssuedDiesel?.toString() || "",
    dgClosingDiesel: s.dgClosingDiesel?.toString() || "",
    generatorLogId: s.generatorLogId,
    linkSelection: s.generatorLogId ? `gl-${s.generatorLogId}` : "",
    remarks: s.remarks || "",
    isFinalized: s.isFinalized,
    autoFilledOpening: false,
    autoFilledSource: "",
  };
}

export interface HeatingSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  plantName: string;
  session?: BitumenHeatingSession | null;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export function HeatingSessionDialog({
  open, onOpenChange, date, plantName, session, onSaved, onDeleted,
}: HeatingSessionDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() =>
    session ? sessionToForm(session) : emptyForm(date, plantName)
  );
  const [fixDialog, setFixDialog] = useState<{ open: boolean; target: DryerSourceFixTarget | null }>({
    open: false,
    target: null,
  });

  useEffect(() => {
    if (!open) return;
    setForm(session ? sessionToForm(session) : emptyForm(date, plantName));
  }, [open, session, date, plantName]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  type DgCandidate = {
    source: "generator_log" | "equipment_usage";
    id: number | null;
    equipmentUsageId: number | null;
    date: string;
    plantName: string;
    generatorName: string;
    startTime: string | null;
    endTime: string | null;
    hoursRun: number | null;
    dieselConsumed: number | null;
    sourceHeatingSessionId: number | null;
  };
  const { data: dgCandidates } = useQuery<DgCandidate[]>({
    queryKey: ["/api/plant-module/generator-candidates", { date: form.date, plant: form.plantName }],
    enabled: open && !!form.date && !!form.plantName,
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/generator-candidates?date=${encodeURIComponent(form.date)}&plant=${encodeURIComponent(form.plantName)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch DG candidates");
      return res.json();
    },
  });
  const { data: generatorMasters } = useQuery<{ id: number | null; name: string }[]>({
    queryKey: ["/api/plant-module/generators"],
    enabled: open,
  });

  const generatorOptionsForDate = useMemo(
    () => (dgCandidates || []).filter(g =>
      // Show generator_log rows not already tied to a different session,
      // plus every equipment_usage row (they're not tied to sessions yet).
      g.source === "equipment_usage" ||
      g.sourceHeatingSessionId == null ||
      g.sourceHeatingSessionId === form.id
    ),
    [dgCandidates, form.id]
  );
  const optionKey = (c: DgCandidate) => c.source === "generator_log" ? `gl-${c.id}` : `eu-${c.equipmentUsageId}`;

  const selectedGeneratorEquipmentId = useMemo(() => {
    if (form.dgMode !== "inline") return null;
    const match = (generatorMasters || []).find(g => g.name === form.dgGeneratorName);
    return match?.id ?? null;
  }, [generatorMasters, form.dgGeneratorName, form.dgMode]);

  const { data: dgPrevBalance } = useQuery<{ previousBalance: number; previousClosingReading: number }>({
    queryKey: ["/api/plant-module/equipment-usage/previous-balance", selectedGeneratorEquipmentId],
    enabled: open && selectedGeneratorEquipmentId != null,
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/equipment-usage/previous-balance/${selectedGeneratorEquipmentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch DG tank balance");
      return res.json();
    },
  });

  // Auto-fill Tank-1 opening meter when opening a new session.
  const autoFilledOpeningRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);
  useEffect(() => {
    if (!open || form.id) return;
    const isEmpty = !form.ldoTank1OpeningMeter;
    const isAutoFilled = form.ldoTank1OpeningMeter && form.ldoTank1OpeningMeter === autoFilledOpeningRef.current;
    if (!isEmpty && !isAutoFilled) return;
    const before = form.startTime ? `${form.date}T${form.startTime}` : `${form.date}T23:59`;
    const seq = ++fetchSeqRef.current;
    fetch(`/api/plant-module/ldo-meter/last?tank=1&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(form.plantName)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (seq !== fetchSeqRef.current) return;
        if (data && typeof data.value === "number") {
          const next = String(data.value);
          setForm(prev => {
            if (prev.ldoTank1OpeningMeter && prev.ldoTank1OpeningMeter !== autoFilledOpeningRef.current) return prev;
            autoFilledOpeningRef.current = next;
            return {
              ...prev,
              ldoTank1OpeningMeter: next,
              autoFilledOpening: true,
              autoFilledSource: data.source,
            };
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.id, form.date, form.startTime, form.plantName]);

  const numOrNull = (s: string) => s.trim() === "" ? null : parseFloat(s);

  const dur = durationHrs(form.startTime, form.endTime);
  const ldoConsumed = (() => {
    const o = parseFloat(form.ldoTank1OpeningMeter), c = parseFloat(form.ldoTank1ClosingMeter);
    if (isNaN(o) || isNaN(c)) return null;
    return Math.max(0, c - o);
  })();
  const ldoLPerHr = (ldoConsumed != null && dur && dur > 0) ? ldoConsumed / dur : null;

  const dgDurFromTime = durationHrs(form.dgStartTime, form.dgEndTime);
  const dgDurFromMeter = (() => {
    const o = parseFloat(form.dgOpeningHourMeter), c = parseFloat(form.dgClosingHourMeter);
    if (isNaN(o) || isNaN(c)) return null;
    return Math.max(0, Math.round((c - o) * 100) / 100);
  })();
  const dgHoursUsed = dgDurFromMeter ?? dgDurFromTime;
  const dgConsumed = (() => {
    const o = parseFloat(form.dgOpeningDiesel), c = parseFloat(form.dgClosingDiesel), iss = parseFloat(form.dgIssuedDiesel) || 0;
    if (isNaN(o) || isNaN(c)) return null;
    return Math.max(0, o + iss - c);
  })();
  const dgLPerHr = (dgConsumed != null && dgHoursUsed && dgHoursUsed > 0) ? dgConsumed / dgHoursUsed : null;

  const buildPayload = (overrideGeneratorLogId?: number | null) => {
    const ldoOpen = numOrNull(form.ldoTank1OpeningMeter);
    const ldoClose = numOrNull(form.ldoTank1ClosingMeter);
    if (ldoOpen != null && ldoClose != null && ldoClose < ldoOpen) {
      throw new Error("Closing meter must be ≥ opening meter");
    }
    const dgOpenHM = numOrNull(form.dgOpeningHourMeter);
    const dgCloseHM = numOrNull(form.dgClosingHourMeter);
    if (form.dgMode === "inline" && dgOpenHM != null && dgCloseHM != null && dgCloseHM < dgOpenHM) {
      throw new Error("DG closing hour-meter must be ≥ opening hour-meter");
    }
    const payload: Record<string, unknown> = {
      date: form.date,
      sessionType: form.sessionType,
      plantName: form.plantName,
      staffName: form.staffName || null,
      staffRole: form.staffRole || null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      hotOilTempStart: numOrNull(form.hotOilTempStart),
      hotOilTempEnd: numOrNull(form.hotOilTempEnd),
      hotOilSupplyTemp: numOrNull(form.hotOilSupplyTemp),
      hotOilReturnTemp: numOrNull(form.hotOilReturnTemp),
      bitumenTank1TempStart: numOrNull(form.bitumenTank1TempStart),
      bitumenTank1TempEnd: numOrNull(form.bitumenTank1TempEnd),
      bitumenTank2TempStart: numOrNull(form.bitumenTank2TempStart),
      bitumenTank2TempEnd: numOrNull(form.bitumenTank2TempEnd),
      ldoTank1OpeningMeter: ldoOpen,
      ldoTank1ClosingMeter: ldoClose,
      dryerFedFrom: form.dryerFedFrom,
      dgMode: form.dgMode,
      dgGeneratorName: form.dgMode === "inline" ? form.dgGeneratorName : null,
      dgStartTime: form.dgMode === "inline" ? (form.dgStartTime || null) : null,
      dgEndTime: form.dgMode === "inline" ? (form.dgEndTime || null) : null,
      dgOpeningHourMeter: form.dgMode === "inline" ? dgOpenHM : null,
      dgClosingHourMeter: form.dgMode === "inline" ? dgCloseHM : null,
      dgOpeningDiesel: form.dgMode === "inline" ? numOrNull(form.dgOpeningDiesel) : null,
      dgIssuedDiesel: form.dgMode === "inline" ? numOrNull(form.dgIssuedDiesel) : null,
      dgClosingDiesel: form.dgMode === "inline" ? numOrNull(form.dgClosingDiesel) : null,
      generatorLogId: form.dgMode === "link"
        ? (overrideGeneratorLogId !== undefined ? overrideGeneratorLogId : form.generatorLogId)
        : null,
      remarks: form.remarks || null,
      editedBy: "operator",
    };
    if (form.id) payload.id = form.id;
    return payload;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // If the operator picked an Equipment Usage DG row in "link" mode,
      // materialize it into a generator_logs row first so we have an id
      // to reference from the heating session.
      let mirroredId: number | undefined;
      if (form.dgMode === "link" && form.linkSelection?.startsWith("eu-")) {
        const eqUsageId = parseInt(form.linkSelection.slice(3));
        const mirrorRes = await fetch("/api/plant-module/generator-logs/from-equipment-usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ equipmentUsageId: eqUsageId }),
          credentials: "include",
        });
        if (!mirrorRes.ok) {
          let body: any = {};
          try { body = await mirrorRes.json(); } catch {}
          throw new Error(body?.message || "Failed to mirror equipment usage DG into generator logs");
        }
        const mirrored = await mirrorRes.json();
        mirroredId = mirrored.id;
      }
      const payload = buildPayload(mirroredId);
      const url = form.id ? `/api/plant-module/heating-sessions/${form.id}` : "/api/plant-module/heating-sessions";
      const method = form.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        let body: any = {};
        try { body = await res.json(); } catch {}
        throw new Error(body?.message || res.statusText);
      }
      const saved: BitumenHeatingSession = await res.json();
      if (!saved.isFinalized) {
        try {
          await apiRequest("POST", `/api/plant-module/heating-sessions/${saved.id}/finalize`, { finalizedBy: "operator" });
        } catch {
          // non-fatal
        }
      }
      return saved;
    },
    onSuccess: async (saved: BitumenHeatingSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/generator-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/daily-reports"] });
      toast({ title: "Heating session saved" });
      onOpenChange(false);
      onSaved?.();
      // Cross-check: warn if the shift log for the same date+plant has a
      // different dryerFedFrom (non-blocking — stock routing is unchanged).
      // Fire-and-forget so dialog close is not delayed.
      fetch(
        `/api/plant-module/shift-logs/by-date/${encodeURIComponent(saved.date)}?plant=${encodeURIComponent(saved.plantName)}`,
        { credentials: "include" }
      ).then(slRes => {
        if (!slRes.ok) return;
        return slRes.json().then((sl: any) => {
          if (sl.dryerFedFrom && sl.dryerFedFrom !== saved.dryerFedFrom) {
            const hsLabel = saved.dryerFedFrom === "TANK_1" ? "Tank 1" : "Tank 2";
            const slLabel = sl.dryerFedFrom === "TANK_1" ? "Tank 1" : "Tank 2";
            const fixTarget: DryerSourceFixTarget = {
              mode: "shift-log",
              recordId: sl.id,
              date: saved.date,
              suggestedValue: saved.dryerFedFrom,
              currentValue: sl.dryerFedFrom,
            };
            toast({
              title: "Dryer-source mismatch",
              description: `This heating session says dryer fed from ${hsLabel}, but the shift log for ${saved.date} says ${slLabel}.`,
              variant: "destructive",
              action: (
                <ToastAction
                  altText="Fix shift log"
                  onClick={() => setFixDialog({ open: true, target: fixTarget })}
                >
                  Fix shift log
                </ToastAction>
              ),
            });
          }
        });
      }).catch(() => { /* non-fatal */ });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/plant-module/heating-sessions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/generator-logs"] });
      toast({ title: "Heating session deleted" });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: any) => {
      if (err?.message === "Cancelled") return;
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit" : "New"} Heating Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setField("date", e.target.value)} data-testid="input-date" /></div>
            <div><Label>Session Type</Label>
              <Select value={form.sessionType} onValueChange={v => setField("sessionType", v)}>
                <SelectTrigger data-testid="select-session-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NIGHT_PREHEAT">{HEATING_SESSION_TYPE_LABELS.NIGHT_PREHEAT}</SelectItem>
                  <SelectItem value="DAY_MAINTENANCE">{HEATING_SESSION_TYPE_LABELS.DAY_MAINTENANCE}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Staff Name</Label><Input value={form.staffName} onChange={e => setField("staffName", e.target.value)} data-testid="input-staff-name" /></div>
            <div><Label>Staff Role</Label><Input value={form.staffRole} onChange={e => setField("staffRole", e.target.value)} placeholder="Boiler operator" data-testid="input-staff-role" /></div>
            <div><Label>Start Time</Label><Input type="time" value={form.startTime} onChange={e => setField("startTime", e.target.value)} data-testid="input-start-time" /></div>
            <div><Label>End Time</Label><Input type="time" value={form.endTime} onChange={e => setField("endTime", e.target.value)} data-testid="input-end-time" /></div>
            <div><Label>Duration (h)</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-duration">{dur ?? "—"}</div></div>
            <div />
          </div>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Hot-Oil & Bitumen Temperatures</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>Hot-Oil Forward °C</Label><Input type="number" step="0.1" value={form.hotOilSupplyTemp} onChange={e => setField("hotOilSupplyTemp", e.target.value)} data-testid="input-hot-oil-supply" /></div>
              <div><Label>Hot-Oil Return °C</Label><Input type="number" step="0.1" value={form.hotOilReturnTemp} onChange={e => setField("hotOilReturnTemp", e.target.value)} data-testid="input-hot-oil-return" /></div>
              <div className="md:col-span-2" />
              <div><Label>Bitumen T1 Start °C</Label><Input type="number" step="0.1" value={form.bitumenTank1TempStart} onChange={e => setField("bitumenTank1TempStart", e.target.value)} data-testid="input-bit-t1-start" /></div>
              <div><Label>Bitumen T1 End °C</Label><Input type="number" step="0.1" value={form.bitumenTank1TempEnd} onChange={e => setField("bitumenTank1TempEnd", e.target.value)} data-testid="input-bit-t1-end" /></div>
              <div><Label>Bitumen T2 Start °C</Label><Input type="number" step="0.1" value={form.bitumenTank2TempStart} onChange={e => setField("bitumenTank2TempStart", e.target.value)} data-testid="input-bit-t2-start" /></div>
              <div><Label>Bitumen T2 End °C</Label><Input type="number" step="0.1" value={form.bitumenTank2TempEnd} onChange={e => setField("bitumenTank2TempEnd", e.target.value)} data-testid="input-bit-t2-end" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base">LDO Boiler Meter</CardTitle>
                {/* Recorded on the session for the day's record; routing
                    of dryer-meter consumption is on the matching shift log. */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="hs-dryer-fed-from" className="text-xs">Dryer fed from</Label>
                  <Select value={form.dryerFedFrom} onValueChange={(v) => setField("dryerFedFrom", v as "TANK_1" | "TANK_2")}>
                    <SelectTrigger id="hs-dryer-fed-from" className="h-8 w-32" data-testid="select-hs-dryer-fed-from">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TANK_1">Tank 1</SelectItem>
                      <SelectItem value="TANK_2">Tank 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label>Opening Meter</Label>
                <Input type="number" step="0.01" value={form.ldoTank1OpeningMeter}
                  onChange={e => setForm(p => ({ ...p, ldoTank1OpeningMeter: e.target.value, autoFilledOpening: false }))}
                  data-testid="input-ldo-open" />
                {form.autoFilledOpening && form.autoFilledSource && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-hint">
                    Auto-filled from previous closing ({form.autoFilledSource})
                  </p>
                )}
              </div>
              <div><Label>Closing Meter</Label><Input type="number" step="0.01" value={form.ldoTank1ClosingMeter} onChange={e => setField("ldoTank1ClosingMeter", e.target.value)} data-testid="input-ldo-close" /></div>
              <div><Label>Total Consumed (L)</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold text-sm" data-testid="text-ldo-consumed">{ldoConsumed?.toFixed(2) ?? "—"}</div></div>
              <div><Label>L/Hr</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold text-sm" data-testid="text-ldo-lphr">{ldoLPerHr != null ? ldoLPerHr.toFixed(2) : "—"}</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Generator (DG) for this Session</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="mr-2">DG Mode:</Label>
                <Select value={form.dgMode} onValueChange={v => setField("dgMode", v as DgMode)}>
                  <SelectTrigger className="w-48" data-testid="select-dg-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No DG used</SelectItem>
                    <SelectItem value="inline">Inline (capture here, auto-create Generator Log)</SelectItem>
                    <SelectItem value="link">Link Existing Generator Log</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.dgMode === "inline" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2"><Label>Generator</Label>
                      <Select
                        value={form.dgGeneratorName || undefined}
                        onValueChange={v => {
                          if (v === "__new__") {
                            const name = window.prompt("Enter new generator name (e.g. '125 KVA GENERATOR')")?.trim();
                            if (name) setField("dgGeneratorName", name);
                          } else {
                            setField("dgGeneratorName", v);
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-dg-generator"><SelectValue placeholder="Pick a generator" /></SelectTrigger>
                        <SelectContent>
                          {(generatorMasters || []).map(g => (
                            <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>
                          ))}
                          {form.dgGeneratorName &&
                            !(generatorMasters || []).some(g => g.name === form.dgGeneratorName) && (
                              <SelectItem value={form.dgGeneratorName}>{form.dgGeneratorName} (new)</SelectItem>
                            )}
                          <SelectItem value="__new__" data-testid="select-dg-generator-new">+ New generator…</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>DG Start</Label><Input type="time" value={form.dgStartTime} onChange={e => setField("dgStartTime", e.target.value)} data-testid="input-dg-start" /></div>
                    <div><Label>DG End</Label><Input type="time" value={form.dgEndTime} onChange={e => setField("dgEndTime", e.target.value)} data-testid="input-dg-end" /></div>
                    <div><Label>Hours from Time</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-dg-hrs-time">{dgDurFromTime ?? "—"}</div></div>
                    <div><Label>Hour-Meter Opening</Label><Input type="number" step="0.01" value={form.dgOpeningHourMeter} onChange={e => setField("dgOpeningHourMeter", e.target.value)} data-testid="input-dg-hm-open" /></div>
                    <div><Label>Hour-Meter Closing</Label><Input type="number" step="0.01" value={form.dgClosingHourMeter} onChange={e => setField("dgClosingHourMeter", e.target.value)} data-testid="input-dg-hm-close" /></div>
                    <div><Label>Hours from Meter</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-dg-hrs-meter">{dgDurFromMeter ?? "—"}</div></div>
                    <div><Label>DG Hours Used</Label><div className="px-3 py-2 rounded bg-emerald-50 dark:bg-emerald-950/30 font-semibold text-sm" data-testid="text-dg-hrs-used">{dgHoursUsed != null ? dgHoursUsed.toFixed(2) : "—"}</div></div>
                    <div><Label>HSD Opening (L)</Label><Input type="number" step="0.1" value={form.dgOpeningDiesel} onChange={e => setField("dgOpeningDiesel", e.target.value)} data-testid="input-dg-open" /></div>
                    <div><Label>HSD Issued (L)</Label><Input type="number" step="0.1" value={form.dgIssuedDiesel} onChange={e => setField("dgIssuedDiesel", e.target.value)} data-testid="input-dg-issued" /></div>
                    <div><Label>HSD Closing (L)</Label><Input type="number" step="0.1" value={form.dgClosingDiesel} onChange={e => setField("dgClosingDiesel", e.target.value)} data-testid="input-dg-close" /></div>
                    <div><Label>HSD Consumed (L)</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold text-sm" data-testid="text-dg-consumed">{dgConsumed?.toFixed(2) ?? "—"}</div></div>
                    <div>
                      <Label>Diesel Balance in Tank (last)</Label>
                      <div className="px-3 py-2 rounded bg-sky-50 dark:bg-sky-950/30 font-semibold text-sm" data-testid="text-dg-prev-balance">
                        {selectedGeneratorEquipmentId == null
                          ? "—"
                          : dgPrevBalance
                            ? `${dgPrevBalance.previousBalance.toFixed(2)} L`
                            : "…"}
                      </div>
                    </div>
                    <div>
                      <Label>New Balance in Tank</Label>
                      <div className="px-3 py-2 rounded bg-sky-50 dark:bg-sky-950/30 font-semibold text-sm" data-testid="text-dg-new-balance">
                        {(() => {
                          if (selectedGeneratorEquipmentId == null || !dgPrevBalance) return "—";
                          const issued = parseFloat(form.dgIssuedDiesel) || 0;
                          const consumed = dgConsumed ?? 0;
                          const next = dgPrevBalance.previousBalance + issued - consumed;
                          return `${next.toFixed(2)} L`;
                        })()}
                      </div>
                    </div>
                    <div><Label>HSD L/Hr</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold text-sm" data-testid="text-dg-lphr">{dgLPerHr != null ? dgLPerHr.toFixed(2) : "—"}</div></div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tip: enter both clock time and hour-meter readings — the system uses the hour-meter when available and falls back to time. DG Hours Used drives the L/Hr metric. The "Diesel Balance in Tank (last)" chip is the most recent tank reading from Equipment Usage; "New Balance" is last + Issued − Consumed.
                  </p>
                </>
              )}

              {form.dgMode === "link" && (
                <div>
                  <Label>Existing DG Run (same date)</Label>
                  <Select
                    value={
                      form.linkSelection
                        || (form.generatorLogId ? `gl-${form.generatorLogId}` : "")
                    }
                    onValueChange={v => setForm(p => ({
                      ...p,
                      linkSelection: v,
                      generatorLogId: v.startsWith("gl-") ? parseInt(v.slice(3)) : null,
                    }))}
                  >
                    <SelectTrigger data-testid="select-link-dg"><SelectValue placeholder="Pick a generator run" /></SelectTrigger>
                    <SelectContent>
                      {generatorOptionsForDate.map(g => {
                        const key = optionKey(g);
                        const labelId = g.source === "generator_log" ? `#${g.id}` : `EU#${g.equipmentUsageId}`;
                        const suffix = g.source === "equipment_usage" ? " · from Equipment Usage" : "";
                        return (
                          <SelectItem key={key} value={key}>
                            {labelId} {g.generatorName} {g.startTime || "?"}-{g.endTime || "?"} ({g.hoursRun?.toFixed(1) || "?"}h, {g.dieselConsumed?.toFixed(1) || "?"}L){suffix}
                          </SelectItem>
                        );
                      })}
                      {!generatorOptionsForDate.length && <SelectItem value="__none__" disabled>No DG runs for this date</SelectItem>}
                    </SelectContent>
                  </Select>
                  {form.linkSelection?.startsWith("eu-") && (
                    <p className="text-xs text-muted-foreground mt-1">
                      This is an Equipment Usage entry — on Save it will be mirrored into Generator Logs and linked to this session.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <Label>Remarks</Label>
            <Textarea rows={2} value={form.remarks} onChange={e => setField("remarks", e.target.value)} data-testid="input-remarks" />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            {form.id && (
              <Button variant="outline" onClick={() => setConfirmDeleteId(form.id!)} disabled={deleteMutation.isPending} data-testid="button-delete">
                <Trash2 className="w-4 h-4 mr-1" />Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel">Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save & Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <DryerSourceFixDialog
      open={fixDialog.open}
      onOpenChange={(v) => setFixDialog(prev => ({ ...prev, open: v }))}
      target={fixDialog.target}
    />

    <AlertDialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete heating session?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the heating session and any linked generator log. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { if (confirmDeleteId !== null) { deleteMutation.mutate(confirmDeleteId); setConfirmDeleteId(null); } }}
            data-testid="button-delete-confirm"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
