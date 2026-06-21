import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ChevronRight, FileSpreadsheet, Settings2, Loader2, Truck,
  MapPin, CalendarDays, AlertCircle, Link2, Trash2, Plus,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { BoqProject, BoqMixTemplateLink } from "@shared/schema";
import { WORKING_DAYS_DEFAULT, WORKING_HRS_DEFAULT } from "@shared/planningEngine";

// ─── Zod Schema ──────────────────────────────────────────────────────────────

const formSchema = z.object({
  workingDaysPerMonth: z.coerce.number().int().min(1).max(31),
  workingHoursPerDay: z.coerce.number().min(1).max(24),
  doubleShift: z.boolean(),
  tipperCapacityT: z.coerce.number().min(0.5).max(500),
  avgTipperSpeedKmHr: z.coerce.number().min(1).max(200),
  loadTimeMin: z.coerce.number().min(0).max(120),
  unloadTimeMin: z.coerce.number().min(0).max(120),
  hmpChainageKm: z.coerce.number().min(0).nullable().optional(),
  wmmPlantChainageKm: z.coerce.number().min(0).nullable().optional(),
  quarryChainageKm: z.coerce.number().min(0).nullable().optional(),
  borrowChainageKm: z.coerce.number().min(0).nullable().optional(),
  disposalChainageKm: z.coerce.number().min(0).nullable().optional(),
  rmcChainageKm: z.coerce.number().min(0).nullable().optional(),
  productivityMode: z.enum(["default", "custom"]),
});

type FormValues = z.infer<typeof formSchema>;

interface ProgramSettings extends FormValues {
  id: number | null;
  projectId: number;
  updatedAt: string | null;
}

// ─── Mix Template type for links ─────────────────────────────────────────────

