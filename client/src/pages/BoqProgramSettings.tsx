import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ChevronRight, FileSpreadsheet, Settings2, Loader2, Truck,
  MapPin, CalendarDays, AlertCircle, Link2, Trash2, Plus,
  CheckCircle2, BarChart2,
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

const leadDistField = z.coerce.number().min(0).nullable().optional();

const formSchema = z.object({
  projectStartDate: z.string().nullable().optional(),
  workingDaysPerMonth: z.coerce.number().int().min(1).max(31),
  shiftHours: z.coerce.number().min(1).max(24),
  doubleShift: z.boolean(),
  tipperCapacityT: z.coerce.number().min(0.5).max(500),
  avgTipperSpeedKmHr: z.coerce.number().min(1).max(200),
  loadTimeMin: z.coerce.number().min(0).max(120),
  unloadTimeMin: z.coerce.number().min(0).max(120),
  // Lead & source distances
  hmpToSiteKm: leadDistField,
  wmmPlantToSiteKm: leadDistField,
  quarryToSiteKm: leadDistField,
  quarryToHmpKm: leadDistField,
  quarryToRmcKm: leadDistField,
  rmcToSiteKm: leadDistField,
  borrowToSiteKm: leadDistField,
  disposalDistanceKm: leadDistField,
  productivityMode: z.enum(["snl", "company", "project"]),
  productivityOverrides: z.record(z.object({
    outputPerHr: z.number().optional(),
    unit: z.string().optional(),
  })).nullable().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ProgramSettings {
  id: number | null;
  projectId: number;
  projectStartDate: string | null;
  workingDaysPerMonth: number;
  shiftHours: number;
  doubleShift: boolean;
  tipperCapacityT: number;
  avgTipperSpeedKmHr: number;
  loadTimeMin: number;
  unloadTimeMin: number;
  // Lead & source distances
  hmpToSiteKm: number | null;
  wmmPlantToSiteKm: number | null;
  quarryToSiteKm: number | null;
  quarryToHmpKm: number | null;
  quarryToRmcKm: number | null;
  rmcToSiteKm: number | null;
  borrowToSiteKm: number | null;
  disposalDistanceKm: number | null;
  productivityMode: string;
  productivityOverrides: Record<string, { outputPerHr?: number; unit?: string }> | null;
  updatedAt: string | null;
}

interface PlanningMixTemplate { id: number; name: string; mixType: string; }

// Standard mix types recognised by the planning engine
const STD_MIX_TYPES = ["BC", "SDBC", "DBM", "BM", "WMM", "WBM", "GSB", "EG", "M20", "M25", "M30", "M35", "M40", "RMC"] as const;
type StdMixType = typeof STD_MIX_TYPES[number];

// Per-item-type productivity defaults (for "project" mode)
const DEFAULT_PRODUCTIVITY: Record<StdMixType, { unit: string; hint: string }> = {
  BC:    { unit: "T",   hint: "Bituminous Concrete" },
  SDBC:  { unit: "T",   hint: "Semi-Dense Bituminous Concrete" },
  DBM:   { unit: "T",   hint: "Dense Bituminous Macadam" },
  BM:    { unit: "T",   hint: "Bituminous Macadam" },
  WMM:   { unit: "CUM", hint: "Wet Mix Macadam" },
  WBM:   { unit: "CUM", hint: "Water Bound Macadam" },
  GSB:   { unit: "CUM", hint: "Granular Sub-Base" },
  EG:    { unit: "CUM", hint: "Earthwork General" },
  M20:   { unit: "CUM", hint: "Concrete M20" },
  M25:   { unit: "CUM", hint: "Concrete M25" },
  M30:   { unit: "CUM", hint: "Concrete M30" },
  M35:   { unit: "CUM", hint: "Concrete M35" },
  M40:   { unit: "CUM", hint: "Concrete M40" },
  RMC:   { unit: "CUM", hint: "Ready-Mix Concrete" },
};

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
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

// ─── Mix Links section ────────────────────────────────────────────────────────

function MixLinksSection({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addMixType, setAddMixType] = useState<string>("");
  const [addTemplateId, setAddTemplateId] = useState("");

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

  const linkedTypes = new Set(links.map(l => l.mixType));

  const createMutation = useMutation({
    mutationFn: () => {
      const tpl = mixTemplates.find(t => String(t.id) === addTemplateId);
      return apiRequest("POST", `/api/boq/projects/${projectId}/mix-links`, {
        mixType: addMixType,
        mixTemplateId: parseInt(addTemplateId),
        mixTemplateName: tpl?.name ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "mix-links"] });
      setAddMixType(""); setAddTemplateId("");
      toast({ title: "Mix link added" });
    },
    onError: () => toast({ title: "Failed to add link", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/boq/projects/${projectId}/mix-links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "mix-links"] }),
  });

  const availableTypes = STD_MIX_TYPES.filter(t => !linkedTypes.has(t));

  return (
    <SectionCard
      icon={<Link2 className="w-4 h-4 text-violet-600" />}
      title="Mix Template Links"
      subtitle="Map standard layer types (BC/DBM/WMM…) to plant mix templates. The planning engine uses these to resolve material demand and production capacity per layer."
    >
      {linksLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-1">No mix links set. Add links below to enable material demand cross-referencing.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {links.map(link => (
            <div key={link.id}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
              data-testid={`mix-link-row-${link.id}`}>
              <span className="font-mono font-bold text-violet-700 w-14 flex-shrink-0">{link.mixType}</span>
              <span className="text-muted-foreground text-[12px]">→</span>
              <span className="text-slate-700 flex-1 min-w-0 truncate">{link.mixTemplateName ?? `Template #${link.mixTemplateId}`}</span>
              <button
                onClick={() => deleteMutation.mutate(link.id)}
                disabled={deleteMutation.isPending}
                className="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                data-testid={`button-delete-mix-link-${link.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new link */}
      {availableTypes.length > 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Mix Link</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[12px]">MIX TYPE</Label>
              <Select value={addMixType} onValueChange={setAddMixType}>
                <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-mix-link-type">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map(t => (
                    <SelectItem key={t} value={t}>
                      <span className="font-mono font-semibold">{t}</span>
                      <span className="text-muted-foreground text-[12px] ml-1.5">
                        {DEFAULT_PRODUCTIVITY[t as StdMixType]?.hint}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">PLANT MIX TEMPLATE</Label>
              <Select value={addTemplateId} onValueChange={setAddTemplateId}>
                <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-mix-link-template">
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
            <div className="col-span-2 flex justify-end">
              <Button
                size="sm"
                className="h-8 text-sm"
                onClick={() => createMutation.mutate()}
                disabled={!addMixType || !addTemplateId || createMutation.isPending}
                data-testid="button-add-mix-link"
              >
                {createMutation.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  : <Plus className="w-3 h-3 mr-1" />}
                Add Link
              </Button>
            </div>
          </div>
        </div>
      )}
      {availableTypes.length === 0 && links.length > 0 && (
        <p className="text-xs text-emerald-600 mt-1">All standard mix types are linked.</p>
      )}
    </SectionCard>
  );
}

