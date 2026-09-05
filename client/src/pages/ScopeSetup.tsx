// ─────────────────────────────────────────────────────────────────────────────
// Instruction 032 — Project Scope & Working Reaches setup page
// Corridor (reference chainage) card, scope segments (working reaches,
// no-scope, temporary blocks, withdrawals), reconciliation summary with a
// visual chainage strip, and confirm flow. Route: /work-program/:id/scope
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, MapPin, Plus, Trash2, CheckCircle2, AlertTriangle,
  Loader2, Ban, Clock, FileX2, Route as RouteIcon, Pencil, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { BoqProject, ProjectScopeSegment } from "@shared/schema";
import { SCOPE_SEGMENT_TYPE_LABELS, type ScopeSegmentType } from "@shared/projectScope";
import { emptyScopeForm, scopeFormFromSegment, type SegFormState } from "@/lib/scopeForm";
import { boqItemDisplayName } from "@shared/boqItemName";

const SIDE_OPTIONS = [
  { value: "", label: "Both / full width" },
  { value: "lhs", label: "LHS" },
  { value: "rhs", label: "RHS" },
  { value: "median", label: "Median" },
  { value: "service_road_lhs", label: "Service Road LHS" },
  { value: "service_road_rhs", label: "Service Road RHS" },
];

const TYPE_META: Record<ScopeSegmentType, { icon: any; badge: string }> = {
  working_reach: { icon: RouteIcon, badge: "bg-green-100 text-green-800" },
  no_scope: { icon: Ban, badge: "bg-slate-200 text-slate-700" },
  temporary_block: { icon: Clock, badge: "bg-amber-100 text-amber-800" },
  withdrawn: { icon: FileX2, badge: "bg-red-100 text-red-800" },
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  superseded: "bg-gray-100 text-gray-500 line-through",
};

// SegFormState / emptyScopeForm / scopeFormFromSegment live in
// client/src/lib/scopeForm.ts so hydration behaviour is unit-testable.