interface PlanningMixTemplate { id: number; name: string; mixType: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function numOrNull(v: string) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ icon, title, subtitle, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </div>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

// ─── Mix Links section ────────────────────────────────────────────────────────

function MixLinksSection({ projectId, boqItems }: {
  projectId: number;
  boqItems: { id: number; description: string; itemCode: string | null }[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addItemId, setAddItemId] = useState("");
  const [addTemplateId, setAddTemplateId] = useState("");
  const [addLinkType, setAddLinkType] = useState<"primary" | "alternate">("primary");

  const { data: links = [], isLoading: linksLoading } = useQuery<BoqMixTemplateLink[]>({
    queryKey: ["/api/boq/projects", projectId, "mix-links"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/mix-links`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const { data: mixTemplates = [] } = useQuery<PlanningMixTemplate[]>({
    queryKey: ["/api/planning/mix-templates"],
    queryFn: async () => {
      const res = await fetch("/api/planning/mix-templates", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    staleTime: 120_000,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const tpl = mixTemplates.find(t => String(t.id) === addTemplateId);
      return apiRequest("POST", `/api/boq/projects/${projectId}/mix-links`, {
        boqItemId: parseInt(addItemId),
        mixTemplateId: parseInt(addTemplateId),
        mixTemplateName: tpl?.name ?? null,
        linkType: addLinkType,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "mix-links"] });
      setAddItemId(""); setAddTemplateId(""); setAddLinkType("primary");
      toast({ title: "Mix link added" });
    },
    onError: () => toast({ title: "Failed to add link", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/boq/projects/${projectId}/mix-links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "mix-links"] }),
  });

  return (
    <SectionCard
      icon={<Link2 className="w-4 h-4 text-violet-600" />}
      title="Mix Template Links"
      subtitle="Link BOQ items to plant mix templates so the planning engine can cross-reference production capacity."
    >
      {linksLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-1">No mix links yet.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {links.map(link => {
            const item = boqItems.find(i => i.id === link.boqItemId);
            return (
              <div key={link.id}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                <span className="font-medium text-slate-700 min-w-0 truncate flex-1">
                  {item ? (item.itemCode ? `[${item.itemCode}] ` : "") + item.description : `Item #${link.boqItemId}`}
                </span>
                <span className="text-muted-foreground mx-1">→</span>
                <span className="text-violet-700 font-medium">{link.mixTemplateName ?? `Template #${link.mixTemplateId}`}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                  link.linkType === "primary" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"
                }`}>{link.linkType}</span>
                <button
                  onClick={() => deleteMutation.mutate(link.id)}
                  disabled={deleteMutation.isPending}
                  className="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                  data-testid={`button-delete-mix-link-${link.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new link */}
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground">Add Link</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">BOQ ITEM</Label>
            <Select value={addItemId} onValueChange={setAddItemId}>
              <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-mix-link-item">
                <SelectValue placeholder="Select item…" />
              </SelectTrigger>
              <SelectContent>
                {boqItems.map(i => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.itemCode ? `[${i.itemCode}] ` : ""}{i.description.slice(0, 40)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">MIX TEMPLATE</Label>
            <Select value={addTemplateId} onValueChange={setAddTemplateId}>
              <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-mix-link-template">
                <SelectValue placeholder="Select template…" />
              </SelectTrigger>
              <SelectContent>
                {mixTemplates.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} ({t.mixType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">LINK TYPE</Label>
            <Select value={addLinkType} onValueChange={v => setAddLinkType(v as "primary" | "alternate")}>
              <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-mix-link-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="alternate">Alternate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              className="h-8 text-xs w-full"
              onClick={() => createMutation.mutate()}
              disabled={!addItemId || !addTemplateId || createMutation.isPending}
              data-testid="button-add-mix-link"
            >
              {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
              Add Link
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BoqProgramSettings() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const { data: project, isLoading: projectLoading } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<ProgramSettings>({
    queryKey: ["/api/boq/projects", projectId, "program-settings"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/program-settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: boqItems = [] } = useQuery<{ id: number; description: string; itemCode: string | null }[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !isNaN(projectId),
    staleTime: 60_000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      workingDaysPerMonth: WORKING_DAYS_DEFAULT,
      workingHoursPerDay: WORKING_HRS_DEFAULT,
      doubleShift: false,
      tipperCapacityT: 8,
      avgTipperSpeedKmHr: 30,
      loadTimeMin: 5,
      unloadTimeMin: 5,
      hmpChainageKm: null,
      wmmPlantChainageKm: null,
      quarryChainageKm: null,
      borrowChainageKm: null,
      disposalChainageKm: null,
      rmcChainageKm: null,
      productivityMode: "default",
    },
  });

  // Populate form once settings loads (only once)
  const [formPopulated, setFormPopulated] = useState(false);
  if (settings && !formPopulated) {
    form.reset({
      workingDaysPerMonth: settings.workingDaysPerMonth,
      workingHoursPerDay: settings.workingHoursPerDay,
      doubleShift: settings.doubleShift === 1,
      tipperCapacityT: settings.tipperCapacityT,
      avgTipperSpeedKmHr: settings.avgTipperSpeedKmHr,
      loadTimeMin: settings.loadTimeMin,
      unloadTimeMin: settings.unloadTimeMin,
      hmpChainageKm: settings.hmpChainageKm ?? null,
      wmmPlantChainageKm: settings.wmmPlantChainageKm ?? null,
      quarryChainageKm: settings.quarryChainageKm ?? null,
      borrowChainageKm: settings.borrowChainageKm ?? null,
      disposalChainageKm: settings.disposalChainageKm ?? null,
      rmcChainageKm: settings.rmcChainageKm ?? null,
      productivityMode: (settings.productivityMode as "default" | "custom") ?? "default",
    });
    setFormPopulated(true);
  }

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiRequest("PUT", `/api/boq/projects/${projectId}/program-settings`, {
        ...data,
        doubleShift: data.doubleShift ? 1 : 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "program-settings"] });
      setSavedAt(new Date());
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  // Autosave on blur — triggers save if form is dirty and valid
  const handleBlurSave = useCallback(() => {
    if (!form.formState.isDirty) return;
    form.handleSubmit((data) => saveMutation.mutate(data))();
  }, [form, saveMutation]);

  const isLoading = projectLoading || settingsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading settings…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20 space-y-4">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto" />
        <p className="text-slate-600">Project not found.</p>
        <Link href="/work-program">
          <a><Button variant="outline">← Back to Projects</Button></a>
        </Link>
      </div>
    );
  }

  const vals = form.watch();

  return (
    <Form {...form}>
      <div className="space-y-5 max-w-2xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/work-program">
            <a className="hover:text-slate-700 transition-colors flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Work Program &amp; BOQ
            </a>
          </Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <Link href={`/work-program/${projectId}`}>
            <a className="hover:text-slate-700 transition-colors truncate max-w-[180px]">{project.name}</a>
          </Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-slate-700 font-medium">Program Settings</span>
        </nav>

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">Program Settings</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{project.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {saveMutation.isPending && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </span>
            )}
          </div>
        </div>

        {/* Schedule Defaults */}
        <SectionCard
          icon={<CalendarDays className="w-4 h-4 text-blue-600" />}
          title="Schedule Defaults"
          subtitle="Auto-duration = (BOQ qty ÷ bottleneck output) ÷ hrs/day ÷ days/month"
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="workingDaysPerMonth" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">WORKING DAYS / MONTH</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="31" step="1" className="h-9"
                    placeholder={String(WORKING_DAYS_DEFAULT)}
                    {...field}
                    onBlur={() => { field.onBlur(); handleBlurSave(); }}
                    data-testid="input-working-days"
                  />
                </FormControl>
                <FormDescription className="text-[10px]">Default: {WORKING_DAYS_DEFAULT} days/month</FormDescription>
              </FormItem>
            )} />
            <FormField control={form.control} name="workingHoursPerDay" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">WORKING HOURS / DAY</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="24" step="0.5" className="h-9"
                    placeholder={String(WORKING_HRS_DEFAULT)}
                    {...field}
                    onBlur={() => { field.onBlur(); handleBlurSave(); }}
                    data-testid="input-working-hours"
                  />
                </FormControl>
                <FormDescription className="text-[10px]">Default: {WORKING_HRS_DEFAULT} hrs/day</FormDescription>
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="doubleShift" render={({ field }) => (
            <FormItem className="flex items-center gap-3 mt-3 rounded-md border border-slate-200 px-3 py-2">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={(v) => { field.onChange(v); handleBlurSave(); }}
                  data-testid="switch-double-shift"
                />
              </FormControl>
              <div>
                <FormLabel className="text-xs font-semibold text-slate-700">Double Shift</FormLabel>
                <FormDescription className="text-[10px]">
                  Enables 2× effective hours per day in duration calculations.
                </FormDescription>
              </div>
            </FormItem>
          )} />
        </SectionCard>

        {/* Tipper Fleet Defaults */}
        <SectionCard
          icon={<Truck className="w-4 h-4 text-amber-600" />}
          title="Tipper Fleet Defaults"
          subtitle="Pre-populates the tipper fleet calculator in BOQ item equipment recipes."
        >
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: "tipperCapacityT" as const, label: "TIPPER CAPACITY (T)", placeholder: "8", step: "0.5", testId: "input-tipper-capacity" },
              { name: "avgTipperSpeedKmHr" as const, label: "AVG SPEED (km/hr)", placeholder: "30", step: "1", testId: "input-tipper-speed" },
              { name: "loadTimeMin" as const, label: "LOAD TIME (min)", placeholder: "5", step: "1", testId: "input-load-time" },
              { name: "unloadTimeMin" as const, label: "UNLOAD TIME (min)", placeholder: "5", step: "1", testId: "input-unload-time" },
            ].map(({ name, label, placeholder, step, testId }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{label}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step={step} className="h-9 mt-0.5"
                      placeholder={placeholder}
                      {...field}
                      value={field.value ?? ""}
                      onBlur={() => { field.onBlur(); handleBlurSave(); }}
                      data-testid={testId}
                    />
                  </FormControl>
                </FormItem>
              )} />
            ))}
          </div>
        </SectionCard>

        {/* Source Chainages */}
        <SectionCard
          icon={<MapPin className="w-4 h-4 text-rose-600" />}
          title="Source Chainages"
          subtitle="Distance from mid-project to each supply source. Used to auto-compute haul distance by layer type."
        >
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: "hmpChainageKm" as const, label: "HMP CHAINAGE (km)", hint: "Bituminous items → HMP", testId: "input-hmp-chainage" },
              { name: "wmmPlantChainageKm" as const, label: "WMM PLANT CHAINAGE (km)", hint: "Granular/Plant items", testId: "input-wmm-chainage" },
              { name: "quarryChainageKm" as const, label: "QUARRY CHAINAGE (km)", hint: "Granular/Quarry items", testId: "input-quarry-chainage" },
              { name: "borrowChainageKm" as const, label: "BORROW PIT CHAINAGE (km)", hint: "Earthwork fill items", testId: "input-borrow-chainage" },
              { name: "disposalChainageKm" as const, label: "DISPOSAL SITE CHAINAGE (km)", hint: "Earthwork cut items", testId: "input-disposal-chainage" },
              { name: "rmcChainageKm" as const, label: "RMC PLANT CHAINAGE (km)", hint: "Concrete structure items", testId: "input-rmc-chainage" },
            ].map(({ name, label, hint, testId }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{label}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.1" className="h-9 mt-0.5"
                      placeholder="km"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                      onBlur={() => { field.onBlur(); handleBlurSave(); }}
                      data-testid={testId}
                    />
                  </FormControl>
                  <FormDescription className="text-[10px]">{hint}</FormDescription>
                </FormItem>
              )} />
            ))}
          </div>

          {/* Haul distance preview */}
          <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Auto-detect logic (layer type → source)</p>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              {[
                { label: "Bituminous", val: vals.hmpChainageKm },
                { label: "Granular/Plant", val: vals.wmmPlantChainageKm },
                { label: "Granular/Quarry", val: vals.quarryChainageKm },
                { label: "Earthwork Fill", val: vals.borrowChainageKm },
                { label: "Earthwork Cut", val: vals.disposalChainageKm },
                { label: "Concrete", val: vals.rmcChainageKm },
              ].map(({ label, val }) => (
                <div key={label} className="rounded border border-slate-200 bg-white py-1.5 px-1">
                  <p className="text-[9px] text-muted-foreground">{label}</p>
                  <p className="font-bold text-slate-700 mt-0.5">
                    {val != null ? `${val} km` : "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Productivity Mode */}
        <SectionCard
          icon={<Settings2 className="w-4 h-4 text-slate-500" />}
          title="Productivity Mode"
          subtitle="Controls how equipment output rates are sourced in the planning engine."
        >
          <FormField control={form.control} name="productivityMode" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">MODE</FormLabel>
              <Select
                value={field.value}
                onValueChange={v => { field.onChange(v); form.handleSubmit(d => saveMutation.mutate(d))(); }}
              >
                <SelectTrigger className="h-9 w-60 mt-0.5" data-testid="select-productivity-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default — use standard norms</SelectItem>
                  <SelectItem value="custom">Custom — use item-level overrides</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription className="text-[10px] mt-1">
                {field.value === "custom"
                  ? "Custom mode: per-item productivity overrides take precedence over standard norms."
                  : "Default mode: uses SNL/standard productivity norms for all items."}
              </FormDescription>
            </FormItem>
          )} />
        </SectionCard>

        {/* Mix Template Links */}
        <MixLinksSection projectId={projectId} boqItems={boqItems} />

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-1">
          <Link href={`/work-program/${projectId}`}>
            <a>
              <Button variant="outline" size="sm" data-testid="button-settings-back">
                ← Back to Project
              </Button>
            </a>
          </Link>
          <Button
            className="bg-teal-700 hover:bg-teal-800 text-white"
            onClick={form.handleSubmit(d => saveMutation.mutate(d))}
            disabled={saveMutation.isPending}
            data-testid="button-save-program-settings"
          >
            {saveMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Saving…</>
              : "Save Settings"}
          </Button>
        </div>
      </div>
    </Form>
  );
}
