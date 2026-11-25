import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { boqItemDisplayText } from "@shared/boqItemName";
import { DesignLevelsTab } from "@/components/level-sheets/DesignLevelsTab";
import { ReadingsTab, hydrateRows, type SheetReadingRow } from "@/components/level-sheets/ReadingsTab";
import {
  calculateLevelSheet,
  formatChainage,
  formatChainagePair,
  type BookChainageSystem,
  type ReadingMode,
} from "@shared/levelSheets";

type Bootstrap = {
  sites: Array<{ id: number; name: string }>;
  siteId: number | null;
  projects: Array<{ id: number; name: string; siteId: number; status: string }>;
  boqProjectId: number | null;
  items: Array<{ id: number; itemCode: string | null; displayName: string | null; itemName: string | null; description: string; unit: string; layerConfig: any }>;
  personnel: Array<{ id: number; name: string; role: string; isActive: number | null }>;
  layerOptions: string[];
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
};
type FormState = {
  siteId: number;
  boqProjectId: string;
  boqItemId: string;
  layerName: string;
  sheetDate: string;
  instrument: string;
  toleranceAboveMm: string;
  toleranceBelowMm: string;
  allowedClosingErrorMm: string;
  readingMode: ReadingMode;
  tbmName: string;
  tbmRl: string;
  initialBackSight: string;
  closingForeSight: string;
  readings: SheetReadingRow[];
  personnelIds: number[];
  status: "draft" | "saved";
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function blankForm(siteId: number, projectId: number | null, layerName: string): FormState {
  const { rows } = hydrateRows([]);
  return {
    siteId, boqProjectId: projectId ? String(projectId) : "", boqItemId: "",
    layerName: layerName || "Original ground", sheetDate: localDate(), instrument: "",
    toleranceAboveMm: "10", toleranceBelowMm: "10", allowedClosingErrorMm: "10",
    readingMode: "rl", tbmName: "", tbmRl: "", initialBackSight: "", closingForeSight: "",
    readings: rows, personnelIds: [], status: "draft",
  };
}
function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function getJson(url: string) {
  return fetch(url, { credentials: "include" }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? "Could not load BOQ items.");
    return body;
  });
}
function displayItem(item: any) {
  const label = boqItemDisplayText(item);
  return `${item.itemCode ? `${item.itemCode} · ` : ""}${label}`.toLocaleUpperCase("en");
}

