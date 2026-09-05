// ─────────────────────────────────────────────────────────────────────────────
// Geometry Batch 01 — Road Geometry & Quantities (project-level, optional)
// Simple typical-section inputs + full-corridor geometry preview vs BOQ.
// All calculation lives in shared/roadGeometry.ts — never in this component.
// Route: /work-program/:id/geometry
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { ChevronRight, Ruler, Loader2, Info, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { BoqProject } from "@shared/schema";
import {
  GEOMETRY_LAYER_TYPES, GEOMETRY_LAYER_LABELS, defaultGeometryLayers,
  defaultLayerWidthM, applicableLayerWidthM, computeGeometryPreview, suggestedFormationWidthM,
  type GeometryLayerConfig, type RoadGeometryProfileInput, type GeometryItemResult,
} from "@shared/roadGeometry";
import { boqItemDisplayName } from "@shared/boqItemName";

const fmtQty = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function RoadGeometry() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id ?? "0");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery<BoqProject>({ queryKey: [`/api/boq/projects/${projectId}`] });
  const { data: items = [] } = useQuery<any[]>({ queryKey: [`/api/boq/projects/${projectId}/items`] });
  const { data: saved, isLoading: profileLoading } = useQuery<any>({
    queryKey: [`/api/boq/projects/${projectId}/road-geometry`],
    queryFn: () => fetch(`/api/boq/projects/${projectId}/road-geometry`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  // ── form state ─────────────────────────────────────────────────────────────
  const [, navigate] = useLocation();
  const [enabled, setEnabled] = useState(false);
  const [widths, setWidths] = useState({ formation: "", cw: "", pavedL: "", pavedR: "", softL: "", softR: "" });
  // 01A decimal fix: keep RAW STRINGS while editing (a per-keystroke Number()
  // conversion swallowed the "." of e.g. "8.75"); convert only when computing/saving.
  const [layerEnabled, setLayerEnabled] = useState<Record<string, boolean>>({});
  const [layerText, setLayerText] = useState<Record<string, { thickness: string; override: string }>>({});
  const [showOverrides, setShowOverrides] = useState(false);
  // Hydration is PROJECT-SCOPED: tracking the hydrated project id (not a bare
  // boolean) so navigating between projects re-hydrates instead of carrying
  // one project's form values (and Save payload) over to another.
  const [hydratedProjectId, setHydratedProjectId] = useState<number | null>(null);
  const hydrated = hydratedProjectId === projectId;

  useEffect(() => {
    if (profileLoading || hydrated) return;
    if (saved) {
      setEnabled(saved.enabled === 1 || saved.enabled === true);
      const s = (v: any) => (v != null ? String(v) : "");
      setWidths({ formation: s(saved.formationWidthM), cw: s(saved.carriagewayWidthM), pavedL: s(saved.pavedShoulderLhsM), pavedR: s(saved.pavedShoulderRhsM), softL: s(saved.softShoulderLhsM), softR: s(saved.softShoulderRhsM) });
      const savedLayers: GeometryLayerConfig[] = Array.isArray(saved.layers) ? saved.layers : [];
      const en: Record<string, boolean> = {}; const tx: Record<string, { thickness: string; override: string }> = {};
      for (const d of defaultGeometryLayers()) {
        const l = savedLayers.find(x => x.layerType === d.layerType) ?? d;
        en[d.layerType] = l.enabled;
        tx[d.layerType] = { thickness: s(l.thicknessMm), override: s(l.overrideWidthM) };
      }
      setLayerEnabled(en); setLayerText(tx);
      if (savedLayers.some(l => l.overrideWidthM != null)) setShowOverrides(true);
    } else {
      const en: Record<string, boolean> = {}; const tx: Record<string, { thickness: string; override: string }> = {};
      for (const d of defaultGeometryLayers()) { en[d.layerType] = false; tx[d.layerType] = { thickness: "", override: "" }; }
      setLayerEnabled(en); setLayerText(tx);
    }
    setHydratedProjectId(projectId);
  }, [saved, profileLoading, hydrated, projectId]);

  const num = (v: string) => {
    const t = (v ?? "").trim();
    if (t === "") return null;
    const x = Number(t);
    return Number.isFinite(x) ? x : null;
  };

  const layers: GeometryLayerConfig[] = useMemo(() =>
    defaultGeometryLayers().map(d => ({
      layerType: d.layerType,
      enabled: layerEnabled[d.layerType] ?? false,
      thicknessMm: num(layerText[d.layerType]?.thickness ?? ""),
      overrideWidthM: num(layerText[d.layerType]?.override ?? ""),
    })), [layerEnabled, layerText]);

  const profileInput: RoadGeometryProfileInput = useMemo(() => ({
    enabled,
    formationWidthM: num(widths.formation),
    carriagewayWidthM: num(widths.cw),
    pavedShoulderLhsM: num(widths.pavedL),
    pavedShoulderRhsM: num(widths.pavedR),
    softShoulderLhsM: num(widths.softL),
    softShoulderRhsM: num(widths.softR),
    layers,
  }), [enabled, widths, layers]);

  const preview = useMemo(() => computeGeometryPreview(
    {
      chainageFrom: project?.chainageFrom != null ? Number(project.chainageFrom) : null,
      chainageTo: project?.chainageTo != null ? Number(project.chainageTo) : null,
      corridorConfirmed: (project as any)?.corridorConfirmed === 1,
    },
    profileInput,
    (items as any[]).map(it => ({
      id: it.id, description: it.description ?? "", unit: it.unit ?? "",
      canonicalUnit: it.canonicalUnit ?? null, workCategory: it.workCategory ?? null,
      displayName: it.displayName ?? null, itemName: it.itemName ?? null, layerConfig: it.layerConfig ?? null,
    })),
  ), [project, profileInput, items]);

  const itemById = useMemo(() => new Map((items as any[]).map(it => [it.id, it])), [items]);

  const saveMutation = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/boq/projects/${projectId}/road-geometry`, {
      enabled,
      formationWidthM: num(widths.formation),
      carriagewayWidthM: num(widths.cw),
      pavedShoulderLhsM: num(widths.pavedL),
      pavedShoulderRhsM: num(widths.pavedR),
      softShoulderLhsM: num(widths.softL),
      softShoulderRhsM: num(widths.softR),
      layers,
    })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/boq/projects/${projectId}/road-geometry`] });
      toast({ title: "Road geometry saved" });
    },
    onError: (e: any) => toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const setLayerField = (t: string, field: "thickness" | "override", value: string) =>
    setLayerText(m => ({ ...m, [t]: { ...(m[t] ?? { thickness: "", override: "" }), [field]: value } }));

  const formationSuggestion = suggestedFormationWidthM(profileInput);

  const calculated = preview.status === "ok" ? preview.results.filter(r => r.status === "calculated") : [];
  const attention = preview.status === "ok" ? preview.results.filter(r => r.status === "needs_mapping" || r.status === "conversion_required" || r.status === "layer_not_configured") : [];
  const unsupportedCount = preview.status === "ok" ? preview.results.filter(r => r.status === "unsupported").length : 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/work-program" className="hover:underline">Work Programme</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/work-program/${projectId}`} className="hover:underline">{project?.name ?? `Project ${projectId}`}</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">Road Geometry &amp; Quantities</span>
      </div>

      <h1 className="text-xl font-semibold flex items-center gap-2"><Ruler className="h-5 w-5" /> Road Geometry &amp; Quantities</h1>

      {/* ── Enable + widths ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Typical Road Section</span>
            <label className="flex items-center gap-2 text-sm font-normal" data-testid="toggle-geometry-enabled">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              Enable Road Geometry &amp; Quantities
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Optional. Calculated quantities are a <b>preview/comparison only</b> — they never change Contract BOQ
            quantities or any planning figures. Quantities use the full confirmed corridor (no-scope deductions come later).
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              ["cw", "Carriageway (m)"],
              ["pavedL", "Paved shoulder LHS (m)"],
              ["pavedR", "Paved shoulder RHS (m)"],
              ["softL", "Soft shoulder LHS (m)"],
              ["softR", "Soft shoulder RHS (m)"],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <Label className="text-xs">{label}</Label>
                <Input value={(widths as any)[k]} inputMode="decimal" placeholder={k === "cw" ? "e.g. 7.25" : "optional"}
                  onChange={e => setWidths(w => ({ ...w, [k]: e.target.value }))} data-testid={`input-width-${k}`} />
              </div>
            ))}
          </div>

          {/* 01A — Formation Width: explicit design input, suggested once when blank, never auto-overwritten */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Formation Width (m) — design input</Label>
              <Input className="w-40" value={widths.formation} inputMode="decimal" placeholder="e.g. 12.0"
                onChange={e => setWidths(w => ({ ...w, formation: e.target.value }))} data-testid="input-width-formation" />
            </div>
            {widths.formation.trim() === "" && formationSuggestion > 0 && (
              <Button size="sm" variant="outline" data-testid="button-use-suggested-formation"
                onClick={() => setWidths(w => ({ ...w, formation: String(formationSuggestion) }))}>
                Use suggested: {fmtQty(formationSuggestion)} m
              </Button>
            )}
            <p className="text-xs text-muted-foreground max-w-md">
              Width of the prepared formation/subgrade platform. The suggestion is carriageway + all shoulders;
              once you enter your own value it is never recalculated automatically.
            </p>
          </div>

          {/* ── layers ── */}
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-1.5">Layer</th>
                  <th className="text-left px-3 py-1.5">Applicable</th>
                  <th className="text-left px-3 py-1.5">Thickness (mm)</th>
                  <th className="text-left px-3 py-1.5">Suggested width</th>
                  {showOverrides && <th className="text-left px-3 py-1.5">Override width (m)</th>}
                </tr>
              </thead>
              <tbody>
                {GEOMETRY_LAYER_TYPES.map(t => {
                  const l = layers.find(x => x.layerType === t)!;
                  const defW = defaultLayerWidthM(t, profileInput);
                  const effW = applicableLayerWidthM(t, profileInput);
                  return (
                    <tr key={t} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{GEOMETRY_LAYER_LABELS[t]}</td>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={l.enabled} onChange={e => setLayerEnabled(m => ({ ...m, [t]: e.target.checked }))} data-testid={`check-layer-${t}`} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input className="w-24 h-8" value={layerText[t]?.thickness ?? ""} inputMode="decimal" disabled={!l.enabled}
                          onChange={e => setLayerField(t, "thickness", e.target.value)}
                          data-testid={`input-thickness-${t}`} />
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {defW > 0 ? `${fmtQty(defW)} m` : "—"}
                        {l.overrideWidthM != null && effW !== defW && <Badge variant="outline" className="ml-2">using {fmtQty(effW)} m</Badge>}
                      </td>
                      {showOverrides && (
                        <td className="px-3 py-1.5">
                          <Input className="w-24 h-8" value={layerText[t]?.override ?? ""} inputMode="decimal" disabled={!l.enabled}
                            onChange={e => setLayerField(t, "override", e.target.value)}
                            data-testid={`input-override-${t}`} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()} data-testid="button-save-geometry">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowOverrides(s => !s)} data-testid="button-toggle-overrides">
              {showOverrides ? "Hide" : "Advanced / Adjust layer widths"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Suggested widths are convenience starting points, not confirmed design values: Subgrade = Formation Width ·
            DBM / BC / Tack = carriageway + paved shoulders · GSB / WMM / Prime start from the paved width but often
            differ by design — confirm or adjust them via the per-layer override.
          </p>
        </CardContent>
      </Card>

      {/* ── Preview ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Contract BOQ vs Geometry Calculated Qty</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {preview.status === "disabled" && (
            <p className="text-sm text-muted-foreground" data-testid="text-geometry-disabled">
              Enable Road Geometry above to calculate a quantity preview.
            </p>
          )}
          {preview.status === "corridor_unconfirmed" && (
            <div className="flex items-start gap-2 rounded px-3 py-2 bg-amber-50 text-amber-800 text-sm" data-testid="text-corridor-unconfirmed">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{preview.message} <Link href={`/work-program/${projectId}/scope`} className="underline">Open Project Scope</Link></span>
            </div>
          )}
          {preview.status === "ok" && (
            <>
              <p className="text-xs text-muted-foreground">Corridor length used: <b>{fmtQty(preview.lengthM)} m</b> (full confirmed corridor)</p>
              {calculated.length === 0 ? (
                <p className="text-sm text-muted-foreground">No geometry-calculable items yet — enable layers and enter widths/thicknesses above.</p>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-geometry-preview">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-1.5">Item</th>
                        <th className="text-left px-3 py-1.5">Calculation</th>
                        <th className="text-left px-3 py-1.5">Width source</th>
                        <th className="text-right px-3 py-1.5">BOQ Qty</th>
                        <th className="text-right px-3 py-1.5">Geometry Calculated Qty</th>
                        <th className="text-right px-3 py-1.5">Difference</th>
                        <th className="text-left px-3 py-1.5">How calculated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(calculated as Extract<GeometryItemResult, { status: "calculated" }>[]).map(r => {
                        const it = itemById.get(r.boqItemId);
                        const boqQty = Number(it?.currentQty ?? it?.boqQty ?? 0);
                        const diff = r.quantity - boqQty;
                        const pct = boqQty > 0 ? (diff / boqQty) * 100 : null;
                        return (
                          <tr key={r.boqItemId} className="border-t align-top">
                            <td className="px-3 py-1.5 max-w-[280px]"><span className="line-clamp-2">{boqItemDisplayName(it)}</span></td>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <Badge variant="outline">{r.basis.calcLabel}</Badge>
                              <span className="ml-1 text-[10px] text-muted-foreground uppercase">{r.basis.calcType === "area" ? "area" : "volume"}</span>
                            </td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground max-w-[160px]"><span className="line-clamp-2">{r.basis.widthSource}</span></td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">{fmtQty(boqQty)} {r.unit}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">{fmtQty(r.quantity)} {r.unit}</td>
                            <td className={`px-3 py-1.5 text-right whitespace-nowrap ${Math.abs(diff) > 0.005 ? (diff < 0 ? "text-amber-700" : "text-blue-700") : ""}`}>
                              {diff >= 0 ? "+" : ""}{fmtQty(diff)} {r.unit}{pct != null && <> ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)</>}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap" title={r.basis.conversion ?? undefined}>{r.basis.formula}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {attention.length > 0 && (
                <div className="space-y-1" data-testid="panel-geometry-attention">
                  <p className="text-xs font-medium text-amber-700">Needs attention ({attention.length})</p>
                  {attention.map(r => {
                    const it = itemById.get(r.boqItemId);
                    return (
                      <div key={r.boqItemId} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <p className="flex-1">
                          <b>{boqItemDisplayName(it).slice(0, 70)}</b> — {(r as any).reason}
                        </p>
                        {/* 01B: single source of item configuration — reuse the EXISTING
                            BOQ Layer Config dialog via its ?recipeItem deep-link. */}
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs shrink-0"
                          data-testid={`button-configure-geometry-${r.boqItemId}`}
                          onClick={() => navigate(`/work-program/${projectId}?recipeItem=${r.boqItemId}`)}>
                          Configure in Layer Config
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {unsupportedCount > 0 && (
                <p className="text-xs text-muted-foreground">{unsupportedCount} item(s) are non-linear/structures — not geometry-calculated in this phase.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