// ─── Plant-level productivity inputs (HMP / WMM / RMC) ───────────────────────
// Replaces the old per-mix-type table. Three plant-level outputs cover all layer types:
//   HMP   → Bituminous: BC, DBM, BM, SDBC  (T/hr)
//   WMM   → Granular: WMM, GSB, WBM        (CUM/hr)
//   RMC   → Concrete: M20, M25, M30, M35   (CUM/hr)

const PLANT_PRODUCTIVITY_DEFS = [
  {
    key: "HMP",
    label: "HMP Productivity",
    sublabel: "Hot Mix Plant — BC / DBM / BM / SDBC",
    unit: "T/hr",
    placeholder: "e.g. 100",
    color: "amber",
  },
  {
    key: "WMM",
    label: "WMM / Granular Productivity",
    sublabel: "WMM Plant or Direct — WMM / GSB / WBM",
    unit: "CUM/hr",
    placeholder: "e.g. 50",
    color: "teal",
  },
  {
    key: "RMC",
    label: "RMC Productivity",
    sublabel: "Ready-Mix Concrete — M20 / M25 / M30 / M35",
    unit: "CUM/hr",
    placeholder: "e.g. 20",
    color: "blue",
  },
] as const;

function ProductivityOverridesSection({
  overrides,
  onChange,
}: {
  overrides: Record<string, { outputPerHr?: number; unit?: string }> | null | undefined;
  onChange: (v: Record<string, { outputPerHr?: number; unit?: string }>) => void;
}) {
  const current = overrides ?? {};

  function updatePlant(key: string, unit: string, rawVal: string) {
    const val = parseFloat(rawVal);
    const updated = {
      ...current,
      [key]: {
        outputPerHr: isNaN(val) ? undefined : val,
        unit,
      },
    };
    onChange(updated);
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        Plant Output Rates (override SNL norms when mode = Project)
      </p>
      <div className="grid grid-cols-3 gap-3">
        {PLANT_PRODUCTIVITY_DEFS.map(({ key, label, sublabel, unit, placeholder, color }) => (
          <div key={key} className={`rounded-lg border p-3 space-y-1.5 ${
            color === "amber" ? "border-amber-200 bg-amber-50/40" :
            color === "teal"  ? "border-teal-200 bg-teal-50/40" :
                                "border-blue-200 bg-blue-50/40"
          }`}>
            <p className={`text-[12px] font-bold uppercase tracking-wide ${
              color === "amber" ? "text-amber-700" :
              color === "teal"  ? "text-teal-700" :
                                  "text-blue-700"
            }`}>{label}</p>
            <p className="text-[12px] text-muted-foreground leading-tight">{sublabel}</p>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min="0"
                step="1"
                className="h-8 text-sm flex-1"
                placeholder={placeholder}
                value={current[key]?.outputPerHr ?? ""}
                onChange={e => updatePlant(key, unit.split("/")[0], e.target.value)}
                data-testid={`input-output-${key.toLowerCase()}`}
              />
              <span className="text-[12px] text-muted-foreground whitespace-nowrap">{unit}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        Leave blank to fall back to SNL standard norms. Values here apply only when Productivity Mode is "Project".
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BoqProgramSettings() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [formPopulated, setFormPopulated] = useState(false);

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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectStartDate: null,
      workingDaysPerMonth: WORKING_DAYS_DEFAULT,
      shiftHours: WORKING_HRS_DEFAULT,
      doubleShift: false,
      tipperCapacityT: 8,
      avgTipperSpeedKmHr: 30,
      loadTimeMin: 5,
      unloadTimeMin: 5,
      hmpToSiteKm: null,
      wmmPlantToSiteKm: null,
      quarryToSiteKm: null,
      quarryToHmpKm: null,
      quarryToRmcKm: null,
      rmcToSiteKm: null,
      borrowToSiteKm: null,
      disposalDistanceKm: null,
      productivityMode: "snl",
      productivityOverrides: null,
    },
  });

  // Populate form once settings loads (only once — preserves subsequent user edits)
  if (settings && !formPopulated) {
    form.reset({
      projectStartDate: settings.projectStartDate ?? project?.startDate ?? null,
      workingDaysPerMonth: settings.workingDaysPerMonth,
      shiftHours: settings.shiftHours,
      doubleShift: Boolean(settings.doubleShift),
      tipperCapacityT: settings.tipperCapacityT,
      avgTipperSpeedKmHr: settings.avgTipperSpeedKmHr,
      loadTimeMin: settings.loadTimeMin,
      unloadTimeMin: settings.unloadTimeMin,
      hmpToSiteKm: settings.hmpToSiteKm ?? null,
      wmmPlantToSiteKm: settings.wmmPlantToSiteKm ?? null,
      quarryToSiteKm: settings.quarryToSiteKm ?? null,
      quarryToHmpKm: settings.quarryToHmpKm ?? null,
      quarryToRmcKm: settings.quarryToRmcKm ?? null,
      rmcToSiteKm: settings.rmcToSiteKm ?? null,
      borrowToSiteKm: settings.borrowToSiteKm ?? null,
      disposalDistanceKm: settings.disposalDistanceKm ?? null,
      productivityMode: (settings.productivityMode as "snl" | "company" | "project") ?? "snl",
      productivityOverrides: settings.productivityOverrides ?? null,
    });
    setFormPopulated(true);
  }

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiRequest("PUT", `/api/boq/projects/${projectId}/program-settings`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boq/projects", projectId, "program-settings"] });
      setSavedAt(new Date());
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  // Autosave on blur — only fires if form has unsaved changes
  const handleBlurSave = useCallback(() => {
    if (!form.formState.isDirty) return;
    form.handleSubmit(data => saveMutation.mutate(data))();
  }, [form, saveMutation]);

  const isLoading = projectLoading || settingsLoading;
  const vals = form.watch();

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

  return (
    <Form {...form}>
      <div className="space-y-5 max-w-2xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/work-program">
            <a className="hover:text-slate-700 transition-colors flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Work Program &amp; BOQ
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
              <p className="text-sm text-muted-foreground mt-0.5">{project.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {saveMutation.isPending && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </span>
            )}
          </div>
        </div>

        {/* ── 1. Schedule Defaults ─────────────────────────────────────────── */}
        <SectionCard
          icon={<CalendarDays className="w-4 h-4 text-blue-600" />}
          title="Schedule Defaults"
          subtitle="Auto-duration = (BOQ qty ÷ bottleneck output) ÷ shift hrs/day ÷ working days/month"
        >
          <FormField control={form.control} name="projectStartDate" render={({ field }) => (
            <FormItem className="mb-4">
              <FormLabel className="text-sm">PROJECT START DATE</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  className="h-9 w-auto"
                  value={field.value ?? ""}
                  onChange={e => field.onChange(e.target.value || null)}
                  onBlur={() => { field.onBlur(); handleBlurSave(); }}
                  data-testid="input-project-start-date"
                />
              </FormControl>
              <FormDescription className="text-[12px]">
                Sets the calendar date for Month 1 in the Work Programme Gantt — month headers show real month names (e.g. "Jun '25")
              </FormDescription>
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="workingDaysPerMonth" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm">WORKING DAYS / MONTH</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="31" step="1" className="h-9"
                    placeholder={String(WORKING_DAYS_DEFAULT)}
                    {...field}
                    onBlur={() => { field.onBlur(); handleBlurSave(); }}
                    data-testid="input-working-days"
                  />
                </FormControl>
                <FormDescription className="text-[12px]">Default: {WORKING_DAYS_DEFAULT} days/month</FormDescription>
              </FormItem>
            )} />
            <FormField control={form.control} name="shiftHours" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm">SHIFT HOURS / DAY</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="24" step="0.5" className="h-9"
                    placeholder={String(WORKING_HRS_DEFAULT)}
                    {...field}
                    onBlur={() => { field.onBlur(); handleBlurSave(); }}
                    data-testid="input-shift-hours"
                  />
                </FormControl>
                <FormDescription className="text-[12px]">Default: {WORKING_HRS_DEFAULT} hrs/shift</FormDescription>
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="doubleShift" render={({ field }) => (
            <FormItem className="flex items-center gap-3 mt-3 rounded-md border border-slate-200 px-3 py-2">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={v => { field.onChange(v); form.handleSubmit(d => saveMutation.mutate(d))(); }}
                  data-testid="switch-double-shift"
                />
              </FormControl>
              <div>
                <FormLabel className="text-sm font-semibold text-slate-700">Double Shift</FormLabel>
                <FormDescription className="text-[12px]">
                  Enables 2× effective hours per day — duration calculations use shift hrs × 2.
                </FormDescription>
              </div>
            </FormItem>
          )} />
        </SectionCard>

        {/* ── 2. Tipper Fleet Defaults ─────────────────────────────────────── */}
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
                  <FormLabel className="text-sm">{label}</FormLabel>
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

        {/* ── 3. Lead & Source Distances ────────────────────────────────────── */}
        <SectionCard
          icon={<MapPin className="w-4 h-4 text-rose-600" />}
          title="Lead & Source Distances"
          subtitle="Point-to-point distances between supply sources and destinations. The planning engine uses these to compute haul cycles and tipper demand per layer type."
        >
          {/* Bituminous group */}
          <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2 mt-1">Bituminous</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { name: "hmpToSiteKm" as const, label: "HMP → SITE (km)", hint: "BC / DBM / BM / SDBC layer haul", testId: "input-hmp-to-site" },
              { name: "quarryToHmpKm" as const, label: "QUARRY/CRUSHER → HMP (km)", hint: "Aggregate transport to hot mix plant", testId: "input-quarry-to-hmp" },
            ].map(({ name, label, hint, testId }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{label}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.1" className="h-9 mt-0.5"
                      placeholder="km"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                      onBlur={() => { field.onBlur(); handleBlurSave(); }}
                      data-testid={testId}
                    />
                  </FormControl>
                  <FormDescription className="text-[12px]">{hint}</FormDescription>
                </FormItem>
              )} />
            ))}
          </div>

          {/* Granular / WMM group */}
          <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Granular / WMM</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { name: "wmmPlantToSiteKm" as const, label: "WMM PLANT → SITE (km)", hint: "WMM / GSB plant-mix haul to site", testId: "input-wmm-plant-to-site" },
              { name: "quarryToSiteKm" as const, label: "QUARRY/CRUSHER → SITE (km)", hint: "Granular material direct to site", testId: "input-quarry-to-site" },
              { name: "quarryToRmcKm" as const, label: "QUARRY/CRUSHER → RMC (km)", hint: "Aggregate transport to RMC plant", testId: "input-quarry-to-rmc" },
            ].map(({ name, label, hint, testId }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{label}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.1" className="h-9 mt-0.5"
                      placeholder="km"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                      onBlur={() => { field.onBlur(); handleBlurSave(); }}
                      data-testid={testId}
                    />
                  </FormControl>
                  <FormDescription className="text-[12px]">{hint}</FormDescription>
                </FormItem>
              )} />
            ))}
          </div>

          {/* Concrete group */}
          <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Concrete</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { name: "rmcToSiteKm" as const, label: "RMC PLANT → SITE (km)", hint: "Ready-mix / M20/M25/M30/M35 haul", testId: "input-rmc-to-site" },
            ].map(({ name, label, hint, testId }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{label}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.1" className="h-9 mt-0.5"
                      placeholder="km"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                      onBlur={() => { field.onBlur(); handleBlurSave(); }}
                      data-testid={testId}
                    />
                  </FormControl>
                  <FormDescription className="text-[12px]">{hint}</FormDescription>
                </FormItem>
              )} />
            ))}
          </div>

          {/* Earthwork group */}
          <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Earthwork</p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: "borrowToSiteKm" as const, label: "BORROW AREA → SITE (km)", hint: "Earthwork fill / embankment haul", testId: "input-borrow-to-site" },
              { name: "disposalDistanceKm" as const, label: "DISPOSAL POINT (km)", hint: "Earthwork cut / excavation haul-away", testId: "input-disposal-distance" },
            ].map(({ name, label, hint, testId }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{label}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.1" className="h-9 mt-0.5"
                      placeholder="km"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                      onBlur={() => { field.onBlur(); handleBlurSave(); }}
                      data-testid={testId}
                    />
                  </FormControl>
                  <FormDescription className="text-[12px]">{hint}</FormDescription>
                </FormItem>
              )} />
            ))}
          </div>

          {/* Distance summary matrix */}
          <div className="mt-4 rounded-md bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Layer type → haul distance used by planning engine
            </p>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[12px]">
              {[
                { label: "BC/DBM→site", val: vals.hmpToSiteKm },
                { label: "Qry→HMP", val: vals.quarryToHmpKm },
                { label: "WMM plant→site", val: vals.wmmPlantToSiteKm },
                { label: "Qry→site", val: vals.quarryToSiteKm },
                { label: "Qry→RMC", val: vals.quarryToRmcKm },
                { label: "RMC→site", val: vals.rmcToSiteKm },
                { label: "Borrow→site", val: vals.borrowToSiteKm },
                { label: "Disposal", val: vals.disposalDistanceKm },
              ].map(({ label, val }) => (
                <div key={label} className="rounded border border-slate-200 bg-white py-1.5 px-1">
                  <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                  <p className="font-bold text-slate-700 mt-0.5">
                    {val != null ? `${val} km` : "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ── 4. Productivity Mode ──────────────────────────────────────────── */}
        <SectionCard
          icon={<BarChart2 className="w-4 h-4 text-teal-600" />}
          title="Productivity Mode"
          subtitle="Controls which output rate source the planning engine uses when computing auto-durations."
        >
          <FormField control={form.control} name="productivityMode" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">MODE</FormLabel>
              <Select
                value={field.value}
                onValueChange={v => {
                  field.onChange(v);
                  form.handleSubmit(d => saveMutation.mutate(d))();
                }}
              >
                <SelectTrigger className="h-9 w-full max-w-sm mt-0.5" data-testid="select-productivity-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="snl">
                    <div>
                      <p className="font-medium">SNL / Standard Norms</p>
                      <p className="text-[12px] text-muted-foreground">Uses IRC/MoRTH SNL tables for all items</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="company">
                    <div>
                      <p className="font-medium">Company Norms</p>
                      <p className="text-[12px] text-muted-foreground">Uses company-configured standard outputs</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="project">
                    <div>
                      <p className="font-medium">Project-Specific</p>
                      <p className="text-[12px] text-muted-foreground">Per-layer-type overrides defined below</p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-2 rounded-md px-3 py-2 text-xs bg-slate-50 border border-slate-200 text-slate-600">
                {field.value === "snl" && (
                  <>
                    <strong>SNL mode:</strong> auto-durations use IRC/MoRTH standard norms library values.
                    Tipper fleet size is calculated from output norms + haul-cycle model.
                  </>
                )}
                {field.value === "company" && (
                  <>
                    <strong>Company norms mode:</strong> planning engine will apply company-configured output
                    rates (set in Equipment Master) in place of SNL defaults.
                  </>
                )}
                {field.value === "project" && (
                  <>
                    <strong>Project-specific mode:</strong> planning engine uses the per-layer-type output
                    rates entered below. Any blank entries fall back to SNL norms.
                  </>
                )}
              </div>
            </FormItem>
          )} />

          {/* Per-type override grid — only visible in "project" mode */}
          {vals.productivityMode === "project" && (
            <FormField control={form.control} name="productivityOverrides" render={({ field }) => (
              <ProductivityOverridesSection
                overrides={field.value as Record<string, { outputPerHr?: number; unit?: string }> | null}
                onChange={v => {
                  field.onChange(v);
                  form.handleSubmit(d => saveMutation.mutate(d))();
                }}
              />
            )} />
          )}
        </SectionCard>

        {/* ── 5. Mix Template Links ─────────────────────────────────────────── */}
        <MixLinksSection projectId={projectId} />

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <Link href={`/work-program/${projectId}`}>
            <a><Button variant="outline" size="sm" data-testid="button-settings-back">← Back to Project</Button></a>
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
