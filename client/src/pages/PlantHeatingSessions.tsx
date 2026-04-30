import { useState, useEffect, useMemo, useRef } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ChevronLeft, Plus, Save, Loader2, Trash2, Flame, FolderOpen } from "lucide-react";
import { format, subDays } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HEATING_SESSION_TYPE_LABELS, heatingSessionTypeLabel } from "@shared/schema";
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
    dryerFedFrom: null as "TANK_1" | "TANK_2" | null,
    remarks: "",
    isFinalized: 0,
    autoFilledOpening: false,
    autoFilledSource: "" as string,
    autoFilledDgOpening: false,
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
  const { appendPlantContext, getPlantBackLink } = useOrigin();
  const [, params] = useRoute("/plant/heating-sessions/:date");
  const backLink = getPlantBackLink({ defaultTab: "operations" });

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultFrom = format(subDays(new Date(), 30), "yyyy-MM-dd");
  // If a /:date is in the URL we still anchor the range there but show 30 days back to today.
  const dateParam = params?.date;
  const [filterDateFrom, setFilterDateFrom] = useState(dateParam || defaultFrom);
  const [filterDateTo, setFilterDateTo] = useState(dateParam || today);
  const [filterDryerSource, setFilterDryerSource] = useState<"all" | "TANK_1" | "TANK_2">("all");

  // Task #238 — when navigated from the heating-mismatch drill-in we accept
  // `?openSession=<id>` and auto-open the edit dialog for that session once
  // the row has loaded, so the operator lands directly on the offending row.
  const openSessionIdFromUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get("openSession");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, []);
  const autoOpenedRef = useRef(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(today));
  // When true, the dialog will scroll and focus the "Dryer fed from" select
  // after it opens (set when the user clicks a per-session dryer mismatch badge).
  const [focusDryerOnOpen, setFocusDryerOnOpen] = useState(false);

  const { data: sessions, isLoading } = useQuery<BitumenHeatingSession[]>({
    queryKey: ["/api/plant-module/heating-sessions", filterDateFrom, filterDateTo],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (filterDateFrom) qs.set("dateFrom", filterDateFrom);
      if (filterDateTo) qs.set("dateTo", filterDateTo);
      const res = await fetch(`/api/plant-module/heating-sessions?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Task #219 — Per-(date, plant) Boiler Meter reconciliation across heating
  // sessions, the shift log meter and the LDO Flow Meter ledger. We surface a
  // warning beside each affected day so operators know which day / plant
  // needs correction before the divergence ages into trend reports.
  type BoilerMeterReconRow = {
    date: string;
    plantName: string;
    sessionsLdoT1L: number | null;
    shiftLogT1L: number | null;
    ledgerSessionsT1L: number | null;
    ledgerShiftT1L: number | null;
    reconciliation: {
      thresholdL: number;
      sessionsVsShiftL: number | null;
      sessionsVsLedgerL: number | null;
      shiftVsLedgerL: number | null;
      anyMismatch: boolean;
      mismatches: Array<{ kind: "sessions_vs_shift" | "sessions_vs_ledger" | "shift_vs_ledger"; deltaL: number }>;
    };
  };
  const { data: reconciliationRows } = useQuery<BoilerMeterReconRow[]>({
    queryKey: ["/api/plant-module/heating-sessions/reconciliation", filterDateFrom, filterDateTo],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("dateFrom", filterDateFrom);
      qs.set("dateTo", filterDateTo);
      const res = await fetch(`/api/plant-module/heating-sessions/reconciliation?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!filterDateFrom && !!filterDateTo,
  });
  const reconByDate = useMemo(() => {
    const map = new Map<string, BoilerMeterReconRow[]>();
    for (const r of reconciliationRows || []) {
      if (!r.reconciliation.anyMismatch) continue;
      const arr = map.get(r.date) || [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return map;
  }, [reconciliationRows]);

  // Task #300 — Dryer-source mismatch audit: cross-reference shift logs and
  // heating sessions so mismatches are flagged inline on session rows.
  type DryerMismatchRow = {
    date: string;
    plantName: string;
    shiftLogId: number | null;
    shiftLogValue: "TANK_1" | "TANK_2" | null;
    conflictingSessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    intraSessionConflicts: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    hasIntraSessionConflict: boolean;
    hasMismatch: boolean;
  };
  const { data: dryerMismatchRows } = useQuery<DryerMismatchRow[]>({
    queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches", filterDateFrom, filterDateTo],
    enabled: !!filterDateFrom && !!filterDateTo,
    queryFn: async () => {
      const qs = new URLSearchParams({ dateFrom: filterDateFrom, dateTo: filterDateTo });
      const res = await fetch(`/api/plant-module/heating-sessions/dryer-source-mismatches?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  // Set of session IDs that disagree with their date's shift log.
  const shiftLogConflictIds = useMemo(() => {
    const set = new Set<number>();
    for (const r of dryerMismatchRows || []) {
      if (!r.hasMismatch) continue;
      for (const s of r.conflictingSessions) set.add(s.id);
    }
    return set;
  }, [dryerMismatchRows]);
  // Set of session IDs that are in intra-session conflict (sessions on the
  // same date disagree with each other). A session may appear in both sets.
  const intraSessionConflictIds = useMemo(() => {
    const set = new Set<number>();
    for (const r of dryerMismatchRows || []) {
      if (!r.hasMismatch) continue;
      for (const s of (r.intraSessionConflicts || [])) set.add(s.id);
    }
    return set;
  }, [dryerMismatchRows]);
  // Combined set for backward-compat (any kind of dryer-source conflict).
  const conflictingSessionIds = useMemo(() => {
    const set = new Set<number>([...shiftLogConflictIds, ...intraSessionConflictIds]);
    return set;
  }, [shiftLogConflictIds, intraSessionConflictIds]);
  // Per-date list of mismatching rows (one entry per plant) for header badges.
  const dryerMismatchByDate = useMemo(() => {
    const map = new Map<string, DryerMismatchRow[]>();
    for (const r of dryerMismatchRows || []) {
      if (!r.hasMismatch) continue;
      const arr = map.get(r.date) || [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return map;
  }, [dryerMismatchRows]);
  // Per-(date||plantName) lookup for individual session tooltip details.
  const dryerMismatchByKey = useMemo(() => {
    const map = new Map<string, DryerMismatchRow>();
    for (const r of dryerMismatchRows || []) {
      if (r.hasMismatch) map.set(`${r.date}||${r.plantName}`, r);
    }
    return map;
  }, [dryerMismatchRows]);

  // Generator master entries (id + name) — sourced from Equipment Master so the
  // names line up with Equipment Usage / reports.
  const { data: generatorMasters } = useQuery<{ id: number | null; name: string }[]>({
    queryKey: ["/api/plant-module/generators"],
  });

  // Unified DG-candidate feed: merges generator_logs with Equipment Usage
  // DG entries for the same date/plant so the "Link Existing DG" dropdown
  // shows runs the operator already captured via either flow.
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
    enabled: dialogOpen && !!form.date && !!form.plantName,
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/generator-candidates?date=${encodeURIComponent(form.date)}&plant=${encodeURIComponent(form.plantName)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch DG candidates");
      return res.json();
    },
  });

  // For the dropdown: show every equipment_usage candidate (they aren't
  // tied to sessions yet), plus generator_logs that aren't already linked
  // to a *different* heating session. Inline logs from earlier sessions
  // on the same date are still selectable so the operator can re-attach
  // a stray DG run.
  const generatorOptionsForDate = useMemo(
    () => (dgCandidates || []).filter(g =>
      g.source === "equipment_usage" ||
      g.sourceHeatingSessionId == null ||
      g.sourceHeatingSessionId === form.id
    ),
    [dgCandidates, form.id]
  );
  const optionKey = (c: DgCandidate) =>
    c.source === "generator_log" ? `gl-${c.id}` : `eu-${c.equipmentUsageId}`;

  // Resolve the equipment id behind the chosen DG name so we can query its
  // last diesel-tank balance — same data the Equipment Usage form uses.
  const selectedGeneratorEquipmentId = useMemo(() => {
    if (form.dgMode !== "inline") return null;
    const match = (generatorMasters || []).find(g => g.name === form.dgGeneratorName);
    return match?.id ?? null;
  }, [generatorMasters, form.dgGeneratorName, form.dgMode]);

  const { data: dgPrevBalance } = useQuery<{ previousBalance: number; previousClosingReading: number }>({
    queryKey: ["/api/plant-module/equipment-usage/previous-balance", selectedGeneratorEquipmentId],
    enabled: selectedGeneratorEquipmentId != null,
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/equipment-usage/previous-balance/${selectedGeneratorEquipmentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch DG tank balance");
      return res.json();
    },
  });

  // Auto-fill DG "HSD Opening (L)" from the previous tank balance whenever the
  // operator picks a generator on a NEW session and the field is still blank
  // (or still holds an unedited auto-filled value). Editing an existing
  // session never overwrites the saved opening.
  const autoFilledDgOpeningRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dialogOpen || form.id) return;
    if (form.dgMode !== "inline") return;
    // If the operator switches to an unmapped generator (no equipment id) or
    // away from inline mode, clear any stale auto-filled opening so the form
    // doesn't carry a balance that belongs to a different DG. Manual edits
    // are preserved.
    if (selectedGeneratorEquipmentId == null) {
      setForm(prev => {
        if (!prev.autoFilledDgOpening) return prev;
        autoFilledDgOpeningRef.current = null;
        return { ...prev, dgOpeningDiesel: "", autoFilledDgOpening: false };
      });
      return;
    }
    if (!dgPrevBalance || typeof dgPrevBalance.previousBalance !== "number") return;
    const next = dgPrevBalance.previousBalance.toFixed(2);
    setForm(prev => {
      if (prev.dgOpeningDiesel && prev.dgOpeningDiesel !== autoFilledDgOpeningRef.current) {
        return prev;
      }
      if (prev.dgOpeningDiesel === next && prev.autoFilledDgOpening) return prev;
      autoFilledDgOpeningRef.current = next;
      return { ...prev, dgOpeningDiesel: next, autoFilledDgOpening: true };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.dgMode, selectedGeneratorEquipmentId, dgPrevBalance?.previousBalance]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  // Tracks the last dryer-source value auto-filled from the shift log so we
  // don't overwrite a manual operator selection on date/plant change.
  const autoFilledDryerRef = useRef<"TANK_1" | "TANK_2" | null>(null);

  // Auto-populate dryerFedFrom from the matching shift log when the dialog
  // opens for a NEW session. Re-runs when date or plantName change so the
  // displayed value tracks the operator's selection in real-time.
  useEffect(() => {
    if (!dialogOpen || form.id) return;
    const ctrl = new AbortController();
    fetch(
      `/api/plant-module/shift-logs/by-date/${encodeURIComponent(form.date)}?plant=${encodeURIComponent(form.plantName)}`,
      { credentials: "include", signal: ctrl.signal }
    )
      .then(r => r.ok ? r.json() : null)
      .then((log: any) => {
        if (ctrl.signal.aborted) return;
        // Use shift-log value when valid, otherwise fall back to TANK_2
        // so new sessions always have an explicit tank value.
        const src: "TANK_1" | "TANK_2" =
          (log?.dryerFedFrom === "TANK_1" || log?.dryerFedFrom === "TANK_2")
            ? log.dryerFedFrom
            : "TANK_2";
        setForm(prev => {
          // Don't overwrite a manual operator pick.
          if (prev.dryerFedFrom !== null && prev.dryerFedFrom !== autoFilledDryerRef.current) return prev;
          autoFilledDryerRef.current = src;
          return { ...prev, dryerFedFrom: src };
        });
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.date, form.plantName]);

  // Auto-fill Tank-1 opening meter when opening a NEW form. Re-runs when
  // startTime changes so the cutoff matches the actual heating start.
  const autoFilledOpeningRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);
  useEffect(() => {
    if (!dialogOpen || form.id) return;
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
  }, [dialogOpen, form.id, form.date, form.startTime, form.plantName]);

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
  // Prefer hour-meter reading if both provided; fall back to clock time.
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
      dryerFedFrom: form.dryerFedFrom ?? "TANK_2",
      remarks: form.remarks || null,
      editedBy: "operator",
    };
    if (form.id) payload.id = form.id;
    return payload;
  };

  // Save = save + finalize + close dialog (returns to list).
  const saveMutation = useMutation({
    mutationFn: async () => {
      // If the operator picked an Equipment Usage DG row in "link" mode,
      // materialize it into generator_logs first so the heating-session
      // FK (generator_log_id) has a real row to reference.
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
        const msg = body?.message
          || (body?.error === "forbidden" ? "You don't have permission to edit heating sessions." : null)
          || res.statusText;
        throw new Error(msg);
      }
      const saved: BitumenHeatingSession = await res.json();
      // Auto-finalize so the operator doesn't need a second click.
      if (!saved.isFinalized) {
        try {
          await apiRequest("POST", `/api/plant-module/heating-sessions/${saved.id}/finalize`, { finalizedBy: "operator" });
        } catch {
          // Don't block the close — save already succeeded.
        }
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/generator-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/daily-reports"] });
      toast({ title: "Heating session saved" });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [newGenDialogOpen, setNewGenDialogOpen] = useState(false);
  const [newGenNameInput, setNewGenNameInput] = useState("");

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
      setDialogOpen(false);
    },
    onError: (err: any) => {
      if (err?.message === "Cancelled") return;
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  // Task #332 — Bulk-align dryerFedFrom on conflicting sessions in one click.
  const alignMutation = useMutation({
    mutationFn: async ({ sessionIds, targetValue }: { sessionIds: number[]; targetValue: "TANK_1" | "TANK_2" }) => {
      const res = await apiRequest("PATCH", "/api/plant-module/heating-sessions/align-dryer-source", { sessionIds, targetValue });
      return res.json() as Promise<{ updatedCount: number }>;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      const label = variables.targetValue === "TANK_1" ? "Boiler tank" : "Dryer tank";
      toast({ title: `${data.updatedCount} session${data.updatedCount !== 1 ? "s" : ""} aligned to ${label}` });
    },
    onError: (err: any) => {
      toast({ title: "Align failed", description: err.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setForm(emptyForm(today));
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
      dryerFedFrom: (s.dryerFedFrom as "TANK_1" | "TANK_2" | null) || null,
      remarks: s.remarks || "",
      isFinalized: s.isFinalized,
      autoFilledOpening: false,
      autoFilledSource: "",
      autoFilledDgOpening: false,
    });
    setDialogOpen(true);
  };

  // Focus the "Dryer fed from" select when the dialog opens from a mismatch badge click.
  useEffect(() => {
    if (!dialogOpen || !focusDryerOnOpen) return;
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="select-dryer-fed-from"]');
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
      setFocusDryerOnOpen(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [dialogOpen, focusDryerOnOpen]);

  // Group sessions by date for the list.
  const grouped = useMemo(() => {
    const list = (sessions || [])
      .filter(s => filterDryerSource === "all" || s.dryerFedFrom === filterDryerSource)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || (a.startTime || "").localeCompare(b.startTime || ""));
    const out: Record<string, BitumenHeatingSession[]> = {};
    for (const s of list) {
      (out[s.date] = out[s.date] || []).push(s);
    }
    return out;
  }, [sessions, filterDryerSource]);
  const groupedDates = Object.keys(grouped);

  // Task #238 — auto-open the requested session once it loads. Guarded by a
  // ref so it fires exactly once even if the sessions query refetches.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (openSessionIdFromUrl == null) return;
    if (!sessions) return;
    const target = sessions.find(s => s.id === openSessionIdFromUrl);
    if (!target) return;
    autoOpenedRef.current = true;
    openEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, openSessionIdFromUrl]);

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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">From</Label>
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-40" data-testid="input-filter-date-from" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">To</Label>
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-40" data-testid="input-filter-date-to" />
          </div>
          <Select value={filterDryerSource} onValueChange={v => setFilterDryerSource(v as "all" | "TANK_1" | "TANK_2")}>
            <SelectTrigger className="w-36 h-9 text-xs" data-testid="select-dryer-filter">
              <SelectValue placeholder="Dryer fed from" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tanks</SelectItem>
              <SelectItem value="TANK_1">Boiler tank</SelectItem>
              <SelectItem value="TANK_2">Dryer tank</SelectItem>
            </SelectContent>
          </Select>
          <Link href={appendPlantContext("/plant/heating-trends", { defaultTab: "operations" })}>
            <Button variant="outline" data-testid="button-view-trends">View Trends</Button>
          </Link>
          <Button onClick={openNew} data-testid="button-new-session"><Plus className="w-4 h-4 mr-1" />New Session</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Sessions {filterDateFrom} → {filterDateTo}</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const groupedDateSet = new Set(groupedDates);
            const reconOnlyDates = Array.from(reconByDate.keys())
              .filter(d => !groupedDateSet.has(d))
              .sort()
              .reverse();
            return reconOnlyDates.length > 0 ? (
              <div className="mb-4 space-y-3" data-testid="section-recon-only-dates">
                {reconOnlyDates.map(date => (
                  <div key={`recon-only-${date}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{date}</div>
                      <span className="text-[10px] text-muted-foreground">(no sessions logged)</span>
                      {(reconByDate.get(date) || []).map(rec => (
                        <Link
                          key={rec.plantName}
                          href={appendPlantContext(`/plant/ldo-mismatch/${date}?plant=${encodeURIComponent(rec.plantName)}`, { defaultTab: "operations" })}
                        >
                          <Badge
                            variant="destructive"
                            className="text-[10px] cursor-pointer"
                            data-testid={`badge-recon-mismatch-${date}-${rec.plantName.replace(/\s+/g, "_")}`}
                          >
                            ⚠ {rec.plantName} Boiler Meter mismatch ({rec.reconciliation.mismatches.length}) →
                          </Badge>
                        </Link>
                      ))}
                    </div>
                    {(reconByDate.get(date) || []).map(rec => (
                      <div
                        key={`detail-${date}-${rec.plantName}`}
                        className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs space-y-0.5 mb-2"
                        data-testid={`panel-recon-${date}-${rec.plantName.replace(/\s+/g, "_")}`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-semibold text-destructive">
                            {rec.plantName} — The boiler fuel meter totals don't agree (difference exceeds {rec.reconciliation.thresholdL} L)
                          </div>
                          <Link href={appendPlantContext(`/plant/ldo-mismatch/${date}?plant=${encodeURIComponent(rec.plantName)}`, { defaultTab: "operations" })}>
                            <Button variant="destructive" size="sm" className="h-6 text-[10px] px-2" data-testid={`button-review-ldo-mismatch-${date}-${rec.plantName.replace(/\s+/g, "_")}`}>
                              Review →
                            </Button>
                          </Link>
                        </div>
                        <p className="text-muted-foreground italic mb-1">
                          This usually happens when a heating session was deleted or edited after the shift log was saved, or when a meter reading was entered incorrectly. Open the reconciliation report to see the detail and correct whichever record is wrong.
                        </p>
                        <ul className="list-disc list-inside">
                          {rec.reconciliation.mismatches.map(m => {
                            const sign = m.deltaL > 0 ? "+" : "";
                            const fmt = (n: number | null) => n == null ? "—" : n.toFixed(1);
                            const label =
                              m.kind === "sessions_vs_shift"
                                ? `Session meter total (${fmt(rec.sessionsLdoT1L)} L) doesn't match shift log meter (${fmt(rec.shiftLogT1L)} L)`
                                : m.kind === "sessions_vs_ledger"
                                ? `Session meter total (${fmt(rec.sessionsLdoT1L)} L) doesn't match LDO flow ledger (${fmt(rec.ledgerSessionsT1L)} L)`
                                : `Shift log meter (${fmt(rec.shiftLogT1L)} L) doesn't match LDO flow ledger (${fmt(rec.ledgerShiftT1L)} L)`;
                            return (
                              <li key={m.kind} data-testid={`text-recon-mismatch-${date}-${m.kind}`}>
                                {label} — difference: {sign}{m.deltaL} L
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null;
          })()}
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
            groupedDates.length === 0 ? <p className="text-sm text-muted-foreground">{filterDryerSource !== "all" ? `No heating sessions fed from ${filterDryerSource === "TANK_1" ? "Boiler tank" : "Dryer tank"} in this date range.` : "No heating sessions in this date range."}</p> :
            <div className="space-y-4">
              {groupedDates.map(date => (
                <div key={date}>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{date}</div>
                    {(reconByDate.get(date) || []).map(rec => (
                      <Link
                        key={rec.plantName}
                        href={appendPlantContext(`/plant/ldo-mismatch/${date}?plant=${encodeURIComponent(rec.plantName)}`, { defaultTab: "operations" })}
                      >
                        <Badge
                          variant="destructive"
                          className="text-[10px] cursor-pointer"
                          data-testid={`badge-recon-mismatch-${date}-${rec.plantName.replace(/\s+/g, "_")}`}
                          title={rec.reconciliation.mismatches.map(m => {
                            const sign = m.deltaL > 0 ? "+" : "";
                            const which =
                              m.kind === "sessions_vs_shift" ? "sessions vs shift meter"
                              : m.kind === "sessions_vs_ledger" ? "sessions vs LDO ledger"
                              : "shift meter vs LDO ledger";
                            return `${which}: Δ ${sign}${m.deltaL}L`;
                          }).join(" • ")}
                        >
                          ⚠ {rec.plantName} Boiler Meter mismatch ({rec.reconciliation.mismatches.length}) →
                        </Badge>
                      </Link>
                    ))}
                    {(() => {
                      const dms = dryerMismatchByDate.get(date);
                      if (!dms || dms.length === 0) return null;
                      return (
                        <div className="space-y-2" data-testid={`panel-dryer-conflict-${date}`}>
                          {dms.map(dm => {
                            const shiftLogConflictSessions = dm.conflictingSessions;
                            const intraConflictSessions = dm.intraSessionConflicts || [];
                            const hasShiftLogConflict = shiftLogConflictSessions.length > 0 && dm.shiftLogValue != null;
                            const hasIntraConflict = intraConflictSessions.length > 0;

                            return (
                              <div
                                key={`dryer-dm-${dm.plantName}`}
                                className="rounded-md border border-orange-300 bg-orange-50/60 dark:border-orange-800 dark:bg-orange-950/20 px-3 py-2 text-xs space-y-1.5"
                              >
                                {/* Shift-log mismatch: show guided one-click fix */}
                                {hasShiftLogConflict && (() => {
                                  const slValue = dm.shiftLogValue!;
                                  const slLabel = slValue === "TANK_1" ? "Boiler tank" : "Dryer tank";
                                  const oppLabel = slValue === "TANK_1" ? "Dryer tank" : "Boiler tank";
                                  const n = shiftLogConflictSessions.length;
                                  const fixSessionIds = shiftLogConflictSessions.map(s => s.id);
                                  const fixLogHref = appendPlantContext(
                                    `/plant/shift-log/${date}?plant=${encodeURIComponent(dm.plantName)}&focus=dryerFedFrom`,
                                    { defaultTab: "operations" }
                                  );
                                  return (
                                    <>
                                      <p className="text-orange-800 dark:text-orange-300 leading-snug">
                                        ⚠ <strong>{dm.plantName}</strong> shift log says <strong>{slLabel}</strong>, but {n} heating session{n !== 1 ? "s" : ""} {n !== 1 ? "say" : "says"} <strong>{oppLabel}</strong>.
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs border-orange-500 text-orange-800 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900"
                                          disabled={alignMutation.isPending}
                                          onClick={() => alignMutation.mutate({ sessionIds: fixSessionIds, targetValue: slValue })}
                                          data-testid={`button-fix-sessions-${date}-${dm.plantName.replace(/\s+/g, "-")}`}
                                        >
                                          {alignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                          Fix {n} session{n !== 1 ? "s" : ""} → match shift log ({slLabel})
                                        </Button>
                                        <Link href={fixLogHref}>
                                          <span className="text-orange-700 dark:text-orange-400 underline underline-offset-2 cursor-pointer hover:opacity-80 text-[11px]" data-testid={`link-fix-shiftlog-${date}-${dm.plantName.replace(/\s+/g, "-")}`}>
                                            Fix the shift log instead →
                                          </span>
                                        </Link>
                                      </div>
                                    </>
                                  );
                                })()}
                                {/* Intra-session conflict: no authoritative source, show two options */}
                                {hasIntraConflict && !hasShiftLogConflict && (() => {
                                  const n = intraConflictSessions.length;
                                  const allIds = intraConflictSessions.map(s => s.id);
                                  return (
                                    <>
                                      <p className="text-orange-800 dark:text-orange-300 leading-snug">
                                        ⚠ <strong>{dm.plantName}</strong> — {n} heating session{n !== 1 ? "s" : ""} disagree with each other on dryer source. Choose which is correct:
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        <Button size="sm" variant="outline" className="h-7 text-xs border-orange-500 text-orange-800 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900" disabled={alignMutation.isPending} onClick={() => alignMutation.mutate({ sessionIds: allIds, targetValue: "TANK_1" })} data-testid={`button-align-tank1-${date}-${dm.plantName.replace(/\s+/g, "-")}`}>
                                          {alignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                          Set all → Boiler tank
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-7 text-xs border-orange-500 text-orange-800 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900" disabled={alignMutation.isPending} onClick={() => alignMutation.mutate({ sessionIds: allIds, targetValue: "TANK_2" })} data-testid={`button-align-tank2-${date}-${dm.plantName.replace(/\s+/g, "-")}`}>
                                          {alignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                          Set all → Dryer tank
                                        </Button>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  {(reconByDate.get(date) || []).map(rec => (
                    <div
                      key={`detail-${rec.plantName}`}
                      className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs space-y-0.5 mb-2"
                      data-testid={`panel-recon-${date}-${rec.plantName.replace(/\s+/g, "_")}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="font-semibold text-destructive">
                          {rec.plantName} — The boiler fuel meter totals don't agree (difference exceeds {rec.reconciliation.thresholdL} L)
                        </div>
                        <Link href={appendPlantContext(`/plant/ldo-mismatch/${date}?plant=${encodeURIComponent(rec.plantName)}`, { defaultTab: "operations" })}>
                          <Button variant="destructive" size="sm" className="h-6 text-[10px] px-2" data-testid={`button-review-ldo-mismatch-${date}-${rec.plantName.replace(/\s+/g, "_")}`}>
                            Review →
                          </Button>
                        </Link>
                      </div>
                      <p className="text-muted-foreground italic mb-1">
                        This usually happens when a heating session was deleted or edited after the shift log was saved, or when a meter reading was entered incorrectly. Open the reconciliation report to see the detail and correct whichever record is wrong.
                      </p>
                      <ul className="list-disc list-inside">
                        {rec.reconciliation.mismatches.map(m => {
                          const sign = m.deltaL > 0 ? "+" : "";
                          const fmt = (n: number | null) => n == null ? "—" : n.toFixed(1);
                          const label =
                            m.kind === "sessions_vs_shift"
                              ? `Session meter total (${fmt(rec.sessionsLdoT1L)} L) doesn't match shift log meter (${fmt(rec.shiftLogT1L)} L)`
                              : m.kind === "sessions_vs_ledger"
                              ? `Session meter total (${fmt(rec.sessionsLdoT1L)} L) doesn't match LDO flow ledger (${fmt(rec.ledgerSessionsT1L)} L)`
                              : `Shift log meter (${fmt(rec.shiftLogT1L)} L) doesn't match LDO flow ledger (${fmt(rec.ledgerShiftT1L)} L)`;
                          return (
                            <li key={m.kind} data-testid={`text-recon-mismatch-${date}-${m.kind}`}>
                              {label} — difference: {sign}{m.deltaL} L
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  <div className="space-y-2">
                    {grouped[date].map(s => {
                      const sessLdoLPerHr = (s.ldoTank1Consumed != null && s.durationHours && s.durationHours > 0)
                        ? s.ldoTank1Consumed / s.durationHours : null;
                      const sessDgHrs = (s.dgClosingHourMeter != null && s.dgOpeningHourMeter != null)
                        ? Math.max(0, s.dgClosingHourMeter - s.dgOpeningHourMeter)
                        : (s.dgHoursRun ?? null);
                      const sessDgLPerHr = (s.dgDieselConsumed != null && sessDgHrs && sessDgHrs > 0)
                        ? s.dgDieselConsumed / sessDgHrs : null;
                      return (
                        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate" data-testid={`row-session-${s.id}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={s.sessionType === "NIGHT_PREHEAT" ? "secondary" : "outline"}>
                                {heatingSessionTypeLabel(s.sessionType)}
                              </Badge>
                              <span className="font-medium">{s.startTime || "—"} → {s.endTime || "—"}</span>
                              <span className="text-sm text-muted-foreground">({s.durationHours ?? 0} h)</span>
                              <span className="text-xs text-muted-foreground">{s.plantName}</span>
                              {s.generatorLogId != null && (
                                <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700 dark:text-emerald-400" data-testid={`badge-dg-linked-${s.id}`}>
                                  DG #{s.generatorLogId}{s.dgGeneratorName ? ` · ${s.dgGeneratorName}` : ""}
                                </Badge>
                              )}
                              {s.generatorLogId == null && s.dgMode === "inline" && (
                                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400" data-testid={`badge-dg-pending-${s.id}`}>
                                  DG inline (unsaved)
                                </Badge>
                              )}
                              {(s.dryerFedFrom === "TANK_1" || s.dryerFedFrom === "TANK_2") && (
                                <Badge variant="outline" className="text-xs border-sky-400 text-sky-700 dark:text-sky-400" data-testid={`badge-dryer-fed-${s.id}`}>
                                  Dryer fed from: {s.dryerFedFrom === "TANK_1" ? "Boiler tank" : "Dryer tank"}
                                </Badge>
                              )}
                              {conflictingSessionIds.has(s.id) && (() => {
                                const hsLabel = s.dryerFedFrom === "TANK_1" ? "Boiler tank" : "Dryer tank";
                                const isShiftLogConflict = shiftLogConflictIds.has(s.id);
                                const isIntraConflict = intraSessionConflictIds.has(s.id);
                                const dm = dryerMismatchByKey.get(`${s.date}||${s.plantName}`);
                                let badgeLabel = "⚠ Dryer conflict";
                                let tooltipText = "";
                                if (isShiftLogConflict) {
                                  const slLabel = dm?.shiftLogValue === "TANK_1" ? "Boiler tank" : "Dryer tank";
                                  badgeLabel = "⚠ Dryer mismatch — fix this session";
                                  tooltipText = `This session says dryer fed from ${hsLabel}, but the ${s.plantName} shift log for ${s.date} says ${slLabel}. Click to edit this session and correct it.`;
                                  if (isIntraConflict) tooltipText += " Also conflicts with other sessions on this date.";
                                } else if (isIntraConflict) {
                                  badgeLabel = "⚠ Dryer ≠ other session — fix this session";
                                  tooltipText = `Heating sessions on ${s.date} at ${s.plantName} disagree on dryer source — this session says ${hsLabel}. Click to open and correct it.`;
                                }
                                return (
                                  <span className="inline-flex items-center gap-1.5" key={`dryer-conflict-wrap-${s.id}`}>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] border-orange-400 text-orange-700 dark:text-orange-400 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-950"
                                      title={tooltipText}
                                      onClick={() => { openEdit(s); setFocusDryerOnOpen(true); }}
                                      data-testid={`badge-dryer-mismatch-session-${s.id}`}
                                    >
                                      {badgeLabel}
                                    </Badge>
                                    {isShiftLogConflict && (
                                      <Link
                                        href={appendPlantContext(`/plant/shift-log/${s.date}?plant=${encodeURIComponent(s.plantName)}&focus=dryerFedFrom`, { defaultTab: "operations" })}
                                        data-testid={`link-fix-shiftlog-session-${s.id}`}
                                      >
                                        <span className="text-orange-600 dark:text-orange-400 underline underline-offset-2 cursor-pointer hover:opacity-80 text-[10px]">Fix shift log →</span>
                                      </Link>
                                    )}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1 text-muted-foreground">
                              <span>Staff: {s.staffName || "—"}</span>
                              <span>LDO: {s.ldoTank1Consumed?.toFixed(1) ?? "—"} L
                                {sessLdoLPerHr != null && <span className="ml-1">({sessLdoLPerHr.toFixed(2)} L/Hr)</span>}
                              </span>
                              <span>DG Hrs: {sessDgHrs != null ? sessDgHrs.toFixed(2) : "—"}</span>
                              <span>HSD: {s.dgDieselConsumed?.toFixed(1) ?? "—"} L
                                {sessDgLPerHr != null && <span className="ml-1">({sessDgLPerHr.toFixed(2)} L/Hr)</span>}
                              </span>
                              <span>Hot-oil end: {s.hotOilTempEnd ?? "—"} °C</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(s)} data-testid={`button-open-${s.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              <div>
                <Label>Dryer fed from</Label>
                <Select
                  value={form.dryerFedFrom ?? "NONE"}
                  onValueChange={v => {
                    autoFilledDryerRef.current = null;
                    setField("dryerFedFrom", v === "NONE" ? null : v as "TANK_1" | "TANK_2");
                  }}
                >
                  <SelectTrigger data-testid="select-dryer-fed-from">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TANK_1">Boiler tank</SelectItem>
                    <SelectItem value="TANK_2">Dryer tank</SelectItem>
                  </SelectContent>
                </Select>
                {!form.id && form.dryerFedFrom && form.dryerFedFrom === autoFilledDryerRef.current && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-dryer-autofill-hint">
                    From shift log — change if different
                  </p>
                )}
              </div>
            </div>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">Hot-Oil & Bitumen Temperatures</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label>Hot-Oil Supply °C</Label><Input type="number" step="0.1" value={form.hotOilSupplyTemp} onChange={e => setField("hotOilSupplyTemp", e.target.value)} data-testid="input-hot-oil-supply" /></div>
                  <div><Label>Hot-Oil Return °C</Label><Input type="number" step="0.1" value={form.hotOilReturnTemp} onChange={e => setField("hotOilReturnTemp", e.target.value)} data-testid="input-hot-oil-return" /></div>
                </div>
                <div className="grid grid-cols-[80px_1fr_1fr] md:grid-cols-[120px_1fr_1fr] gap-3 items-end">
                  <div className="text-sm font-medium text-muted-foreground pb-2">Tank</div>
                  <div className="text-sm font-medium text-muted-foreground pb-2">Start °C</div>
                  <div className="text-sm font-medium text-muted-foreground pb-2">End °C</div>

                  <Label className="pb-2">Bitumen tank 1 (boiler)</Label>
                  <Input type="number" step="0.1" value={form.bitumenTank1TempStart} onChange={e => setField("bitumenTank1TempStart", e.target.value)} data-testid="input-bit-t1-start" />
                  <Input type="number" step="0.1" value={form.bitumenTank1TempEnd} onChange={e => setField("bitumenTank1TempEnd", e.target.value)} data-testid="input-bit-t1-end" />

                  <Label className="pb-2">Bitumen tank 2 (dryer)</Label>
                  <Input type="number" step="0.1" value={form.bitumenTank2TempStart} onChange={e => setField("bitumenTank2TempStart", e.target.value)} data-testid="input-bit-t2-start" />
                  <Input type="number" step="0.1" value={form.bitumenTank2TempEnd} onChange={e => setField("bitumenTank2TempEnd", e.target.value)} data-testid="input-bit-t2-end" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">LDO Boiler Meter</CardTitle></CardHeader>
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
                              setNewGenNameInput("");
                              setNewGenDialogOpen(true);
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
                      <div>
                        <Label>HSD Opening (L)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={form.dgOpeningDiesel}
                          onChange={e => setForm(p => ({ ...p, dgOpeningDiesel: e.target.value, autoFilledDgOpening: false }))}
                          data-testid="input-dg-open"
                        />
                        {form.autoFilledDgOpening && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-autofill-dg-open-hint">
                            Auto-filled from previous tank balance — edit to override
                          </p>
                        )}
                      </div>
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
                        form.linkSelection ||
                        (form.generatorLogId ? `gl-${form.generatorLogId}` : "")
                      }
                      onValueChange={v => setForm(p => ({
                        ...p,
                        linkSelection: v,
                        // generator_log picks take effect immediately;
                        // equipment_usage picks are materialized on save.
                        generatorLogId: v.startsWith("gl-") ? parseInt(v.slice(3)) : null,
                      }))}
                    >
                      <SelectTrigger data-testid="select-link-dg"><SelectValue placeholder="Pick a DG run" /></SelectTrigger>
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
              <Button variant="ghost" onClick={() => setDialogOpen(false)} data-testid="button-cancel">Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Save & Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={newGenDialogOpen} onOpenChange={setNewGenDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New Generator</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="phs-new-gen-name">Generator Name</Label>
            <Input
              id="phs-new-gen-name"
              placeholder="e.g. 125 KVA GENERATOR"
              value={newGenNameInput}
              onChange={e => setNewGenNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const name = newGenNameInput.trim();
                  if (name) { setField("dgGeneratorName", name); setNewGenDialogOpen(false); }
                }
              }}
              data-testid="input-new-gen-name"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setNewGenDialogOpen(false)} data-testid="button-new-gen-cancel">Cancel</Button>
            <Button
              size="sm"
              disabled={!newGenNameInput.trim()}
              onClick={() => {
                const name = newGenNameInput.trim();
                if (name) { setField("dgGeneratorName", name); setNewGenDialogOpen(false); }
              }}
              data-testid="button-new-gen-confirm"
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
