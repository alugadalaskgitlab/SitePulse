import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Layers3 } from "lucide-react";
import { ProgrammeLink as Link } from "@/components/ProgrammeLink";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  calculateDprLayerAssignments,
  summarizeDprLayerAssignments,
  type DprLayerAssignmentRow,
  type DprLayerAssignmentSource,
  type DprLayerReach,
} from "@shared/dprLayerAssignment";

type ProjectOption = { id: number; name: string };
type BoqItemOption = { id: number; itemCode: string | null; itemName: string | null; description: string; unit: string };
type AssignmentData = {
  project: { id: number; name: string; roadLengthKm: number | null };
  items: BoqItemOption[];
  rows: DprLayerAssignmentSource[];
  reaches: DprLayerReach[];
};
type PreviewData = {
  previewToken: string;
  groupName: string;
  project: AssignmentData["project"];
  items: BoqItemOption[];
  rows: DprLayerAssignmentRow[];
  reaches: DprLayerReach[];
  settings: { itemIds: number[]; layerCount: number; compactedThicknessMm: number };
};

function itemLabel(item: BoqItemOption) {
  return `${item.itemCode ? `${item.itemCode} · ` : ""}${item.itemName || item.description}`;
}

function qty(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function displayDate(value: string | Date) {
  return String(value).slice(0, 10);
}

function formatKm(value: number) {
  const km = Math.floor(value);
  const metres = Math.round((value - km) * 1000);
  return `${km}+${String(metres).padStart(3, "0")}`;
}

export default function DprLayerAssignment() {
  const { id: rawProjectId } = useParams<{ id: string }>();
  const projectId = Number(rawProjectId);
  const [, setLocation] = useLocation();
  const { isOwner } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [groupName, setGroupName] = useState("");
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [layerCount, setLayerCount] = useState("3");
  const [compactedThicknessMm, setCompactedThicknessMm] = useState("250");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [layerOverrides, setLayerOverrides] = useState<Record<number, number>>({});
  const [uomCorrections, setUomCorrections] = useState<Record<number, boolean>>({});
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ["/api/boq/projects"],
    queryFn: async () => {
      const response = await fetch("/api/boq/projects", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load BOQ projects.");
      return response.json();
    },
    enabled: isOwner,
  });

  const { data, isLoading, error } = useQuery<AssignmentData>({
    queryKey: ["/api/boq/projects", projectId, "dpr-layer-assignment"],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects/${projectId}/dpr-layer-assignment`, { credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not load DPR layer assignment data.");
      return result;
    },
    enabled: isOwner && Number.isSafeInteger(projectId) && projectId > 0,
  });

  const assignmentRows = useMemo(() => {
    if (!preview) return [];
    return calculateDprLayerAssignments(preview.rows, {
      itemIds: preview.settings.itemIds,
      layerCount: preview.settings.layerCount,
      compactedThicknessMm: preview.settings.compactedThicknessMm,
      roadLengthKm: preview.project.roadLengthKm == null ? null : Number(preview.project.roadLengthKm),
      layerOverrides,
    });
  }, [preview, layerOverrides]);
  const summaries = useMemo(() => preview
    ? summarizeDprLayerAssignments(assignmentRows, preview.reaches, {
        itemIds: preview.settings.itemIds,
        compactedThicknessMm: preview.settings.compactedThicknessMm,
        roadLengthKm: preview.project.roadLengthKm == null ? null : Number(preview.project.roadLengthKm),
      })
    : [], [preview, assignmentRows]);
  const submittedRows = assignmentRows.filter((row) => row.counted);
  const draftRows = assignmentRows.filter((row) => !row.counted);

  function changeItems(next: number[]) {
    setItemIds(next);
    setPreview(null);
    setLayerOverrides({});
    setUomCorrections({});
  }

  async function makePreview() {
    if (!data || itemIds.length === 0 || !groupName.trim()) {
      toast({ title: "Choose a layer group and one or more BOQ items.", variant: "destructive" });
      return;
    }
    setPreviewBusy(true);
    try {
      const response = await apiRequest("POST", `/api/boq/projects/${projectId}/dpr-layer-assignment/preview`, {
        groupName: groupName.trim(),
        itemIds,
        layerCount: Number(layerCount),
        compactedThicknessMm: Number(compactedThicknessMm),
      });
      const result = await response.json();
      setPreview(result);
      setLayerOverrides({});
      setUomCorrections({});
    } catch (cause) {
      toast({
        title: "Preview unavailable",
        description: cause instanceof Error ? cause.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setPreviewBusy(false);
    }
  }

  async function applyChanges() {
    if (!preview) return;
    try {
      const response = await apiRequest("POST", `/api/boq/projects/${projectId}/dpr-layer-assignment/apply`, {
        previewToken: preview.previewToken,
        options: {
          groupName: groupName.trim(),
          itemIds: preview.settings.itemIds,
          layerCount: preview.settings.layerCount,
          compactedThicknessMm: preview.settings.compactedThicknessMm,
        },
        updates: submittedRows.map((row) => ({
          progressId: row.progressId,
          layerNo: row.proposedLayer,
          correctUom: uomCorrections[row.progressId] === true,
        })),
        reason: reason.trim(),
        confirm: confirmed,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Apply failed.");
      toast({ title: result.message ?? `${result.updatedCount} lines updated` });
      setApplyOpen(false);
      setPreview(null);
      setReason("");
      setConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "dpr-layer-assignment"] });
    } catch (cause) {
      toast({
        title: "Could not apply layer assignments",
        description: cause instanceof Error ? cause.message : "Open the review again.",
        variant: "destructive",
      });
    }
  }

  if (!isOwner) {
    return <div className="mx-auto max-w-md py-20 text-center"><h2 className="text-xl font-semibold">Owner access required</h2></div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/work-program/${projectId}/earthwork`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to Earthwork
        </Link>
        <span className="text-slate-300">|</span>
        <h1 className="text-xl font-semibold text-slate-900">Assign layers</h1>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="layer-project">Project</Label>
            <select
              id="layer-project"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={String(projectId)}
              onChange={(event) => setLocation(`/work-program/${Number(event.target.value)}/assign-layers`)}
              data-testid="select-layer-project"
            >
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="layer-group">Layer group</Label>
            <Input id="layer-group" value={groupName} onChange={(event) => { setGroupName(event.target.value); setPreview(null); }} placeholder="Embankment or subgrade" data-testid="input-layer-group" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>BOQ items in this group</Label>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading project items…</p> : (
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
              {(data?.items ?? []).map((item) => (
                <label key={item.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={itemIds.includes(item.id)}
                    onCheckedChange={(checked) => changeItems(checked ? [...itemIds, item.id] : itemIds.filter((id) => id !== item.id))}
                    data-testid={`checkbox-layer-item-${item.id}`}
                  />
                  <span>{itemLabel(item)} <span className="text-muted-foreground">({item.unit})</span></span>
                </label>
              ))}
              {!data?.items.length && <p className="text-sm text-muted-foreground">No BOQ items are available.</p>}
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="layer-thickness">Compacted thickness per layer (mm)</Label>
            <Input id="layer-thickness" type="number" min="1" step="1" value={compactedThicknessMm} onChange={(event) => { setCompactedThicknessMm(event.target.value); setPreview(null); }} data-testid="input-layer-thickness" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="layer-count">Number of layers</Label>
            <Input id="layer-count" type="number" min="1" step="1" value={layerCount} onChange={(event) => { setLayerCount(event.target.value); setPreview(null); }} data-testid="input-layer-count" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={makePreview} disabled={previewBusy || isLoading || !data || !itemIds.length || !groupName.trim()} data-testid="button-preview-layers">
            {previewBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preview
          </Button>
          {preview && (
            <Button variant="default" onClick={() => { setApplyOpen(true); setReason(""); setConfirmed(false); }} disabled={!submittedRows.length} data-testid="button-open-apply-layers">
              <Layers3 className="mr-2 h-4 w-4" /> Apply to {submittedRows.length} submitted lines
            </Button>
          )}
          {error && <span role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Project data could not be loaded."}</span>}
        </div>
      </Card>

      {preview && (
        <>
          <Card className="space-y-3 p-4">
            <div>
              <h2 className="font-semibold">Layer summary by reach</h2>
              <p className="text-sm text-muted-foreground">{preview.groupName} · {preview.settings.compactedThicknessMm} mm compacted per layer</p>
            </div>
            {summaries.length === 0 ? <p className="text-sm text-muted-foreground">No submitted lines with chainage overlap the confirmed reaches.</p> : (
              <div className="space-y-3">
                {summaries.map((summary, index) => (
                  <div key={`${summary.reachId ?? "project"}-${index}`} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{summary.reachLabel}</p>
                    <p className="mt-1 text-sm">
                      {Object.entries(summary.layerLengthsM).sort(([a], [b]) => Number(a) - Number(b)).map(([layer, length]) =>
                        `Layer ${layer}: ${qty(length, 1)} m`).join(" · ") || "No layer lengths recorded"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {summary.spans.map((span, spanIndex) => (
                        <span key={`${spanIndex}-${span.fromKm}-${span.toKm}-${span.side}`} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {span.side} {formatKm(span.fromKm)}–{formatKm(span.toKm)} · layers {span.layers.join(", ")} · {qty(span.cumulativeThicknessMm, 0)} mm compacted
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">DPR lines in the preview</h2>
              <p className="text-sm text-muted-foreground">Only submitted lines can be changed. Drafts are shown for reference and never applied.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1450px] w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {["Date", "DPR", "Item", "Side", "Chainage", "Length", "Width", "Thickness", "Quantity", "Unit", "Current layer", "Proposed layer", "Flags"].map((heading) =>
                      <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {assignmentRows.map((row) => (
                    <tr key={row.progressId} className={`border-t ${row.counted ? "" : "bg-slate-50 text-slate-400"}`} data-testid={`row-layer-assignment-${row.progressId}`}>
                      <td className="whitespace-nowrap px-2 py-2">{displayDate(row.dprDate)}</td>
                      <td className="px-2 py-2">#{row.dprId}{!row.counted && <div className="text-[10px]">draft — not counted</div>}</td>
                      <td className="max-w-[260px] px-2 py-2">{row.itemName || row.activity}</td>
                      <td className="px-2 py-2">{row.side || "Unspecified"}</td>
                      <td className="whitespace-nowrap px-2 py-2">{row.chainageFrom || "—"}–{row.chainageTo || "—"}</td>
                      <td className="px-2 py-2">{qty(row.length, 1)} m</td>
                      <td className="px-2 py-2">{qty(row.width, 2)} m</td>
                      <td className="px-2 py-2">{row.thickness == null ? "—" : `${qty(Number(row.thickness) * 1000, 1)} mm`}</td>
                      <td className="px-2 py-2">{qty(row.quantity)} {row.uom ?? ""}</td>
                      <td className="px-2 py-2">
                        <div>{row.uom || "—"}{row.counted && row.flags.some((flag) => flag.startsWith("Unit not")) && (
                          <label className="mt-1 flex items-center gap-1 text-[10px] text-teal-800">
                            <Checkbox
                              checked={uomCorrections[row.progressId] === true}
                              onCheckedChange={(checked) => setUomCorrections((previous) => ({ ...previous, [row.progressId]: checked === true }))}
                              data-testid={`checkbox-correct-uom-${row.progressId}`}
                            />
                            Correct to {row.itemUnit}
                          </label>
                        )}</div>
                      </td>
                      <td className="px-2 py-2">{row.layerNo ?? "—"}</td>
                      <td className="px-2 py-2">
                        {row.counted ? (
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            className="h-8 w-20"
                            value={layerOverrides[row.progressId] ?? row.proposedLayer ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setLayerOverrides((previous) => {
                                const next = { ...previous };
                                if (value === "") delete next[row.progressId];
                                else next[row.progressId] = Number(value);
                                return next;
                              });
                            }}
                            aria-label={`Proposed layer for DPR ${row.dprId}, line ${row.progressId}`}
                            data-testid={`input-proposed-layer-${row.progressId}`}
                          />
                        ) : "—"}
                      </td>
                      <td className="min-w-[220px] px-2 py-2">
                        {row.flags.map((flag) => <span key={flag} className="mb-1 mr-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{flag}</span>)}
                        {row.expectedVolumeCum != null && row.quantityDifferenceCum != null && Math.abs(row.quantityDifferenceCum) > 0 && (
                          <div className="text-[10px] text-slate-500">Geometry: {qty(row.expectedVolumeCum)} cum</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!assignmentRows.length && <tr><td className="p-6 text-center text-muted-foreground" colSpan={13}>No DPR lines found for the selected items.</td></tr>}
                </tbody>
              </table>
            </div>
            {draftRows.length > 0 && <p className="border-t p-3 text-xs text-muted-foreground">{draftRows.length} draft lines are not counted and will not be changed.</p>}
          </Card>
        </>
      )}

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm layer assignment</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Apply the reviewed layer numbers and selected unit corrections to {submittedRows.length} submitted lines? Quantity, chainage, dimensions, item, dates and DPR status will not change. Drafts are excluded.</p>
            <div className="space-y-1.5">
              <Label htmlFor="layer-reason">Reason for this change</Label>
              <Input id="layer-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter a reason" data-testid="input-layer-reason" />
            </div>
            <label className="flex items-start gap-2">
              <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} data-testid="checkbox-confirm-layer-apply" />
              <span>I reviewed the preview and confirm these layer and unit changes.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={applyChanges} disabled={reason.trim().length < 10 || !confirmed} data-testid="button-confirm-layer-apply">Apply layers</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