export default function ScopeSetup() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id ?? "0");
  const { toast } = useToast();
  const qc = useQueryClient();

  const projectKey = [`/api/boq/projects/${projectId}`];
  const segKey = [`/api/boq/projects/${projectId}/scope-segments`];
  const recKey = [`/api/boq/projects/${projectId}/scope-reconciliation`];

  const { data: project } = useQuery<BoqProject>({ queryKey: projectKey });
  const { data: segments = [], isLoading: segsLoading } = useQuery<ProjectScopeSegment[]>({ queryKey: segKey });
  const { data: recon } = useQuery<any>({ queryKey: recKey });
  const { data: categories = [] } = useQuery<any[]>({ queryKey: [`/api/boq/projects/${projectId}/categories`] });
  const { data: items = [] } = useQuery<any[]>({ queryKey: [`/api/boq/projects/${projectId}/items`] });

  // ── corridor card state ────────────────────────────────────────────────────
  const [corridorEdit, setCorridorEdit] = useState(false);
  const [corFrom, setCorFrom] = useState("");
  const [corTo, setCorTo] = useState("");
  const [corRemarks, setCorRemarks] = useState("");

  const corridorMutation = useMutation({
    mutationFn: async (body: any) => (await apiRequest("PATCH", `/api/boq/projects/${projectId}/corridor`, body)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKey });
      qc.invalidateQueries({ queryKey: recKey });
      setCorridorEdit(false);
      toast({ title: "Corridor updated" });
    },
    onError: (e: any) => toast({ title: "Could not update corridor", description: String(e?.message ?? e), variant: "destructive" }),
  });

  // ── segment form state ─────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Status of the record being edited — drives the heading ("Edit draft…" vs
  // "Revise confirmed…") and the save button ("Save changes" vs "Create revision").
  const [editingStatus, setEditingStatus] = useState<"draft" | "confirmed" | null>(null);
  const [form, setForm] = useState<SegFormState>(emptyScopeForm("working_reach"));
  const set = (patch: Partial<SegFormState>) => setForm(f => ({ ...f, ...patch }));

  const closeForm = () => { setShowForm(false); setEditingId(null); setEditingStatus(null); };

  const openQuickAdd = (t: ScopeSegmentType) => {
    // Truly blank form — never carries over state from a cancelled edit.
    setForm(emptyScopeForm(t));
    setEditingId(null);
    setEditingStatus(null);
    setShowForm(true);
  };

  const openEdit = (s: ProjectScopeSegment) => {
    setForm(scopeFormFromSegment(s));
    setEditingId(s.id);
    setEditingStatus((s as any).status === "confirmed" ? "confirmed" : "draft");
    setShowForm(true);
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: segKey });
    qc.invalidateQueries({ queryKey: recKey });
  };

  const buildBody = () => ({
    segmentType: form.segmentType,
    label: form.label || null,
    chainageFrom: Number(form.chainageFrom),
    chainageTo: Number(form.chainageTo),
    side: form.side || null,
    reason: form.reason || null,
    applicability: form.applicability,
    categoryIds: form.applicability === "categories" ? form.categoryIds : null,
    itemIds: form.applicability === "items" ? form.itemIds : null,
    effectiveFrom: form.effectiveFrom || null,
    deptReference: form.deptReference || null,
    withdrawalOrderRef: form.withdrawalOrderRef || null,
    notes: form.notes || null,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = buildBody();
      const res = editingId
        ? await apiRequest("PATCH", `/api/boq/scope-segments/${editingId}`, body)
        : await apiRequest("POST", `/api/boq/projects/${projectId}/scope-segments`, body);
      return res.json();
    },
    onSuccess: (row: any) => {
      invalidateAll();
      closeForm();
      toast({ title: row?.revised ? "Revision created (previous record kept as superseded)" : "Scope record saved as draft" });
    },
    onError: (e: any) => toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (segId: number) => (await apiRequest("POST", `/api/boq/scope-segments/${segId}/confirm`)).json(),
    onSuccess: () => { invalidateAll(); toast({ title: "Scope record confirmed" }); },
    onError: (e: any) => toast({ title: "Could not confirm", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (segId: number) => (await apiRequest("DELETE", `/api/boq/scope-segments/${segId}`)).json(),
    onSuccess: () => { invalidateAll(); toast({ title: "Draft deleted" }); },
    onError: (e: any) => toast({ title: "Could not delete", description: String(e?.message ?? e), variant: "destructive" }),
  });

  // ── chainage strip ─────────────────────────────────────────────────────────
  const strip = useMemo(() => {
    const from = Number(project?.chainageFrom ?? NaN);
    const to = Number(project?.chainageTo ?? NaN);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
    const span = to - from;
    const active = (segments as any[]).filter(s => s.status !== "superseded");
    const colour = (t: string) =>
      t === "working_reach" ? "bg-green-500" : t === "temporary_block" ? "bg-amber-400" :
      t === "withdrawn" ? "bg-red-500" : "bg-slate-400";
    return { from, to, span, active, colour };
  }, [project, segments]);

  const visible = (segments as any[]).filter(s => s.status !== "superseded");
  const superseded = (segments as any[]).filter(s => s.status === "superseded");
  const fmt = (v: any) => Number(v).toFixed(3);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/work-program" className="hover:underline">Work Programme</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/work-program/${projectId}`} className="hover:underline">{project?.name ?? `Project ${projectId}`}</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">Project Scope</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5" /> Project Scope &amp; Working Reaches
        </h1>
        <Link href={`/work-program/${projectId}/execution-arrangements`}>
          <Button variant="outline" size="sm">Execution Arrangements</Button>
        </Link>
      </div>

      {/* ── Corridor card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Reference Corridor</span>
            {(project as any)?.corridorConfirmed === 1
              ? <Badge className="bg-green-100 text-green-800">Confirmed</Badge>
              : <Badge variant="outline">Not confirmed</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The corridor is the project's overall chainage reference — it is <b>not</b> a promise that every
            kilometre is executable. Executable work is defined by the working reaches below.
          </p>
          {!corridorEdit ? (
            <div className="flex items-center gap-4 flex-wrap text-sm">
              <span>Chainage: <b>{project?.chainageFrom != null ? fmt(project.chainageFrom) : "—"}</b> to <b>{project?.chainageTo != null ? fmt(project.chainageTo) : "—"}</b> km</span>
              {(project as any)?.corridorRemarks && <span className="text-muted-foreground">{(project as any).corridorRemarks}</span>}
              <Button variant="outline" size="sm" onClick={() => {
                setCorFrom(project?.chainageFrom != null ? String(project.chainageFrom) : "");
                setCorTo(project?.chainageTo != null ? String(project.chainageTo) : "");
                setCorRemarks((project as any)?.corridorRemarks ?? "");
                setCorridorEdit(true);
              }}>Edit</Button>
              {(project as any)?.corridorConfirmed !== 1 && project?.chainageFrom != null && project?.chainageTo != null && (
                <Button size="sm" onClick={() => corridorMutation.mutate({ corridorConfirmed: true })}>
                  Confirm corridor
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Label className="text-xs">From (km)</Label>
                <Input className="w-28" value={corFrom} onChange={e => setCorFrom(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label className="text-xs">To (km)</Label>
                <Input className="w-28" value={corTo} onChange={e => setCorTo(e.target.value)} inputMode="decimal" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Remarks</Label>
                <Input value={corRemarks} onChange={e => setCorRemarks(e.target.value)} placeholder="e.g. maintenance corridor — work only in agreed reaches" />
              </div>
              <Button size="sm" disabled={corridorMutation.isPending} onClick={() => corridorMutation.mutate({
                chainageFrom: corFrom === "" ? null : Number(corFrom),
                chainageTo: corTo === "" ? null : Number(corTo),
                corridorRemarks: corRemarks || null,
              })}>
                {corridorMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCorridorEdit(false)}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Chainage strip ── */}
      {strip && (
        <Card>
          <CardContent className="pt-4 space-y-1">
            <div className="relative h-6 rounded bg-slate-100 overflow-hidden" title="Corridor strip — green: working reach, amber: temporary block, red: withdrawn, grey: no scope">
              {strip.active.map((s: any) => {
                const l = Math.max(0, (Number(s.chainageFrom) - strip.from) / strip.span) * 100;
                const w = Math.max(0.5, (Math.min(Number(s.chainageTo), strip.to) - Math.max(Number(s.chainageFrom), strip.from)) / strip.span * 100);
                return (
                  <div key={s.id}
                    className={`absolute top-0 h-full ${strip.colour(s.segmentType)} ${s.status === "draft" ? "opacity-50" : "opacity-90"}`}
                    style={{ left: `${l}%`, width: `${w}%` }}
                    title={`${SCOPE_SEGMENT_TYPE_LABELS[s.segmentType as ScopeSegmentType]} ${fmt(s.chainageFrom)}–${fmt(s.chainageTo)}${s.side ? ` (${s.side})` : ""} [${s.status}]`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{fmt(strip.from)} km</span><span>{fmt(strip.to)} km</span>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
              <span><span className="inline-block w-3 h-3 rounded-sm bg-green-500 mr-1 align-middle" />Working reach</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-400 mr-1 align-middle" />Temporary block</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-red-500 mr-1 align-middle" />Withdrawn</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-slate-400 mr-1 align-middle" />No scope</span>
              <span className="opacity-70">(faded = draft)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Reconciliation summary ── */}
      {recon && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Scope Reconciliation</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-4 flex-wrap">
              <span>Corridor: <b>{recon.referenceLenKm != null ? `${recon.referenceLenKm.toFixed(3)} km` : "—"}</b></span>
              <span>Working reaches: <b>{recon.grossReachLenKm?.toFixed(3) ?? "0.000"} km</b></span>
              <span>Executable (side-km): <b>{recon.executableSideLenKm?.toFixed(3) ?? "0.000"}</b></span>
              <span>No-scope (side-km): <b>{recon.excludedSideLenKm?.toFixed(3) ?? "0.000"}</b></span>
              <span>Withdrawn (side-km): <b>{recon.withdrawnSideLenKm?.toFixed(3) ?? "0.000"}</b></span>
              <span>Blocked (side-km): <b>{recon.blockedSideLenKm?.toFixed(3) ?? "0.000"}</b></span>
              <span>Gap: <b className={recon.gapLenKm > 0.001 ? "text-amber-600" : ""}>{recon.gapLenKm?.toFixed(3) ?? "—"} km</b></span>
            </div>
            {recon.reconciles && <p className="text-green-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Scope reconciles — corridor fully explained by reaches and exclusions.</p>}
            {Array.isArray(recon.issues) && recon.issues.length > 0 && (
              <div className="space-y-1">
                {recon.issues.map((msg: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 rounded px-2 py-1 bg-amber-50 text-amber-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{msg}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Quick-add buttons ── */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(SCOPE_SEGMENT_TYPE_LABELS) as ScopeSegmentType[]).map(t => {
          const Icon = TYPE_META[t].icon;
          return (
            <Button key={t} variant="outline" size="sm" onClick={() => openQuickAdd(t)}>
              <Plus className="h-4 w-4 mr-1" /><Icon className="h-4 w-4 mr-1" />{SCOPE_SEGMENT_TYPE_LABELS[t]}
            </Button>
          );
        })}
      </div>

      {/* ── Segment form ── */}
      {showForm && (
        <Card key={editingId ?? "new"} className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span data-testid="text-scope-form-heading">
                {editingId
                  ? (editingStatus === "confirmed" ? "Revise confirmed scope record" : "Edit draft scope record")
                  : `Add: ${SCOPE_SEGMENT_TYPE_LABELS[form.segmentType]}`}
              </span>
              <Button variant="ghost" size="icon" onClick={closeForm}><X className="h-4 w-4" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editingStatus === "confirmed" && (
              <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="text-revision-note">
                This record is confirmed. Saving creates a new draft revision — the confirmed record is kept as superseded history.
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.segmentType} onValueChange={v => set({ segmentType: v as ScopeSegmentType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SCOPE_SEGMENT_TYPE_LABELS) as ScopeSegmentType[]).map(t => (
                      <SelectItem key={t} value={t}>{SCOPE_SEGMENT_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From (km)</Label>
                <Input value={form.chainageFrom} onChange={e => set({ chainageFrom: e.target.value })} inputMode="decimal" placeholder="e.g. 2.100" />
              </div>
              <div>
                <Label className="text-xs">To (km)</Label>
                <Input value={form.chainageTo} onChange={e => set({ chainageTo: e.target.value })} inputMode="decimal" placeholder="e.g. 2.400" />
              </div>
              <div>
                <Label className="text-xs">Side</Label>
                <Select value={form.side || "__both__"} onValueChange={v => set({ side: v === "__both__" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SIDE_OPTIONS.map(o => <SelectItem key={o.value || "__both__"} value={o.value || "__both__"}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input value={form.label} onChange={e => set({ label: e.target.value })} placeholder="e.g. Reach 2" />
              </div>
              <div>
                <Label className="text-xs">Reason</Label>
                <Input value={form.reason} onChange={e => set({ reason: e.target.value })} placeholder={form.segmentType === "no_scope" ? "e.g. existing CC road — no work awarded" : form.segmentType === "temporary_block" ? "e.g. land dispute at village section" : "reason"} />
              </div>
              <div>
                <Label className="text-xs">Applies to</Label>
                <Select value={form.applicability} onValueChange={v => set({ applicability: v as any, categoryIds: [], itemIds: [] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_linear">All road (linear) items</SelectItem>
                    <SelectItem value="categories">Only selected categories</SelectItem>
                    <SelectItem value="items">Only selected items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.applicability === "categories" && (
              <div className="flex gap-2 flex-wrap">
                {(categories as any[]).map(c => (
                  <label key={c.id} className="flex items-center gap-1 text-sm border rounded px-2 py-1 cursor-pointer">
                    <input type="checkbox" checked={form.categoryIds.includes(c.id)}
                      onChange={e => set({ categoryIds: e.target.checked ? [...form.categoryIds, c.id] : form.categoryIds.filter(x => x !== c.id) })} />
                    {c.name}
                  </label>
                ))}
                {(categories as any[]).length === 0 && <span className="text-sm text-muted-foreground">No categories found.</span>}
              </div>
            )}
            {form.applicability === "items" && (
              <div className="max-h-48 overflow-auto border rounded p-2 space-y-1">
                {(items as any[]).map(it => (
                  <label key={it.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.itemIds.includes(it.id)}
                      onChange={e => set({ itemIds: e.target.checked ? [...form.itemIds, it.id] : form.itemIds.filter(x => x !== it.id) })} />
                    <span className="truncate">{it.itemNo ? `${it.itemNo} — ` : ""}{boqItemDisplayName(it).slice(0, 90)}</span>
                  </label>
                ))}
                {(items as any[]).length === 0 && <span className="text-sm text-muted-foreground">No items found.</span>}
              </div>
            )}
            {(form.segmentType === "withdrawn" || form.segmentType === "temporary_block") && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Effective from (date)</Label>
                  <Input type="date" value={form.effectiveFrom} onChange={e => set({ effectiveFrom: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Dept. reference</Label>
                  <Input value={form.deptReference} onChange={e => set({ deptReference: e.target.value })} placeholder="letter / order no." />
                </div>
                {form.segmentType === "withdrawn" && (
                  <div>
                    <Label className="text-xs">Withdrawal order ref</Label>
                    <Input value={form.withdrawalOrderRef} onChange={e => set({ withdrawalOrderRef: e.target.value })} />
                  </div>
                )}
              </div>
            )}
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={e => set({ notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={saveMutation.isPending || !form.chainageFrom || !form.chainageTo}
                onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editingId ? (editingStatus === "confirmed" ? "Create revision" : "Save changes") : "Save as draft"}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Segment table ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Scope Records</CardTitle></CardHeader>
        <CardContent>
          {segsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No scope records yet. If the whole corridor is executable you don't need any — add working
              reaches only when execution is limited to specific stretches.
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map((s: any) => {
                const Icon = TYPE_META[s.segmentType as ScopeSegmentType]?.icon ?? MapPin;
                return (
                  <div key={s.id} className="flex items-center gap-3 border rounded-md px-3 py-2 flex-wrap">
                    <Icon className="h-4 w-4 shrink-0" />
                    <Badge className={TYPE_META[s.segmentType as ScopeSegmentType]?.badge}>{SCOPE_SEGMENT_TYPE_LABELS[s.segmentType as ScopeSegmentType]}</Badge>
                    <span className="font-medium text-sm">{fmt(s.chainageFrom)} – {fmt(s.chainageTo)} km</span>
                    {s.side && <Badge variant="outline">{s.side}</Badge>}
                    {s.label && <span className="text-sm">{s.label}</span>}
                    {s.applicability !== "all_linear" && <Badge variant="outline">{s.applicability === "categories" ? "selected categories" : "selected items"}</Badge>}
                    {s.effectiveFrom && <span className="text-xs text-muted-foreground">from {s.effectiveFrom}</span>}
                    {s.reason && <span className="text-xs text-muted-foreground truncate max-w-[240px]" title={s.reason}>{s.reason}</span>}
                    <Badge className={STATUS_BADGE[s.status] ?? ""}>{s.status}</Badge>
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="icon" title={s.status === "confirmed" ? "Edit (creates a revision)" : "Edit draft"} onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {s.status === "draft" && (
                        <>
                          <Button variant="ghost" size="icon" title="Confirm" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate(s.id)}>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete draft" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(s.id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {superseded.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">{superseded.length} superseded revision{superseded.length > 1 ? "s" : ""} kept for history.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
