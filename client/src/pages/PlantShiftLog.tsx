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
import { ChevronLeft, Plus, Trash2, Save, FileText, Loader2, Pencil, Users, FolderOpen } from "lucide-react";
import { format, subDays } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SHIFT_IDLE_REASONS, LABOUR_CATEGORIES, LABOUR_GENDERS } from "@shared/schema";
import type { PlantShiftLog as PlantShiftLogRow, PlantShiftLogWithDetails, BitumenHeatingSession } from "@shared/schema";

type ManpowerRow = {
  name: string;
  role?: string | null;
  contractorName?: string | null;
  category?: string | null;
  gender?: string | null;
};
type IdleRow = { startTime: string; endTime?: string | null; reason: string; remarks?: string | null };

export default function PlantShiftLog() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const [, params] = useRoute("/plant/shift-log/:date");
  const [, setLocation] = useLocation();
  const today = format(new Date(), "yyyy-MM-dd");
  const dateParam = params?.date || today;

  // View mode: list when no :date in URL, edit when specific date.
  const [viewMode, setViewMode] = useState<"list" | "edit">(params?.date ? "edit" : "list");
  const [listDateFrom, setListDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [listDateTo, setListDateTo] = useState(today);
  const _sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const _backTab = _sp.get("tab") || "operations";
  const _backRole = _sp.get("role");
  const _dashBase = appendOrigin("/plant/dashboard");
  const backLink = `${_dashBase}${_dashBase.includes("?") ? "&" : "?"}tab=${_backTab}${_backRole ? `&role=${_backRole}` : ""}`;

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

  // Manpower modal
  const [mpDialogOpen, setMpDialogOpen] = useState(false);
  const [mpEditingIdx, setMpEditingIdx] = useState<number | null>(null);
  const [mpDraft, setMpDraft] = useState<ManpowerRow>({ name: "", role: "", contractorName: "", category: "", gender: "" });

  // Idle modal
  const [idleDialogOpen, setIdleDialogOpen] = useState(false);
  const [idleEditingIdx, setIdleEditingIdx] = useState<number | null>(null);
  const [idleDraft, setIdleDraft] = useState<IdleRow>({ startTime: "", endTime: "", reason: "Material Shortage", remarks: "" });

  const openAddManpower = () => {
    setMpEditingIdx(null);
    setMpDraft({ name: "", role: "", contractorName: "", category: "", gender: "" });
    setMpDialogOpen(true);
  };
  const openEditManpower = (idx: number) => {
    setMpEditingIdx(idx);
    setMpDraft({ ...manpower[idx] });
    setMpDialogOpen(true);
  };
  const saveManpowerDraft = () => {
    if (!mpDraft.name?.trim() || !mpDraft.contractorName?.trim() || !mpDraft.category || !mpDraft.gender) {
      toast({ title: "Name, contractor, category, and gender are required", variant: "destructive" });
      return;
    }
    const row: ManpowerRow = {
      name: mpDraft.name.trim(),
      role: mpDraft.role || null,
      contractorName: mpDraft.contractorName.trim().toUpperCase(),
      category: (mpDraft.category || "").toUpperCase(),
      gender: (mpDraft.gender || "").toUpperCase(),
    };
    if (mpEditingIdx === null) setManpower([...manpower, row]);
    else {
      const c = [...manpower]; c[mpEditingIdx] = row; setManpower(c);
    }
    setMpDialogOpen(false);
  };
  const removeManpower = (idx: number) => setManpower(manpower.filter((_, i) => i !== idx));
  const rateCardKeyForRow = (m: ManpowerRow) =>
    m.category && m.gender ? `LAB_${m.category}_${m.gender}` : m.category ? `LAB_${m.category}` : "";

  const openAddIdle = () => {
    setIdleEditingIdx(null);
    setIdleDraft({ startTime: "", endTime: "", reason: "Material Shortage", remarks: "" });
    setIdleDialogOpen(true);
  };
  const openEditIdle = (idx: number) => {
    setIdleEditingIdx(idx);
    setIdleDraft({ ...idleEvents[idx] });
    setIdleDialogOpen(true);
  };
  const saveIdleDraft = () => {
    if (!idleDraft.startTime || !idleDraft.reason) {
      toast({ title: "Start time and reason are required", variant: "destructive" });
      return;
    }
    if (idleEditingIdx === null) setIdleEvents([...idleEvents, idleDraft]);
    else {
      const c = [...idleEvents]; c[idleEditingIdx] = idleDraft; setIdleEvents(c);
    }
    setIdleDialogOpen(false);
  };
  const removeIdle = (idx: number) => setIdleEvents(idleEvents.filter((_, i) => i !== idx));

  const idleMinutes = (e: IdleRow) => {
    if (!e.startTime || !e.endTime) return null;
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? mins : null;
  };

  const [isFinalized, setIsFinalized] = useState(0);
  const [plantName, setPlantName] = useState("Main Plant");
  const [bitumenTank1StockApproxMt, setBitumenTank1StockApproxMt] = useState("");
  const [bitumenTank2StockApproxMt, setBitumenTank2StockApproxMt] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [autoFillT1Source, setAutoFillT1Source] = useState<string>("");
  const [autoFillT1ClosingSource, setAutoFillT1ClosingSource] = useState<string>("");
  const [autoFillT2Source, setAutoFillT2Source] = useState<string>("");
  // Track values written by the auto-fill effect so a re-run with a more
  // accurate cutoff (after operator types plantStartTime) can replace them,
  // but a manually-typed value is never overwritten.
  const autoFilledT1ValueRef = useRef<string | null>(null);
  const autoFilledT1ClosingValueRef = useRef<string | null>(null);
  const autoFilledT2ValueRef = useRef<string | null>(null);

  const { data: existing, isLoading } = useQuery<PlantShiftLogWithDetails | undefined>({
    queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName],
    enabled: viewMode === "edit",
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/shift-logs/by-date/${date}?plant=${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // List view query: all shift logs in the chosen date range.
  const { data: shiftLogs, isLoading: listLoading } = useQuery<PlantShiftLogRow[]>({
    queryKey: ["/api/plant-module/shift-logs", listDateFrom, listDateTo],
    enabled: viewMode === "list",
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (listDateFrom) qs.set("dateFrom", listDateFrom);
      if (listDateTo) qs.set("dateTo", listDateTo);
      const res = await fetch(`/api/plant-module/shift-logs?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const resetForNew = () => {
    setSavedId(null);
    setIsFinalized(0);
    setShiftCode("DAY");
    setPlantStartTime(""); setPlantStopTime("");
    setWeather(""); setAmbientTemp("");
    setOperatorName(""); setSupervisorName(""); setRemarks("");
    setBitumenTank1Temp(""); setBitumenTank2Temp("");
    setBitumenTank1OpeningDip(""); setBitumenTank1ClosingDip("");
    setBitumenTank2OpeningDip(""); setBitumenTank2ClosingDip("");
    setLdoTank1OpeningMeter(""); setLdoTank1ClosingMeter("");
    setLdoTank2OpeningMeter(""); setLdoTank2ClosingMeter("");
    setManpower([]); setIdleEvents([]);
    setBitumenTank1StockApproxMt(""); setBitumenTank2StockApproxMt("");
    setAutoFillT1Source(""); setAutoFillT1ClosingSource(""); setAutoFillT2Source("");
    autoFilledT1ValueRef.current = null;
    autoFilledT1ClosingValueRef.current = null;
    autoFilledT2ValueRef.current = null;
  };

  const openEditForDate = (d: string, plant: string) => {
    setDate(d);
    setPlantName(plant || "Main Plant");
    resetForNew();
    setViewMode("edit");
  };
  const openNew = () => {
    setDate(today);
    setPlantName("Main Plant");
    resetForNew();
    setViewMode("edit");
  };
  const goBackToList = () => {
    setViewMode("list");
    queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
  };

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
    // Loading a saved record — clear any auto-fill hint state from prior new-log session.
    setAutoFillT1Source("");
    setAutoFillT1ClosingSource("");
    setAutoFillT2Source("");
    autoFilledT1ValueRef.current = null;
    autoFilledT1ClosingValueRef.current = null;
    autoFilledT2ValueRef.current = null;
    setManpower(existing.manpower.map(m => ({
      name: m.name,
      role: m.role,
      contractorName: m.contractorName ?? null,
      category: m.category ?? null,
      gender: m.gender ?? null,
    })));
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

  const incompleteManpower = manpower.filter(
    m => m.name?.trim() && (!m.contractorName?.trim() || !m.category || !m.gender)
  );

  const saveMutation = useMutation({
    mutationFn: async (extra?: { pin?: string }) => {
      if (incompleteManpower.length > 0) {
        throw new Error(
          `${incompleteManpower.length} manpower row(s) are missing Contractor / Category / Gender. ` +
          `Open each row and complete the fields before saving (legacy rows must be backfilled).`
        );
      }
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
        manpower: manpower
          .filter(m => m.name?.trim())
          .map(m => ({
            name: m.name.trim().toUpperCase(),
            role: m.role || null,
            contractorName: m.contractorName ? m.contractorName.trim().toUpperCase() : "",
            category: m.category ? m.category.toUpperCase() : "",
            gender: m.gender ? m.gender.toUpperCase() : "",
          })),
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
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/bitumen-dip-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/by-date", date, plantName] });
      setSavedId(data.id);
      setIsFinalized(1);
      toast({ title: "Shift log saved" });
      // Auto-finalize so the operator doesn't need a second click — server no
      // longer requires a PIN. Then return to the list view.
      try {
        await apiRequest("POST", `/api/plant-module/shift-logs/${data.id}/finalize`, { finalizedBy: "operator" });
      } catch { /* save already succeeded */ }
      goBackToList();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Nothing to delete");
      const pin = window.prompt("Enter admin PIN to delete this shift log");
      if (!pin) throw new Error("Cancelled");
      const res = await apiRequest("DELETE", `/api/plant-module/shift-logs/${savedId}`, { pin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      toast({ title: "Shift log deleted" });
      goBackToList();
    },
    onError: (err: any) => {
      if (err?.message === "Cancelled") return;
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  // Reactive query: heating sessions for the current date/plant drive the
  // Boiler Meter auto-prefill. Using useQuery ensures the shift log picks up
  // new/edited sessions via cache invalidation (e.g. after saving a session).
  const { data: heatingSessionsForDate } = useQuery<BitumenHeatingSession[]>({
    queryKey: ["/api/plant-module/heating-sessions", { date, plant: plantName }],
    enabled: viewMode === "edit" && !!date,
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/heating-sessions?date=${date}&plant=${encodeURIComponent(plantName)}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Auto-fill Boiler Meter opening/closing from heating sessions for the date
  // (first opening / last closing). Falls back to /ldo-meter/last for opening
  // only when no heating sessions exist yet. Dryer Meter opening uses
  // yesterday's closing as before. Manually-typed values are never
  // overwritten. Re-runs when plantStartTime or the sessions query data
  // changes so the cutoff matches the actual shift start and any newly
  // created session immediately populates the shift log.
  useEffect(() => {
    if (existing) return; // never overwrite when loaded from DB
    if (!date) return;
    let cancelled = false;

    // Boiler Meter (Tank-1) opening + closing: prefer heating sessions for the
    // date; fall back to /ldo-meter/last for the opening only when none.
    const t1OpenIsEmpty = !ldoTank1OpeningMeter;
    const t1OpenIsAutoFilled = ldoTank1OpeningMeter && ldoTank1OpeningMeter === autoFilledT1ValueRef.current;
    const t1CloseIsEmpty = !ldoTank1ClosingMeter;
    const t1CloseIsAutoFilled = ldoTank1ClosingMeter && ldoTank1ClosingMeter === autoFilledT1ClosingValueRef.current;
    const wantT1Open = t1OpenIsEmpty || t1OpenIsAutoFilled;
    const wantT1Close = t1CloseIsEmpty || t1CloseIsAutoFilled;

    const safe: BitumenHeatingSession[] = Array.isArray(heatingSessionsForDate) ? heatingSessionsForDate : [];
    // First opening of the day (earliest startTime) with a meter value.
    const openCandidates = safe
      .filter(s => s && s.ldoTank1OpeningMeter != null)
      .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));
    const closeCandidates = safe
      .filter(s => s && s.ldoTank1ClosingMeter != null)
      .sort((a, b) => String(b.endTime || b.startTime || "").localeCompare(String(a.endTime || a.startTime || "")));
    const sessOpen = openCandidates[0]?.ldoTank1OpeningMeter;
    const sessClose = closeCandidates[0]?.ldoTank1ClosingMeter;

    if (wantT1Open && typeof sessOpen === "number") {
      const next = String(sessOpen);
      setLdoTank1OpeningMeter(prev => {
        if (prev && prev !== autoFilledT1ValueRef.current) return prev;
        autoFilledT1ValueRef.current = next;
        setAutoFillT1Source("Heating Sessions");
        return next;
      });
    } else if (wantT1Open && safe.length === 0 && heatingSessionsForDate !== undefined) {
      // Fallback only once the sessions query has resolved and the day has
      // zero heating sessions: use the most recent meter reading before
      // shift start.
      const before = `${date}T${plantStartTime || "23:59"}`;
      type LdoLast = { value: number; source: string };
      fetch(`/api/plant-module/ldo-meter/last?tank=1&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(plantName)}`, { credentials: "include" })
        .then(r => r.ok ? (r.json() as Promise<LdoLast | null>) : null)
        .then((data) => {
          if (cancelled) return;
          if (data && typeof data.value === "number") {
            const next = String(data.value);
            setLdoTank1OpeningMeter(prev => {
              if (prev && prev !== autoFilledT1ValueRef.current) return prev;
              autoFilledT1ValueRef.current = next;
              setAutoFillT1Source(data.source);
              return next;
            });
          }
        })
        .catch(() => {});
    }

    if (wantT1Close && typeof sessClose === "number") {
      const next = String(sessClose);
      setLdoTank1ClosingMeter(prev => {
        if (prev && prev !== autoFilledT1ClosingValueRef.current) return prev;
        autoFilledT1ClosingValueRef.current = next;
        setAutoFillT1ClosingSource("Heating Sessions");
        return next;
      });
    }
    if (!ldoTank2OpeningMeter) {
      const before = `${date}T00:00`;
      type LdoLastT2 = { value: number; source: string };
      fetch(`/api/plant-module/ldo-meter/last?tank=2&before=${encodeURIComponent(before)}&plant=${encodeURIComponent(plantName)}`, { credentials: "include" })
        .then(r => r.ok ? (r.json() as Promise<LdoLastT2 | null>) : null)
        .then((data) => {
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
  }, [existing, date, plantName, plantStartTime, heatingSessionsForDate]);

  // Derived
  const ldoTotal = useMemo(() => {
    const t1Open = parseFloat(ldoTank1OpeningMeter), t1Close = parseFloat(ldoTank1ClosingMeter);
    const t2Open = parseFloat(ldoTank2OpeningMeter), t2Close = parseFloat(ldoTank2ClosingMeter);
    const t1 = (!isNaN(t1Open) && !isNaN(t1Close)) ? Math.max(0, t1Close - t1Open) : null;
    const t2 = (!isNaN(t2Open) && !isNaN(t2Close)) ? Math.max(0, t2Close - t2Open) : null;
    return { t1, t2, total: (t1 || 0) + (t2 || 0) };
  }, [ldoTank1OpeningMeter, ldoTank1ClosingMeter, ldoTank2OpeningMeter, ldoTank2ClosingMeter]);

  if (viewMode === "list") {
    const sorted = (shiftLogs || []).slice().sort(
      (a, b) => b.date.localeCompare(a.date) || (a.shiftCode || "").localeCompare(b.shiftCode || "")
    );
    const grouped: Record<string, PlantShiftLogRow[]> = {};
    for (const r of sorted) (grouped[r.date] = grouped[r.date] || []).push(r);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href={backLink}>
              <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Plant Shift Logs</h1>
              <p className="text-sm text-muted-foreground">Daily plant runs — pick a date to open or start a new shift log</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Label className="text-xs whitespace-nowrap">From</Label>
              <Input type="date" value={listDateFrom} onChange={e => setListDateFrom(e.target.value)} className="w-40" data-testid="input-list-from" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs whitespace-nowrap">To</Label>
              <Input type="date" value={listDateTo} onChange={e => setListDateTo(e.target.value)} className="w-40" data-testid="input-list-to" />
            </div>
            <Link href="/plant/shift-log-manpower-review">
              <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 dark:text-amber-400" data-testid="link-manpower-review">
                <Users className="w-4 h-4 mr-1" />Review UNKNOWN
              </Button>
            </Link>
            <Button onClick={openNew} data-testid="button-new-shift-log"><Plus className="w-4 h-4 mr-1" />New Shift Log</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Shift Logs {listDateFrom} → {listDateTo}</CardTitle></CardHeader>
          <CardContent>
            {listLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
              !sorted.length ? <p className="text-sm text-muted-foreground">No shift logs in this date range.</p> :
              <div className="space-y-4">
                {Object.keys(grouped).map(d => (
                  <div key={d}>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{d}</div>
                    <div className="space-y-2">
                      {grouped[d].map(r => {
                        const ldo1 = (r.ldoTank1OpeningMeter != null && r.ldoTank1ClosingMeter != null)
                          ? Math.max(0, r.ldoTank1ClosingMeter - r.ldoTank1OpeningMeter) : null;
                        const ldo2 = (r.ldoTank2OpeningMeter != null && r.ldoTank2ClosingMeter != null)
                          ? Math.max(0, r.ldoTank2ClosingMeter - r.ldoTank2OpeningMeter) : null;
                        const dur = (() => {
                          if (!r.plantStartTime || !r.plantStopTime) return null;
                          const [sh, sm] = r.plantStartTime.split(":").map(Number);
                          const [eh, em] = r.plantStopTime.split(":").map(Number);
                          let mins = (eh * 60 + em) - (sh * 60 + sm);
                          if (mins < 0) mins += 24 * 60;
                          return Math.round((mins / 60) * 100) / 100;
                        })();
                        const ldoLPerHr = (ldo1 != null && dur && dur > 0) ? (ldo1 / dur).toFixed(2) : null;
                        return (
                          <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate" data-testid={`row-shift-log-${r.id}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline">{r.shiftCode}</Badge>
                                <span className="font-medium">{r.plantStartTime || "—"} → {r.plantStopTime || "—"}</span>
                                {dur != null && <span className="text-sm text-muted-foreground">({dur} h)</span>}
                                <span className="text-xs text-muted-foreground">{r.plantName}</span>
                                {r.isFinalized ? <Badge variant="default" className="bg-green-600">Finalized</Badge> : <Badge variant="secondary">Draft</Badge>}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1 text-muted-foreground">
                                <span>Operator: {r.operatorName || "—"}</span>
                                <span>Boiler Meter: {ldo1?.toFixed(1) ?? "—"} L{ldoLPerHr && <span className="ml-1">({ldoLPerHr} L/Hr)</span>}</span>
                                <span>Dryer Meter: {ldo2?.toFixed(1) ?? "—"} L</span>
                                <span>Weather: {r.weather || "—"}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Link href={appendOrigin(`/plant/daily-report/${r.date}`)}>
                                <Button variant="ghost" size="sm" data-testid={`button-daily-report-${r.id}`}>
                                  <FileText className="w-4 h-4 mr-1" />Report
                                </Button>
                              </Link>
                              <Button variant="outline" size="sm" onClick={() => openEditForDate(r.date, r.plantName)} data-testid={`button-open-${r.id}`}>
                                <FolderOpen className="w-4 h-4 mr-1" />Open
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            }
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBackToList} data-testid="button-back-to-list"><ChevronLeft className="w-5 h-5" /></Button>
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
        <CardHeader>
          <CardTitle>LDO Flow Meters</CardTitle>
          <p className="text-xs text-muted-foreground">Both meters draw from the main LDO tank.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Boiler Meter Opening</Label>
            <Input type="number" step="0.01" value={ldoTank1OpeningMeter}
              onChange={e => { setLdoTank1OpeningMeter(e.target.value); setAutoFillT1Source(""); }}
              data-testid="input-ldo-t1-open" />
            {autoFillT1Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t1">Auto-filled from {autoFillT1Source}</p>}
          </div>
          <div>
            <Label>Boiler Meter Closing</Label>
            <Input type="number" step="0.01" value={ldoTank1ClosingMeter}
              onChange={e => { setLdoTank1ClosingMeter(e.target.value); setAutoFillT1ClosingSource(""); }}
              data-testid="input-ldo-t1-close" />
            {autoFillT1ClosingSource && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t1-close">Auto-filled from {autoFillT1ClosingSource}</p>}
          </div>
          <div><Label>Boiler Consumption (L)</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-ldo-t1-consumed">{ldoTotal.t1?.toFixed(2) ?? "—"}</div></div>
          <div />
          <div>
            <Label>Dryer Meter Opening</Label>
            <Input type="number" step="0.01" value={ldoTank2OpeningMeter}
              onChange={e => { setLdoTank2OpeningMeter(e.target.value); setAutoFillT2Source(""); }}
              data-testid="input-ldo-t2-open" />
            {autoFillT2Source && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-t2">Auto-filled from {autoFillT2Source}</p>}
          </div>
          <div><Label>Dryer Meter Closing</Label><Input type="number" step="0.01" value={ldoTank2ClosingMeter} onChange={e => setLdoTank2ClosingMeter(e.target.value)} data-testid="input-ldo-t2-close" /></div>
          <div><Label>Dryer Consumption (L)</Label><div className="px-3 py-2 rounded bg-muted text-sm" data-testid="text-ldo-t2-consumed">{ldoTotal.t2?.toFixed(2) ?? "—"}</div></div>
          <div><Label>Total LDO (L)</Label><div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 font-semibold" data-testid="text-ldo-total">{ldoTotal.total ? ldoTotal.total.toFixed(2) : "—"}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Heating Sessions for this date
              <Badge variant="secondary" data-testid="badge-heating-session-count">
                {(heatingSessionsForDate || []).length}
              </Badge>
            </CardTitle>
            <Link href={appendOrigin(`/plant/heating-sessions/${date}`)}>
              <Button size="sm" variant="outline" data-testid="button-open-heating-sessions">
                <Plus className="w-4 h-4 mr-1" />Add / Edit Sessions
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!(heatingSessionsForDate || []).length && (
            <p className="text-sm text-muted-foreground">
              No heating sessions recorded for {date}. Use "Add / Edit Sessions" to log boiler runs — session values (bitumen temps, hot-oil, DG) feed the Plant Daily Report automatically.
            </p>
          )}
          {(heatingSessionsForDate || []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Time</th>
                    <th className="py-2 pr-2">Staff</th>
                    <th className="py-2 pr-2 text-right">Boiler LDO (L)</th>
                    <th className="py-2 pr-2 text-right">DG</th>
                    <th className="py-2 pr-2">Hot-Oil End °C</th>
                  </tr>
                </thead>
                <tbody>
                  {(heatingSessionsForDate || [])
                    .slice()
                    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
                    .map(s => (
                      <tr key={s.id} className="border-b last:border-b-0" data-testid={`row-shift-heating-${s.id}`}>
                        <td className="py-2 pr-2">
                          <Badge variant={s.sessionType === "NIGHT_PREHEAT" ? "secondary" : "outline"} className="text-xs">
                            {s.sessionType === "NIGHT_PREHEAT" ? "Night" : "Day"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">{s.startTime || "—"} → {s.endTime || "—"}</td>
                        <td className="py-2 pr-2">{s.staffName || "—"}</td>
                        <td className="py-2 pr-2 text-right">{s.ldoTank1Consumed?.toFixed(1) ?? "—"}</td>
                        <td className="py-2 pr-2 text-right">
                          {s.generatorLogId != null ? (
                            <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700 dark:text-emerald-400" data-testid={`badge-shift-dg-${s.id}`}>
                              #{s.generatorLogId}
                            </Badge>
                          ) : s.dgMode === "none" ? "—" : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-2">{s.hotOilTempEnd ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                Boiler Meter opening/closing above is auto-filled from these sessions. Bitumen tank temperatures and DG runs recorded inside a session are the source of truth for the Daily Plant Report.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Manpower ({manpower.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={openAddManpower} data-testid="button-add-manpower"><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {manpower.length === 0 && <p className="text-sm text-muted-foreground">No manpower added. Tap "Add" to record a worker for this shift.</p>}
          {manpower.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Contractor</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Gender</th>
                    <th className="py-2 pr-2">Rate-Card Key</th>
                    <th className="py-2 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {manpower.map((m, i) => (
                    <tr key={i} className="border-b last:border-b-0" data-testid={`row-manpower-${i}`}>
                      <td className="py-2 pr-2 font-medium">{m.name}{m.role ? <span className="text-xs text-muted-foreground"> ({m.role})</span> : null}</td>
                      <td className="py-2 pr-2">{m.contractorName || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2">{m.category || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2">{m.gender || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                      <td className="py-2 pr-2"><Badge variant="outline" className="font-mono text-xs">{rateCardKeyForRow(m) || "—"}</Badge></td>
                      <td className="py-2 pr-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditManpower(i)} data-testid={`button-edit-manpower-${i}`}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => removeManpower(i)} data-testid={`button-remove-manpower-${i}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Idle Events ({idleEvents.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={openAddIdle} data-testid="button-add-idle"><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {idleEvents.length === 0 && <p className="text-sm text-muted-foreground">No idle events.</p>}
          {idleEvents.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Start</th>
                    <th className="py-2 pr-2">End</th>
                    <th className="py-2 pr-2">Duration</th>
                    <th className="py-2 pr-2">Reason</th>
                    <th className="py-2 pr-2">Remarks</th>
                    <th className="py-2 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {idleEvents.map((ev, i) => {
                    const mins = idleMinutes(ev);
                    return (
                      <tr key={i} className="border-b last:border-b-0" data-testid={`row-idle-${i}`}>
                        <td className="py-2 pr-2">{ev.startTime}</td>
                        <td className="py-2 pr-2">{ev.endTime || <span className="text-muted-foreground italic">ongoing</span>}</td>
                        <td className="py-2 pr-2">{mins != null ? `${mins} min` : "—"}</td>
                        <td className="py-2 pr-2"><Badge variant="outline" className="text-xs">{ev.reason}</Badge></td>
                        <td className="py-2 pr-2 text-muted-foreground">{ev.remarks || "—"}</td>
                        <td className="py-2 pr-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEditIdle(i)} data-testid={`button-edit-idle-${i}`}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => removeIdle(i)} data-testid={`button-remove-idle-${i}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manpower modal */}
      <Dialog open={mpDialogOpen} onOpenChange={setMpDialogOpen}>
        <DialogContent data-testid="dialog-manpower">
          <DialogHeader><DialogTitle>{mpEditingIdx === null ? "Add Manpower" : "Edit Manpower"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name *</Label><Input value={mpDraft.name} onChange={e => setMpDraft({ ...mpDraft, name: e.target.value })} data-testid="input-mp-name" /></div>
            <div><Label>Role / Trade</Label><Input value={mpDraft.role || ""} onChange={e => setMpDraft({ ...mpDraft, role: e.target.value })} placeholder="e.g. Plant Operator" data-testid="input-mp-role" /></div>
            <div><Label>Contractor *</Label><Input value={mpDraft.contractorName || ""} onChange={e => setMpDraft({ ...mpDraft, contractorName: e.target.value })} placeholder="e.g. RAMU LABOUR CONTRACTOR" data-testid="input-mp-contractor" /></div>
            <div>
              <Label>Category *</Label>
              <Select value={mpDraft.category || ""} onValueChange={v => setMpDraft({ ...mpDraft, category: v })}>
                <SelectTrigger data-testid="select-mp-category"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {LABOUR_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gender *</Label>
              <Select value={mpDraft.gender || ""} onValueChange={v => setMpDraft({ ...mpDraft, gender: v })}>
                <SelectTrigger data-testid="select-mp-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {LABOUR_GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">
                Vendor Bills (Labour) will pull this row using rate-card key:{" "}
                <Badge variant="outline" className="font-mono text-xs ml-1" data-testid="text-mp-rate-card-key">{rateCardKeyForRow(mpDraft) || "—"}</Badge>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMpDialogOpen(false)} data-testid="button-mp-cancel">Cancel</Button>
            <Button onClick={saveManpowerDraft} data-testid="button-mp-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Idle modal */}
      <Dialog open={idleDialogOpen} onOpenChange={setIdleDialogOpen}>
        <DialogContent data-testid="dialog-idle">
          <DialogHeader><DialogTitle>{idleEditingIdx === null ? "Add Idle Event" : "Edit Idle Event"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start *</Label><Input type="time" value={idleDraft.startTime} onChange={e => setIdleDraft({ ...idleDraft, startTime: e.target.value })} data-testid="input-idle-start" /></div>
            <div><Label>End</Label><Input type="time" value={idleDraft.endTime || ""} onChange={e => setIdleDraft({ ...idleDraft, endTime: e.target.value })} placeholder="(blank if ongoing)" data-testid="input-idle-end" /></div>
            <div className="col-span-2">
              <Label>Reason *</Label>
              <Select value={idleDraft.reason} onValueChange={v => setIdleDraft({ ...idleDraft, reason: v })}>
                <SelectTrigger data-testid="select-idle-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFT_IDLE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Remarks</Label><Textarea rows={2} value={idleDraft.remarks || ""} onChange={e => setIdleDraft({ ...idleDraft, remarks: e.target.value })} data-testid="input-idle-remarks" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIdleDialogOpen(false)} data-testid="button-idle-cancel">Cancel</Button>
            <Button onClick={saveIdleDraft} data-testid="button-idle-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle>Remarks (End-of-Day)</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Plant conditions, breakdowns, anything notable..." data-testid="input-remarks" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 justify-end">
        {savedId && (
          <Button variant="outline" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid="button-delete">
            <Trash2 className="w-4 h-4 mr-1" />Delete
          </Button>
        )}
        <Button variant="ghost" onClick={goBackToList} data-testid="button-cancel">Cancel</Button>
        <Button onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending} data-testid="button-save">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save & Close
        </Button>
      </div>
    </div>
  );
}