export function LevelSheetEditor({ siteId, bootstrap, sheetId, sheet, loadingSheet, sheetError, canCreate, canEdit, onBack, onSave, saving }: {
  siteId: number;
  bootstrap: Bootstrap;
  sheetId: number | null;
  sheet: any | null;
  loadingSheet: boolean;
  sheetError: string | null;
  canCreate: boolean;
  canEdit: boolean;
  onBack: () => void;
  onSave: (payload: any) => void;
  saving: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("design");
  const [form, setForm] = useState<FormState>(() => blankForm(siteId, bootstrap.boqProjectId, bootstrap.layerOptions[0] ?? "Original ground"));
  const [settings, setSettings] = useState<Bootstrap["settings"]>(bootstrap.settings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const resetKey = sheetId;

  useEffect(() => {
    setSettings({
      bookChainageSystem: bootstrap.settings?.bookChainageSystem ?? "ours",
      consultantOffsetM: Number(bootstrap.settings?.consultantOffsetM ?? 0),
    });
  }, [siteId, bootstrap.settings?.bookChainageSystem, bootstrap.settings?.consultantOffsetM]);

  useEffect(() => {
    if (sheetId == null) {
      setForm(blankForm(siteId, bootstrap.boqProjectId, bootstrap.layerOptions[0] ?? "Original ground"));
      setActiveTab("design");
      return;
    }
    if (!sheet || Number(sheet.id) !== sheetId) return;
    setForm({
      siteId: Number(sheet.siteId),
      boqProjectId: sheet.boqProjectId == null ? "" : String(sheet.boqProjectId),
      boqItemId: sheet.boqItemId == null ? "" : String(sheet.boqItemId),
      layerName: String(sheet.layerName ?? ""),
      sheetDate: String(sheet.sheetDate),
      instrument: String(sheet.instrument ?? ""),
      toleranceAboveMm: String(sheet.toleranceAboveMm ?? 10),
      toleranceBelowMm: String(sheet.toleranceBelowMm ?? 10),
      allowedClosingErrorMm: String(sheet.allowedClosingErrorMm ?? 10),
      readingMode: sheet.readingMode === "staff" ? "staff" : "rl",
      tbmName: String(sheet.tbmName ?? ""),
      tbmRl: sheet.tbmRl == null ? "" : String(sheet.tbmRl),
      initialBackSight: sheet.initialBackSight == null ? "" : String(sheet.initialBackSight),
      closingForeSight: sheet.closingForeSight == null ? "" : String(sheet.closingForeSight),
      readings: hydrateRows(sheet.readings).rows,
      personnelIds: (sheet.personnelIds ?? sheet.staff?.map((person: any) => person.id) ?? []).map(Number),
      status: sheet.status === "saved" ? "saved" : "draft",
    });
    setActiveTab("readings");
  }, [sheetId, sheet?.id, siteId, bootstrap.boqProjectId, bootstrap.layerOptions]);

  const projectItemsQuery = useQuery({
    queryKey: ["/api/level-sheets/bootstrap", siteId, form.boqProjectId],
    queryFn: () => getJson(`/api/level-sheets/bootstrap?siteId=${siteId}${form.boqProjectId ? `&boqProjectId=${form.boqProjectId}` : ""}`),
    enabled: siteId > 0 && !!form.boqProjectId,
  });
  const projectData = projectItemsQuery.data;
  const items = projectData?.items ?? (Number(form.boqProjectId) === Number(bootstrap.boqProjectId) ? bootstrap.items : []);
  const layerOptions = [...new Set([
    ...(projectData?.layerOptions ?? bootstrap.layerOptions),
    form.layerName,
  ].filter(Boolean))];
  const staff = useMemo(() => {
    const all = [...bootstrap.personnel];
    for (const person of sheet?.staff ?? []) {
      if (!all.some(active => Number(active.id) === Number(person.id))) all.push(person);
    }
    return all;
  }, [bootstrap.personnel, sheet?.staff]);

  const designQuery = useQuery({
    queryKey: ["/api/level-sheets/design", siteId, form.layerName],
    queryFn: () => getJson(`/api/level-sheets/design?siteId=${siteId}&layerName=${encodeURIComponent(form.layerName)}`),
    enabled: siteId > 0 && !!form.layerName,
  });
  const designRows = designQuery.data?.rows ?? [];
  const calc = useMemo(() => calculateLevelSheet({
    designRows,
    readings: form.readings,
    mode: form.readingMode,
    tbmRl: numberOrNull(form.tbmRl),
    backsight: numberOrNull(form.initialBackSight),
    closingForesight: numberOrNull(form.closingForeSight),
    toleranceAboveMm: Number(form.toleranceAboveMm || 0),
    toleranceBelowMm: Number(form.toleranceBelowMm || 0),
  }), [designRows, form.readings, form.readingMode, form.tbmRl, form.initialBackSight, form.closingForeSight, form.toleranceAboveMm, form.toleranceBelowMm]);
  const volumeByChainage = useMemo(() => new Map(calc.sections.slice(0, -1).map((section, index) => {
    const next = calc.sections[index + 1];
    const lengthM = Math.abs(next.chainageOursKm - section.chainageOursKm) * 1000;
    if (lengthM <= 0 || section.cutAreaSqm == null || next.cutAreaSqm == null
        || section.fillAreaSqm == null || next.fillAreaSqm == null) return [section.chainageOursKm, null] as const;
    return [section.chainageOursKm, {
      cut: (section.cutAreaSqm + next.cutAreaSqm) / 2 * lengthM,
      fill: (section.fillAreaSqm + next.fillAreaSqm) / 2 * lengthM,
    }] as const;
  })), [calc.sections]);

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/level-sheets/site-settings", { siteId, ...settings });
      return response.json();
    },
    onSuccess: async saved => {
      setSettings({ bookChainageSystem: saved.bookChainageSystem, consultantOffsetM: Number(saved.consultantOffsetM) });
      setSettingsSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["/api/level-sheets/bootstrap", siteId] });
      toast({ title: "Chainage settings saved" });
    },
    onError: error => toast({ title: "Could not save chainage settings", description: error.message, variant: "destructive" }),
  });

  const selectedSite = bootstrap.sites.find(site => Number(site.id) === siteId);
  const projectOptions = bootstrap.projects.filter(project => Number(project.siteId) === siteId);
  const sheetCanSave = sheetId == null ? canCreate : canEdit;
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));
  const toggleStaff = (personId: number) => setForm(current => ({
    ...current,
    personnelIds: current.personnelIds.includes(personId)
      ? current.personnelIds.filter(id => id !== personId)
      : [...current.personnelIds, personId],
  }));
  const save = (status: "draft" | "saved") => {
    const numericField = (value: string) => numberOrNull(value);
    const readings = form.readings.map(row => ({
      ...row,
      points: row.points.map(point => ({ ...point, value: point.value == null ? null : Number(point.value) })),
    }));
    onSave({
      ...form,
      siteId,
      boqProjectId: form.boqProjectId || null,
      boqItemId: form.boqItemId || null,
      toleranceAboveMm: numericField(form.toleranceAboveMm),
      toleranceBelowMm: numericField(form.toleranceBelowMm),
      allowedClosingErrorMm: numericField(form.allowedClosingErrorMm),
      tbmRl: numericField(form.tbmRl),
      initialBackSight: numericField(form.initialBackSight),
      closingForeSight: numericField(form.closingForeSight),
      readings,
      status,
    });
  };

  if (loadingSheet) return <Card><CardContent className="p-8 text-center">Loading level sheet…</CardContent></Card>;
  if (sheetError) return <Card><CardContent className="space-y-4 p-6"><p role="alert" className="text-destructive">{sheetError}</p><Button variant="outline" onClick={onBack}>Back to list</Button></CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Back to level sheets" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div><h2 className="text-xl font-semibold">{sheetId ? "Level sheet" : "New level sheet"}</h2><p className="text-sm text-muted-foreground">{selectedSite?.name?.toLocaleUpperCase("en")}</p></div>
        </div>
        <div className="flex gap-2">
          {sheetCanSave && <Button variant="outline" onClick={() => save("draft")} disabled={saving}><Save className="mr-2 h-4 w-4" /> Save draft</Button>}
          {sheetCanSave && <Button onClick={() => save("saved")} disabled={saving}><Save className="mr-2 h-4 w-4" /> Save levels</Button>}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Level sheet details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm"><span>BOQ project (optional)</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={form.boqProjectId} onChange={event => setForm(current => ({ ...current, boqProjectId: event.target.value, boqItemId: "" }))} disabled={!sheetCanSave}>
              <option value="">No BOQ project</option>{projectOptions.map(project => <option key={project.id} value={String(project.id)}>{project.name.toLocaleUpperCase("en")}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>BOQ item (optional)</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={form.boqItemId} onChange={event => setField("boqItemId", event.target.value)} disabled={!sheetCanSave || !form.boqProjectId}>
              <option value="">No BOQ item</option>{items.map((item: any) => <option key={item.id} value={String(item.id)}>{displayItem(item)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Levels of</span>
            <input list={`level-layers-${siteId}`} className="h-10 w-full rounded-md border bg-background px-3" value={form.layerName} onChange={event => setField("layerName", event.target.value)} disabled={!sheetCanSave} />
            <datalist id={`level-layers-${siteId}`}>{layerOptions.map(layer => <option key={layer} value={layer} />)}</datalist>
          </label>
          <label className="space-y-1 text-sm"><span>Date</span><Input type="date" value={form.sheetDate} onChange={event => setField("sheetDate", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Instrument</span><Input value={form.instrument} onChange={event => setField("instrument", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Tolerance above (mm)</span><Input inputMode="decimal" value={form.toleranceAboveMm} onChange={event => setField("toleranceAboveMm", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Tolerance below (mm)</span><Input inputMode="decimal" value={form.toleranceBelowMm} onChange={event => setField("toleranceBelowMm", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Allowed closing error (mm)</span><Input inputMode="decimal" value={form.allowedClosingErrorMm} onChange={event => setField("allowedClosingErrorMm", event.target.value)} disabled={!sheetCanSave} /></label>
          <div className="space-y-1 text-sm sm:col-span-2 lg:col-span-4">
            <span className="font-medium">Who did it (site staff)</span>
            {staff.length === 0 ? <p className="text-xs text-muted-foreground">No active personnel are available at this site.</p> : (
              <div className="flex flex-wrap gap-2">
                {staff.map(person => <label key={person.id} className={`flex items-center gap-2 rounded border px-2 py-1 ${Number(person.isActive) !== 1 ? "opacity-70" : ""}`}>
                  <input type="checkbox" checked={form.personnelIds.includes(Number(person.id))} onChange={() => toggleStaff(Number(person.id))} disabled={!sheetCanSave} />
                  <span>{String(person.name).toLocaleUpperCase("en")}{Number(person.isActive) !== 1 ? " · inactive" : ""}</span>
                </label>)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Chainage settings</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm"><span>Consultant chainage format</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={settings.bookChainageSystem} onChange={event => {
              setSettings(current => ({ ...current, bookChainageSystem: event.target.value as BookChainageSystem }));
              setSettingsSaved(false);
            }} disabled={!canEdit}>
              <option value="ours">Ours</option><option value="consultant">Consultant</option>
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Consultant offset (m)</span>
            <Input inputMode="decimal" value={String(settings.consultantOffsetM)} onChange={event => {
              const value = numberOrNull(event.target.value);
              if (value != null) setSettings(current => ({ ...current, consultantOffsetM: value }));
              setSettingsSaved(false);
            }} disabled={!canEdit || settings.bookChainageSystem !== "consultant"} />
          </label>
          {canEdit && <Button variant="outline" onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>Save settings</Button>}
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Ours and consultant chainages are shown together. Example: {formatChainagePair(2.6, settings.bookChainageSystem, Number(settings.consultantOffsetM))}.
            {settingsSaved ? " Settings saved." : ""}
          </p>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="design" className="whitespace-normal py-2">1. Design levels</TabsTrigger>
          <TabsTrigger value="readings" className="whitespace-normal py-2">2. Readings</TabsTrigger>
          <TabsTrigger value="results" className="whitespace-normal py-2">3. Results &amp; quantities</TabsTrigger>
        </TabsList>
        <TabsContent value="design">
          <Card><CardContent className="p-4">
            <DesignLevelsTab siteId={siteId} layerName={form.layerName} settings={settings} canCreate={canCreate} canEdit={canEdit} />
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="readings">
          <Card><CardContent className="p-4">
            <ReadingsTab
              resetKey={resetKey}
              rows={form.readings}
              onRowsChange={rows => setField("readings", rows)}
              mode={form.readingMode}
              onModeChange={mode => setField("readingMode", mode)}
              designRows={designRows}
              settings={settings}
              header={{ tbmName: form.tbmName, tbmRl: form.tbmRl, initialBackSight: form.initialBackSight, closingForeSight: form.closingForeSight }}
              onHeaderChange={header => setForm(current => ({ ...current, ...header }))}
              toleranceAboveMm={Number(form.toleranceAboveMm || 0)}
              toleranceBelowMm={Number(form.toleranceBelowMm || 0)}
              allowedClosingErrorMm={Number(form.allowedClosingErrorMm || 0)}
              readOnly={!sheetCanSave}
            />
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="results">
          <Card><CardHeader><CardTitle>Results and quantities</CardTitle></CardHeader><CardContent className="space-y-4">
            {calc.sections.length === 0 ? <p className="text-sm text-muted-foreground">Enter readings to calculate levels and quantities.</p> : (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <p>Closing error: <strong>{calc.closingErrorMm == null ? "—" : `${Math.round(calc.closingErrorMm)} mm`}</strong></p>
                  <p>Volume: <strong>{calc.volumeSegments ? `${(calc.cutVolumeCum + calc.fillVolumeCum).toFixed(3)} m³` : "—"}</strong></p>
                  <p>Cut: <strong>{calc.volumeSegments ? `${calc.cutVolumeCum.toFixed(3)} m³` : "—"}</strong></p>
                  <p>Fill: <strong>{calc.volumeSegments ? `${calc.fillVolumeCum.toFixed(3)} m³` : "—"}</strong></p>
                </div>
                <div className="overflow-x-auto rounded border">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead><tr className="border-b bg-muted/30 text-left text-xs">
                      <th className="p-2">Chainage (ours · consultant)</th><th className="p-2">Cut area (m²)</th><th className="p-2">Fill area (m²)</th>
                      <th className="p-2">Cut volume (m³)</th><th className="p-2">Fill volume (m³)</th><th className="p-2">Result</th>
                    </tr></thead>
                    <tbody>{calc.sections.map(section => {
                      const volume = volumeByChainage.get(section.chainageOursKm);
                      return <tr key={section.chainageOursKm} className="border-b">
                      <td className="p-2">{formatChainagePair(section.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}</td>
                      <td className="p-2">{section.cutAreaSqm == null ? "—" : section.cutAreaSqm.toFixed(3)}</td>
                      <td className="p-2">{section.fillAreaSqm == null ? "—" : section.fillAreaSqm.toFixed(3)}</td>
                      <td className="p-2">{volume == null ? "—" : volume.cut.toFixed(3)}</td>
                      <td className="p-2">{volume == null ? "—" : volume.fill.toFixed(3)}</td>
                      <td className="p-2 font-semibold">{section.status ?? "—"}</td>
                    </tr>;
                    })}</tbody>
                  </table>
                </div>
                {calc.uncalculatedSections.length > 0 && <p className="text-sm text-muted-foreground">
                  Sections without two neighbouring valid cross-sections: {calc.uncalculatedSections.map(value => formatChainage(value)).join(", ")}
                </p>}
              </>
            )}
            {designQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load design levels: {(designQuery.error as Error).message}</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
