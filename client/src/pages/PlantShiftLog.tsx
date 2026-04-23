import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Plus, Trash2, Save, Lock, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { SHIFT_IDLE_REASONS } from "@shared/schema";
import type { PlantShiftLogWithDetails } from "@shared/schema";

type ManpowerRow = { name: string; role?: string | null };
type IdleRow = { startTime: string; endTime?: string | null; reason: string; remarks?: string | null };

export default function PlantShiftLog() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const [, params] = useRoute("/plant/shift-log/:date");
  const [, setLocation] = useLocation();
  const dateParam = params?.date || format(new Date(), "yyyy-MM-dd");
  const backLink = appendOrigin("/plant/dashboard");

  const [date, setDate] = useState(dateParam);
  const [shiftCode, setShiftCode] = useState("DAY");
  const [plantStartTime, setPlantStartTime] = useState("");
  const [plantStopTime, setPlantStopTime] = useState("");
  const [weather, setWeather] = useState("");
  const [ambientTemp, setAmbientTemp] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [remarks, setRemarks] = useState("");

  const [bitumenTank1Temp, setBitumenTank1Temp] = useState("");
  const [bitumenTank2Temp, setBitumenTank2Temp] = useState("");
  const [bitumenTank1OpeningDip, setBitumenTank1OpeningDip] = useState("");
  const [bitumenTank1ClosingDip, setBitumenTank1ClosingDip] = useState("");
  const [bitumenTank2OpeningDip, setBitumenTank2OpeningDip] = useState("");
  const [bitumenTank2ClosingDip, setBitumenTank2ClosingDip] = useState("");

  const [ldoTank1OpeningMeter, setLdoTank1OpeningMeter] = useState("");
  const [ldoTank1ClosingMeter, setLdoTank1ClosingMeter] = useState("");
  const [ldoTank2OpeningMeter, setLdoTank2OpeningMeter] = useState("");
  const [ldoTank2ClosingMeter, setLdoTank2ClosingMeter] = useState("");

  const [manpower, setManpower] = useState<ManpowerRow[]>([]);
  const [idleEvents, setIdleEvents] = useState<IdleRow[]>([]);

  const [isFinalized, setIsFinalized] = useState(0);
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinPurpose, setPinPurpose] = useState<"finalize" | "delete" | "edit-finalized">("finalize");
  const [plantName, setPlantName] = useState("Main Plant");
  const [bitumenTank1StockApproxMt, setBitumenTank1StockApproxMt] = useState("");
  const [bitumenTank2StockApproxMt, setBitumenTank2StockApproxMt] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [autoFillT1Source, setAutoFillT1Source] = useState<string>("");
  const [autoFillT2Source, setAutoFillT2Source] = useState<string>("");
  // Track values written by the auto-fill effect so a re-run with a more
  // accurate cutoff (after operator types plantStartTime) can replace them,
  // but a manually-typed value is never overwritten.
  const autoFilledT1ValueRef = useRef<string | null>(null);
  const autoFilledT2ValueRef = useRef<string | null>(null);

  const { data: existing, isLoading } = useQuery<PlantShiftLogWithDetails>({
    queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/shift-logs/by-date/${date}?plant=${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    if (!existing) {
      setSavedId(null);
      setIsFinalized(0);
      return;
    }
    setSavedId(existing.id);
    setShiftCode(existing.shiftCode || "DAY");
    setPlantStartTime(existing.plantStartTime || "");
    setPlantStopTime(existing.plantStopTime || "");
    setWeather(existing.weather || "");
    setAmbientTemp(existing.ambientTemp?.toString() || "");
    setOperatorName(existing.operatorName || "");
    setSupervisorName(existing.supervisorName || "");
    setRemarks(existing.remarks || "");
    setBitumenTank1Temp(existing.bitumenTank1Temp?.toString() || "");
    setBitumenTank2Temp(existing.bitumenTank2Temp?.toString() || "");
    setBitumenTank1OpeningDip(existing.bitumenTank1OpeningDip?.toString() || "");
    setBitumenTank1ClosingDip(existing.bitumenTank1ClosingDip?.toString() || "");
    setBitumenTank2OpeningDip(existing.bitumenTank2OpeningDip?.toString() || "");
    setBitumenTank2ClosingDip(existing.bitumenTank2ClosingDip?.toString() || "");
    setLdoTank1OpeningMeter(existing.ldoTank1OpeningMeter?.toString() || "");
    setLdoTank1ClosingMeter(existing.ldoTank1ClosingMeter?.toString() || "");
    setLdoTank2OpeningMeter(existing.ldoTank2OpeningMeter?.toString() || "");
    setLdoTank2ClosingMeter(existing.ldoTank2ClosingMeter?.toString() || "");
    setManpower(existing.manpower.map(m => ({ name: m.name, role: m.role })));
    setIdleEvents(existing.idleEvents.map(e => ({
      startTime: e.startTime, endTime: e.endTime, reason: e.reason, remarks: e.remarks,
    })));
    setIsFinalized(existing.isFinalized || 0);
    setPlantName(existing.plantName || "Main Plant");
    setBitumenTank1StockApproxMt(existing.bitumenTank1StockApproxMt?.toString() || "");
    setBitumenTank2StockApproxMt(existing.bitumenTank2StockApproxMt?.toString() || "");
  }, [existing]);

  const numOrNull = (s: string) => s.trim() === "" ? null : parseFloat(s);

  const editedBy = "operator";

  const saveMutation = useMutation({
    mutationFn: async (extra?: { pin?: string }) => {
      const payload: Record<string, unknown> = {
        date, shiftCode, plantName,
        plantStartTime: plantStartTime || null,
        plantStopTime: plantStopTime || null,
        weather: weather || null,
        ambientTemp: numOrNull(ambientTemp),
        bitumenTank1StockApproxMt: numOrNull(bitumenTank1StockApproxMt),
        bitumenTank2StockApproxMt: numOrNull(bitumenTank2StockApproxMt),
        operatorName: operatorName || null,
        supervisorName: supervisorName || null,
        remarks: remarks || null,
        bitumenTank1Temp: numOrNull(bitumenTank1Temp),
        bitumenTank2Temp: numOrNull(bitumenTank2Temp),
        bitumenTank1OpeningDip: numOrNull(bitumenTank1OpeningDip),
        bitumenTank1ClosingDip: numOrNull(bitumenTank1ClosingDip),
        bitumenTank2OpeningDip: numOrNull(bitumenTank2OpeningDip),
        bitumenTank2ClosingDip: numOrNull(bitumenTank2ClosingDip),
        ldoTank1OpeningMeter: numOrNull(ldoTank1OpeningMeter),
        ldoTank1ClosingMeter: numOrNull(ldoTank1ClosingMeter),
        ldoTank2OpeningMeter: numOrNull(ldoTank2OpeningMeter),
        ldoTank2ClosingMeter: numOrNull(ldoTank2ClosingMeter),
        manpower: manpower.filter(m => m.name?.trim()).map(m => ({ name: m.name.trim().toUpperCase(), role: m.role || null })),
        idleEvents: idleEvents.filter(e => e.startTime && e.reason),
        editedBy,
      };
      if (extra?.pin) payload.pin = extra.pin;
      const res = await apiRequest("POST", "/api/plant-module/shift-logs", payload);
      if (res.status === 403) {
        const body = await res.json();
        if (body.code === "FINALIZED_LOCKED") {
          const e = new Error(body.message) as Error & { locked?: boolean };
          e.locked = true;
          throw e;
        }
        throw new Error(body.message || "Forbidden");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName] });
      setSavedId(data.id);
      setIsFinalized(data.isFinalized || 0);
      toast({ title: "Shift log saved" });
    },
    onError: (err: any) => {
      if (err?.locked) {
        setPinPurpose("edit-finalized");
        setShowPinAuth(true);
        toast({ title: "Finalized log — manager/admin PIN required to edit" });
      } else {
        toast({ title: "Save failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ pin, role }: { pin: string; role: string }) => {
      if (!savedId) throw new Error("Save the log first");
      const res = await apiRequest("POST", `/api/plant-module/shift-logs/${savedId}/finalize`, { pin, finalizedBy: role });
      return res.json();
    },
    onSuccess: () => {
      setIsFinalized(1);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName] });
      toast({ title: "Shift log finalized for management review" });
    },
    onError: (err: any) => toast({ title: "Finalize failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (pin: string) => {
      if (!savedId) throw new Error("Nothing to delete");
      const res = await apiRequest("DELETE", `/api/plant-module/shift-logs/${savedId}`, { pin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      toast({ title: "Shift log deleted" });
      setLocation(appendOrigin("/plant/dashboard"));
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    if (pinPurpose === "finalize") finalizeMutation.mutate({ pin, role });
    else if (pinPurpose === "edit-finalized") saveMutation.mutate({ pin });
    else if (pinPurpose === "delete") {
      if (role !== "admin") {
        toast({ title: "Admin PIN required", variant: "destructive" });
        return;
      }
      deleteMutation.mutate(pin);
    }
  };

  // Auto-fill Tank-1 opening (latest meter reading before shift start) and Tank-2 opening (yesterday's closing) for new logs.
  // Re-run when plantStartTime becomes available so the cutoff is the actual shift start (not 00:00).
  useEffect(() => {
    if (existing) return; // never overwrite when loaded from DB
    if (!date) return;
    let cancelled = false;
    // Tank-1: refetch when plantStartTime changes so the cutoff matches the
    // real shift start. Manually-typed values are protected via the ref.
    const t1IsEmpty = !ldoTank1OpeningMeter;
    const t1IsAutoFilled = ldoTank1OpeningMeter && ldoTank1OpeningMeter === autoFilledT1ValueRef.current;
    if (t1IsEmpty || t1IsAutoFilled) {
      const before = `${date}T${plantStartTime || "23:59"}`;
      fetch(`/api/plant-module/ldo-meter/last?tank=1&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(plantName)}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then((data: any) => {
          if (cancelled) return;
          if (data && typeof data.value === "number") {
            const next = String(data.value);
            setLdoTank1OpeningMeter(prev => {
              // Manual edit since last auto-fill — never overwrite.
              if (prev && prev !== autoFilledT1ValueRef.current) return prev;
              autoFilledT1ValueRef.current = next;
              setAutoFillT1Source(data.source);
              return next;
            });
          }
        })
        .catch(() => {});
    }
    if (!ldoTank2OpeningMeter) {
      const before = `${date}T00:00`;
      fetch(`/api/plant-module/ldo-meter/last?tank=2&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(plantName)}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then((data: any) => {
          if (cancelled) return;
          if (data && typeof data.value === "number") {
            const next = String(data.value);
            setLdoTank2OpeningMeter(prev => {
              if (prev) return prev;
              autoFilledT2ValueRef.current = next;
              setAutoFillT2Source(data.source);
              return next;
            });
          }
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, date, plantName, plantStartTime]);

  // Derived
  const ldoTotal = useMemo(() => {
    const t1Open = parseFloat(ldoTank1OpeningMeter), t1Close = parseFloat(ldoTank1ClosingMeter);
    const t2Open = parseFloat(ldoTank2OpeningMeter), t2Close = parseFloat(ldoTank2ClosingMeter);
    const t1 = (!isNaN(t1Open) && !isNaN(t1Close)) ? Math.max(0, t1Close - t1Open) : null;
    const t2 = (!isNaN(t2Open) && !isNaN(t2Close)) ? Math.max(0, t2Close - t2Open) : null;
    return { t1, t2, total: (t1 || 0) + (t2 || 0) };
  }, [ldoTank1OpeningMeter, ldoTank1ClosingMeter, ldoTank2OpeningMeter, ldoTank2ClosingMeter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Plant Shift Log</h1>
            <p className="text-sm text-muted-foreground">Operator daily log – plant start/stop, idle events, manpower, fuel meters</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFinalized ? <Badge variant="default" className="bg-green-600">Finalized</Badge> : savedId ? <Badge variant="secondary">Draft saved</Badge> : null}
          <Link href={appendOrigin(`/plant/daily-report/${date}`)}>
            <Button variant="outline" size="sm" data-testid="button-view-daily-report"><FileText className="w-4 h-4 mr-1" />Daily Report</Button>
          </Link>
        </div>
      </div>

      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}

      <Card>
        <CardHeader><CardTitle>Header</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-date" /></div>
          <div><Label>Shift</Label>
            <Select value={shiftCode} onValueChange={setShiftCode}>
              <SelectTrigger data-testid="select-shift"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day</SelectItem>
                <SelectItem value="NIGHT">Night</SelectItem>
                <SelectItem value="FULL">Full Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Plant Start</Label><Input type="time" value={plantStartTime} onChange={e => setPlantStartTime(e.target.value)} data-testid="input-plant-start" /></div>
          <div><Label>Plant Stop</Label><Input type="time" value={plantStopTime} onChange={e => setPlantStopTime(e.target.value)} data-testid="input-plant-stop" /></div>
          <div><Label>Operator</Label><Input value={operatorName} onChange={e => setOperatorName(e.target.value)} data-testid="input-operator" /></div>
          <div><Label>Supervisor</Label><Input value={supervisorName} onChange={e => setSupervisorName(e.target.value)} data-testid="input-supervisor" /></div>
          <div><Label>Weather</Label>
            <Select value={weather} onValueChange={setWeather}>
              <SelectTrigger data-testid="select-weather"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Sunny">Sunny</SelectItem>
                <SelectItem value="Cloudy">Cloudy</SelectItem>
                <SelectItem value="Rain">Rain</SelectItem>
                <SelectItem value="Hot">Hot</SelectItem>
                <SelectItem value="Cold">Cold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Ambient Temp °C</Label><Input type="number" step="0.1" value={ambientTemp} onChange={e => setAmbientTemp(e.target.value)} data-testid="input-ambient-temp" /></div>
          <div><Label>Plant</Label><Input value={plantName} onChange={e => setPlantName(e.target.value)} data-testid="input-plant-name" /></div>
          <div><Label>Bitumen Tank 1 Stock ≈ MT</Label><Input type="number" step="0.01" value={bitumenTank1StockApproxMt} onChange={e => setBitumenTank1StockApproxMt(e.target.value)} data-testid="input-bitumen-tank1-stock-mt" /></div>
          <div><Label>Bitumen Tank 2 Stock ≈ MT</Label><Input type="number" step="0.01" value={bitumenTank2StockApproxMt} onChange={e => setBitumenTank2StockApproxMt(e.target.value)} data-testid="input-bitumen-tank2-stock-mt" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bitumen Tanks (Theoretical)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Tank 1 Temp °C</Label><Input type="number" step="0.1" value={bitumenTank1Temp} onChange={e => setBitumenTank1Temp(e.target.value)} data-testid="input-bitumen-t1-temp" /></div>
          <div><Label>Tank 1 Opening Dip (cm)</Label><Input type="number" step="0.1" value={bitumenTank1OpeningDip} onChange={e => setBitumenTank1OpeningDip(e.target.value)} data-testid="input-bitumen-t1-open" /></div>
          <div><Label>Tank 1 Closing Dip (cm)</Label><Input type="number" step="0.1" value={bitumenTank1ClosingDip} onChange={e => setBitumenTank1ClosingDip(e.target.value)} data-testid="input-bitumen-t1-close" /></div>
          <div />
          <div><Label>Tank 2 Temp °C</Label><Input type="number" step="0.1" value={bitumenTank2Temp} onChange={e => setBitumenTank2Temp(e.target.value)} data-testid="input-bitumen-t2-temp" /></div>
          <div><Label>Tank 2 Opening Dip (cm)</Label><Input type="number" step="0.1" value={bitumenTank2OpeningDip} onChange={e => setBitumenTank2OpeningDip(e.target.value)} data-testid="input-bitumen-t2-open" /></div>
          <div><Label>Tank 2 Closing Dip (cm)</Label><Input type="number" step="0.1" value={bitumenTank2ClosingDip} onChange={e => setBitumenTank2ClosingDip(e.target.value)} data-testid="input-bitumen-t2-close" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>LDO Flow Meters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Tank 1 (Boiler) Opening</Label>
            <Input type="number" step="0.01" value={ldoTank1OpeningMeter}
              onChange={e => { setLdoTank1OpeningMeter(e.target.value); setAutoFillT1Source(""); }}
              data-testid="input-ldo-t1-open" />
            {autoFillT1Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t1">Auto-filled from {autoFillT1Source}</p>}
          </div>
          <div><Label>Tank 1 (Boiler) Closing</Label><Input type="number" step="0.01" value={ldoTank1ClosingMeter} onChange={e => setLdoTank1ClosingMeter(e.target.value)} data-testid="input-ldo-t1-close" /></div>
          <div><Label>Tank 1 Consumption (L)</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-ldo-t1-consumed">{ldoTotal.t1?.toFixed(2) ?? "—"}</div></div>
          <div />
          <div>
            <Label>Tank 2 (Dryer) Opening</Label>
            <Input type="number" step="0.01" value={ldoTank2OpeningMeter}
              onChange={e => { setLdoTank2OpeningMeter(e.target.value); setAutoFillT2Source(""); }}
              data-testid="input-ldo-t2-open" />
            {autoFillT2Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t2">Auto-filled from {autoFillT2Source}</p>}
          </div>
          <div><Label>Tank 2 (Dryer) Closing</Label><Input type="number" step="0.01" value={ldoTank2ClosingMeter} onChange={e => setLdoTank2ClosingMeter(e.target.value)} data-testid="input-ldo-t2-close" /></div>
          <div><Label>Tank 2 Consumption (L)</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-ldo-t2-consumed">{ldoTotal.t2?.toFixed(2) ?? "—"}</div></div>
          <div><Label>Total LDO (L)</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold" data-testid="text-ldo-total">{ldoTotal.total ? ldoTotal.total.toFixed(2) : "—"}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Manpower</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setManpower([...manpower, { name: "", role: "" }])} data-testid="button-add-manpower"><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {manpower.length === 0 && <p className="text-sm text-muted-foreground">No manpower added.</p>}
          {manpower.map((m, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`row-manpower-${i}`}>
              <Input className="col-span-6" placeholder="Name" value={m.name} onChange={e => {
                const c = [...manpower]; c[i] = { ...c[i], name: e.target.value }; setManpower(c);
              }} data-testid={`input-manpower-name-${i}`} />
              <Input className="col-span-5" placeholder="Role" value={m.role || ""} onChange={e => {
                const c = [...manpower]; c[i] = { ...c[i], role: e.target.value }; setManpower(c);
              }} data-testid={`input-manpower-role-${i}`} />
              <Button className="col-span-1" variant="ghost" size="icon" onClick={() => setManpower(manpower.filter((_, idx) => idx !== i))} data-testid={`button-remove-manpower-${i}`}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Idle Events</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setIdleEvents([...idleEvents, { startTime: "", endTime: "", reason: "Material Shortage", remarks: "" }])} data-testid="button-add-idle"><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {idleEvents.length === 0 && <p className="text-sm text-muted-foreground">No idle events.</p>}
          {idleEvents.map((ev, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`row-idle-${i}`}>
              <Input className="col-span-2" type="time" value={ev.startTime} onChange={e => {
                const c = [...idleEvents]; c[i] = { ...c[i], startTime: e.target.value }; setIdleEvents(c);
              }} data-testid={`input-idle-start-${i}`} />
              <Input className="col-span-2" type="time" value={ev.endTime || ""} onChange={e => {
                const c = [...idleEvents]; c[i] = { ...c[i], endTime: e.target.value }; setIdleEvents(c);
              }} data-testid={`input-idle-end-${i}`} placeholder="(blank if ongoing)" />
              <Select value={ev.reason} onValueChange={(v) => {
                const c = [...idleEvents]; c[i] = { ...c[i], reason: v }; setIdleEvents(c);
              }}>
                <SelectTrigger className="col-span-3" data-testid={`select-idle-reason-${i}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFT_IDLE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="col-span-4" placeholder="Remarks" value={ev.remarks || ""} onChange={e => {
                const c = [...idleEvents]; c[i] = { ...c[i], remarks: e.target.value }; setIdleEvents(c);
              }} data-testid={`input-idle-remarks-${i}`} />
              <Button className="col-span-1" variant="ghost" size="icon" onClick={() => setIdleEvents(idleEvents.filter((_, idx) => idx !== i))} data-testid={`button-remove-idle-${i}`}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Remarks (End-of-Day)</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Plant conditions, breakdowns, anything notable..." data-testid="input-remarks" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 justify-end">
        {savedId && (
          <Button variant="outline" onClick={() => { setPinPurpose("delete"); setShowPinAuth(true); }} data-testid="button-delete">
            <Trash2 className="w-4 h-4 mr-1" />Delete
          </Button>
        )}
        <Button onClick={() => {
          if (isFinalized) { setPinPurpose("edit-finalized"); setShowPinAuth(true); }
          else saveMutation.mutate(undefined);
        }} disabled={saveMutation.isPending} data-testid="button-save">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          {savedId ? "Update" : "Save Draft"}
        </Button>
        {savedId && !isFinalized && (
          <Button variant="default" onClick={() => { setPinPurpose("finalize"); setShowPinAuth(true); }} data-testid="button-finalize">
            <Lock className="w-4 h-4 mr-1" />Finalize (PIN)
          </Button>
        )}
      </div>

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
