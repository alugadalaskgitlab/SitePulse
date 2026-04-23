import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, Plus, Save, Lock, Loader2, Trash2, Flame, Pencil } from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import type { BitumenHeatingSession, GeneratorLog } from "@shared/schema";

type DgMode = "none" | "inline" | "link";

function emptyForm(date: string) {
  return {
    id: undefined as number | undefined,
    date,
    sessionType: "NIGHT_PREHEAT",
    plantName: "Main Plant",
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
    dgMode: "inline" as DgMode,
    dgGeneratorName: "600 KVA",
    dgStartTime: "",
    dgEndTime: "",
    dgOpeningDiesel: "",
    dgIssuedDiesel: "",
    dgClosingDiesel: "",
    generatorLogId: null as number | null,
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

export default function PlantHeatingSessions() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const [, params] = useRoute("/plant/heating-sessions/:date");
  const dateParam = params?.date || format(new Date(), "yyyy-MM-dd");
  const backLink = appendOrigin("/plant/dashboard");

  const [filterDate, setFilterDate] = useState(dateParam);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(dateParam));
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinPurpose, setPinPurpose] = useState<"finalize" | "delete" | "edit-finalized">("finalize");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [pendingFinalizeId, setPendingFinalizeId] = useState<number | null>(null);

  const { data: sessions, isLoading } = useQuery<BitumenHeatingSession[]>({
    queryKey: ["/api/plant-module/heating-sessions", filterDate],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/heating-sessions?date=${filterDate}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: existingGenerators } = useQuery<GeneratorLog[]>({
    queryKey: ["/api/plant-module/generator-logs"],
  });

  const generatorOptionsForDate = useMemo(
    () => (existingGenerators || []).filter(g => g.date === form.date && (g.sourceHeatingSessionId == null || g.sourceHeatingSessionId === form.id)),
    [existingGenerators, form.date, form.id]
  );

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  // Auto-fill Tank-1 opening meter when opening a NEW form
  useEffect(() => {
    if (!dialogOpen || form.id) return;
    if (form.ldoTank1OpeningMeter) return;
    const before = form.startTime ? `${form.date}T${form.startTime}` : `${form.date}T23:59`;
    fetch(`/api/plant-module/ldo-meter/last?tank=1&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(form.plantName)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data && typeof data.value === "number") {
          setForm(prev => prev.ldoTank1OpeningMeter ? prev : ({
            ...prev,
            ldoTank1OpeningMeter: String(data.value),
            autoFilledOpening: true,
            autoFilledSource: data.source,
          }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.date, form.startTime, form.plantName]);

  const numOrNull = (s: string) => s.trim() === "" ? null : parseFloat(s);

  const dur = durationHrs(form.startTime, form.endTime);
  const ldoConsumed = (() => {
    const o = parseFloat(form.ldoTank1OpeningMeter), c = parseFloat(form.ldoTank1ClosingMeter);
    if (isNaN(o) || isNaN(c)) return null;
    return Math.max(0, c - o);
  })();
  const dgDur = durationHrs(form.dgStartTime, form.dgEndTime);
  const dgConsumed = (() => {
    const o = parseFloat(form.dgOpeningDiesel), c = parseFloat(form.dgClosingDiesel), iss = parseFloat(form.dgIssuedDiesel) || 0;
    if (isNaN(o) || isNaN(c)) return null;
    return Math.max(0, o + iss - c);
  })();

  const buildPayload = (extra?: { pin?: string }) => {
    const ldoOpen = numOrNull(form.ldoTank1OpeningMeter);
    const ldoClose = numOrNull(form.ldoTank1ClosingMeter);
    if (ldoOpen != null && ldoClose != null && ldoClose < ldoOpen) {
      throw new Error("Closing meter must be ≥ opening meter");
    }
    const payload: any = {
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
      dgMode: form.dgMode,
      dgGeneratorName: form.dgMode === "inline" ? form.dgGeneratorName : null,
      dgStartTime: form.dgMode === "inline" ? (form.dgStartTime || null) : null,
      dgEndTime: form.dgMode === "inline" ? (form.dgEndTime || null) : null,
      dgOpeningDiesel: form.dgMode === "inline" ? numOrNull(form.dgOpeningDiesel) : null,
      dgIssuedDiesel: form.dgMode === "inline" ? numOrNull(form.dgIssuedDiesel) : null,
      dgClosingDiesel: form.dgMode === "inline" ? numOrNull(form.dgClosingDiesel) : null,
      generatorLogId: form.dgMode === "link" ? form.generatorLogId : null,
      remarks: form.remarks || null,
      editedBy: "operator",
    };
    if (extra?.pin) payload.pin = extra.pin;
    if (form.id) payload.id = form.id;
    return payload;
  };

  const saveMutation = useMutation({
    mutationFn: async (extra?: { pin?: string }) => {
      const payload = buildPayload(extra);
      const url = form.id ? `/api/plant-module/heating-sessions/${form.id}` : "/api/plant-module/heating-sessions";
      const method = form.id ? "PUT" : "POST";
      const res = await apiRequest(method, url, payload);
      if (res.status === 403) {
        const body = await res.json();
        if (body.code === "FINALIZED_LOCKED") {
          const e = new Error(body.message) as Error & { locked?: boolean };
          e.locked = true;
          throw e;
        }
        throw new Error(body.message);
      }
      return res.json();
    },
    onSuccess: (data: BitumenHeatingSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/generator-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/daily-reports", filterDate] });
      toast({ title: "Heating session saved" });
      setForm(prev => ({ ...prev, id: data.id, isFinalized: data.isFinalized }));
    },
    onError: (err: any) => {
      if (err?.locked) {
        setPinPurpose("edit-finalized");
        setShowPinAuth(true);
        toast({ title: "Finalized session — manager/admin PIN required to edit" });
      } else {
        toast({ title: "Save failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ id, pin }: { id: number; pin: string }) => {
      const res = await apiRequest("POST", `/api/plant-module/heating-sessions/${id}/finalize`, { pin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      toast({ title: "Heating session finalized" });
      setForm(prev => ({ ...prev, isFinalized: 1 }));
    },
    onError: (err: any) => toast({ title: "Finalize failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, pin }: { id: number; pin: string }) => {
      const res = await apiRequest("DELETE", `/api/plant-module/heating-sessions/${id}`, { pin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/generator-logs"] });
      toast({ title: "Heating session deleted" });
      setDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    if (pinPurpose === "finalize" && pendingFinalizeId != null) {
      finalizeMutation.mutate({ id: pendingFinalizeId, pin });
    } else if (pinPurpose === "delete" && pendingDeleteId != null) {
      if (role !== "admin") {
        toast({ title: "Admin PIN required", variant: "destructive" });
        return;
      }
      deleteMutation.mutate({ id: pendingDeleteId, pin });
    } else if (pinPurpose === "edit-finalized") {
      saveMutation.mutate({ pin });
    }
  };

  const openNew = () => {
    setForm(emptyForm(filterDate));
    setDialogOpen(true);
  };

  const openEdit = (s: BitumenHeatingSession) => {
    setForm({
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
      dgMode: (s.dgMode as DgMode) || "none",
      dgGeneratorName: s.dgGeneratorName || "600 KVA",
      dgStartTime: s.dgStartTime || "",
      dgEndTime: s.dgEndTime || "",
      dgOpeningDiesel: s.dgOpeningDiesel?.toString() || "",
      dgIssuedDiesel: s.dgIssuedDiesel?.toString() || "",
      dgClosingDiesel: s.dgClosingDiesel?.toString() || "",
      generatorLogId: s.generatorLogId,
      remarks: s.remarks || "",
      isFinalized: s.isFinalized,
      autoFilledOpening: false,
      autoFilledSource: "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Flame className="w-6 h-6 text-orange-600" />Bitumen Heating Sessions</h1>
            <p className="text-sm text-muted-foreground">Per-session boiler runs — night pre-heating + day-time maintenance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-40" data-testid="input-filter-date" />
          <Button onClick={openNew} data-testid="button-new-session"><Plus className="w-4 h-4 mr-1" />New Session</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Sessions for {filterDate}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
            !sessions?.length ? <p className="text-sm text-muted-foreground">No heating sessions for this date.</p> :
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate" data-testid={`row-session-${s.id}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={s.sessionType === "NIGHT_PREHEAT" ? "secondary" : "outline"}>
                        {s.sessionType === "NIGHT_PREHEAT" ? "Night Pre-heat" : "Day Maintenance"}
                      </Badge>
                      <span className="font-medium">{s.startTime || "—"} → {s.endTime || "—"}</span>
                      <span className="text-sm text-muted-foreground">({s.durationHours ?? 0} h)</span>
                      {s.isFinalized ? <Badge className="bg-green-600">Finalized</Badge> : <Badge variant="outline">Draft</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs mt-1 text-muted-foreground">
                      <span>Staff: {s.staffName || "—"}</span>
                      <span>LDO T1 Consumed: {s.ldoTank1Consumed?.toFixed(1) ?? "—"} L</span>
                      <span>DG Diesel: {s.dgDieselConsumed?.toFixed(1) ?? "—"} L</span>
                      <span>Hot-oil end: {s.hotOilTempEnd ?? "—"} °C</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} data-testid={`button-edit-${s.id}`}><Pencil className="w-4 h-4" /></Button>
                    {!s.isFinalized && (
                      <Button variant="ghost" size="icon" onClick={() => { setPendingFinalizeId(s.id); setPinPurpose("finalize"); setShowPinAuth(true); }} data-testid={`button-finalize-${s.id}`}>
                        <Lock className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => { setPendingDeleteId(s.id); setPinPurpose("delete"); setShowPinAuth(true); }} data-testid={`button-delete-${s.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit" : "New"} Heating Session{form.isFinalized ? " (Finalized)" : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setField("date", e.target.value)} data-testid="input-date" /></div>
              <div><Label>Session Type</Label>
                <Select value={form.sessionType} onValueChange={v => setField("sessionType", v)}>
                  <SelectTrigger data-testid="select-session-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NIGHT_PREHEAT">Night Pre-heating</SelectItem>
                    <SelectItem value="DAY_MAINTENANCE">Daytime Maintenance</SelectItem>
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
                <div><Label>Hot-Oil Temp Start °C</Label><Input type="number" step="0.1" value={form.hotOilTempStart} onChange={e => setField("hotOilTempStart", e.target.value)} data-testid="input-hot-oil-start" /></div>
                <div><Label>Hot-Oil Temp End °C</Label><Input type="number" step="0.1" value={form.hotOilTempEnd} onChange={e => setField("hotOilTempEnd", e.target.value)} data-testid="input-hot-oil-end" /></div>
                <div><Label>Hot-Oil Supply °C (opt)</Label><Input type="number" step="0.1" value={form.hotOilSupplyTemp} onChange={e => setField("hotOilSupplyTemp", e.target.value)} data-testid="input-hot-oil-supply" /></div>
                <div><Label>Hot-Oil Return °C (opt)</Label><Input type="number" step="0.1" value={form.hotOilReturnTemp} onChange={e => setField("hotOilReturnTemp", e.target.value)} data-testid="input-hot-oil-return" /></div>
                <div><Label>Bitumen T1 Start °C</Label><Input type="number" step="0.1" value={form.bitumenTank1TempStart} onChange={e => setField("bitumenTank1TempStart", e.target.value)} data-testid="input-bit-t1-start" /></div>
                <div><Label>Bitumen T1 End °C</Label><Input type="number" step="0.1" value={form.bitumenTank1TempEnd} onChange={e => setField("bitumenTank1TempEnd", e.target.value)} data-testid="input-bit-t1-end" /></div>
                <div><Label>Bitumen T2 Start °C</Label><Input type="number" step="0.1" value={form.bitumenTank2TempStart} onChange={e => setField("bitumenTank2TempStart", e.target.value)} data-testid="input-bit-t2-start" /></div>
                <div><Label>Bitumen T2 End °C</Label><Input type="number" step="0.1" value={form.bitumenTank2TempEnd} onChange={e => setField("bitumenTank2TempEnd", e.target.value)} data-testid="input-bit-t2-end" /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">LDO Tank-1 (Boiler) Flow Meter</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                <div><Label>Consumed (L)</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold text-sm" data-testid="text-ldo-consumed">{ldoConsumed?.toFixed(2) ?? "—"}</div></div>
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><Label>Generator</Label>
                      <Select value={form.dgGeneratorName} onValueChange={v => setField("dgGeneratorName", v)}>
                        <SelectTrigger data-testid="select-dg-generator"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="600 KVA">600 KVA</SelectItem>
                          <SelectItem value="40-30 KVA">40-30 KVA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>DG Start</Label><Input type="time" value={form.dgStartTime} onChange={e => setField("dgStartTime", e.target.value)} data-testid="input-dg-start" /></div>
                    <div><Label>DG End</Label><Input type="time" value={form.dgEndTime} onChange={e => setField("dgEndTime", e.target.value)} data-testid="input-dg-end" /></div>
                    <div><Label>DG Hours</Label><div className="px-3 py-2 rounded bg-muted text-sm">{dgDur ?? "—"}</div></div>
                    <div><Label>Opening (L)</Label><Input type="number" step="0.1" value={form.dgOpeningDiesel} onChange={e => setField("dgOpeningDiesel", e.target.value)} data-testid="input-dg-open" /></div>
                    <div><Label>Issued (L)</Label><Input type="number" step="0.1" value={form.dgIssuedDiesel} onChange={e => setField("dgIssuedDiesel", e.target.value)} data-testid="input-dg-issued" /></div>
                    <div><Label>Closing (L)</Label><Input type="number" step="0.1" value={form.dgClosingDiesel} onChange={e => setField("dgClosingDiesel", e.target.value)} data-testid="input-dg-close" /></div>
                    <div><Label>Consumed (L)</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold text-sm" data-testid="text-dg-consumed">{dgConsumed?.toFixed(2) ?? "—"}</div></div>
                  </div>
                )}

                {form.dgMode === "link" && (
                  <div>
                    <Label>Existing Generator Log (same date)</Label>
                    <Select value={form.generatorLogId ? String(form.generatorLogId) : ""} onValueChange={v => setField("generatorLogId", parseInt(v))}>
                      <SelectTrigger data-testid="select-link-dg"><SelectValue placeholder="Pick a generator log" /></SelectTrigger>
                      <SelectContent>
                        {generatorOptionsForDate.map(g => (
                          <SelectItem key={g.id} value={String(g.id)}>
                            #{g.id} {g.generatorName} {g.startTime}-{g.endTime} ({g.hoursRun?.toFixed(1) || "?"}h, {g.dieselConsumed?.toFixed(1) || "?"}L)
                          </SelectItem>
                        ))}
                        {!generatorOptionsForDate.length && <SelectItem value="0" disabled>No generator logs for this date</SelectItem>}
                      </SelectContent>
                    </Select>
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
                <Button variant="outline" onClick={() => { setPendingDeleteId(form.id!); setPinPurpose("delete"); setShowPinAuth(true); }} data-testid="button-delete">
                  <Trash2 className="w-4 h-4 mr-1" />Delete
                </Button>
              )}
              <Button onClick={() => {
                if (form.isFinalized) { setPinPurpose("edit-finalized"); setShowPinAuth(true); }
                else saveMutation.mutate(undefined);
              }} disabled={saveMutation.isPending} data-testid="button-save">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                {form.id ? "Update" : "Save Draft"}
              </Button>
              {form.id && !form.isFinalized && (
                <Button onClick={() => { setPendingFinalizeId(form.id!); setPinPurpose("finalize"); setShowPinAuth(true); }} data-testid="button-finalize">
                  <Lock className="w-4 h-4 mr-1" />Finalize (PIN)
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showPinAuth && (
        <PinAuth
          targetRole={pinPurpose === "delete" ? "admin" : "any"}
          onSuccess={handlePinSuccess}
          onClose={() => setShowPinAuth(false)}
        />
      )}
    </div>
  );
}
