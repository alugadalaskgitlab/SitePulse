import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { ArrowLeft, Beaker, Check, FileText, FlaskConical, Printer, RefreshCw, Save, Upload, X } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot, ReferenceLine } from "recharts";
import { HubShell } from "@/components/HubShell";
import { InstalledDocumentLink } from "@/components/InstalledDocumentLink";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calculateSoilLabTest, soilQualityDefaultsForWork, type LabCalculationContext, type SoilLabTestType } from "@shared/labTests";

const TEST_TYPES: Array<{ value: SoilLabTestType; label: string }> = [
  { value: "field_density_sand", label: "Field density — sand replacement" },
  { value: "field_density_core_cutter", label: "Field density — core cutter" },
  { value: "moisture_content", label: "Moisture content — oven / speedy" },
  { value: "proctor_light", label: "Light Proctor" },
  { value: "proctor_modified", label: "Modified Proctor" },
  { value: "cbr", label: "CBR" },
  { value: "atterberg", label: "Atterberg limits" },
];
const PLACES = [
  ["on_site", "On site (field test)"],
  ["site_lab", "Site lab"],
  ["plant_lab", "Plant lab"],
  ["outside_lab", "Outside lab"],
] as const;
const SOURCE_KINDS = [
  ["site", "Site"],
  ["borrow_area", "Borrow area"],
  ["quarry", "Quarry"],
  ["plant", "Plant"],
  ["stockpile", "Stockpile"],
  ["other", "Other"],
] as const;
const PENETRATIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 12.5];
const FALLBACK_LAYERS = [
  "OGL / initial", "Embankment layer 1", "Embankment layer 2", "Embankment layer 3",
  "Subgrade layer 1", "Subgrade layer 2", "GSB", "WMM", "BC",
];

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function numberInput(value: unknown) {
  return value == null ? "" : String(value);
}
function displayCaps(value: unknown) {
  return String(value ?? "").toLocaleUpperCase();
}

function toKm(value: string) {
  const text = value.trim();
  if (!text) return null;
  const plus = text.match(/^(-?\d+)\s*\+\s*(\d+(?:\.\d+)?)$/);
  const parsed = plus ? Number(plus[1]) + Number(plus[2]) / 1000 : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function chainageText(value: unknown) {
  const km = Number(value);
  if (!Number.isFinite(km)) return "—";
  const whole = Math.trunc(km);
  const metres = Math.round(Math.abs(km - whole) * 1000);
  return `${whole}+${String(metres).padStart(3, "0")}`;
}

function emptyForm(siteId?: number, projectId?: number) {
  return {
    siteId: siteId ?? null,
    boqProjectId: projectId ?? null,
    testType: "field_density_sand" as SoilLabTestType,
    dateSampled: today(),
    dateTested: today(),
    place: "site_lab",
    boqItemId: null as number | null,
    layer: "",
    layerNo: null as number | null,
    chainageFrom: "",
    chainageTo: "",
    side: "",
    sampleSourceKind: "site",
    sampleSourceName: "",
    materialId: null as number | null,
    siteEngineerPersonnelId: null as number | null,
    sampledByPersonnelId: null as number | null,
    testedByPersonnelId: null as number | null,
    header: {} as Record<string, unknown>,
    readings: { pits: [{}] } as Record<string, any>,
    remarks: "",
    status: "draft",
    attachment: null as null | { fileName: string; objectPath: string; mimeType: string; fileSize: number },
  };
}

function initialReadings(testType: SoilLabTestType) {
  if (testType === "field_density_sand" || testType === "field_density_core_cutter") return { pits: [{}] };
  if (testType === "proctor_light" || testType === "proctor_modified") return { trials: [{}, {}, {}] };
  if (testType === "cbr") return { dialReadings: {} };
  if (testType === "atterberg") return { liquidLimitTrials: [{}, {}, {}], plasticLimitTrials: [{}, {}] };
  return {};
}

function verdictBadge(verdict: string) {
  if (verdict === "pass") return <Badge className="border border-black bg-white text-black">PASS</Badge>;
  if (verdict === "fail") return <Badge className="border-2 border-black bg-white font-extrabold text-black">FAIL</Badge>;
  return <Badge variant="outline">Not assessed</Badge>;
}

function TestLineChart({ data, xKey, yKey, xLabel, yLabel, secondary, secondaryYKey = "dryDensityGcc", secondaryLabel = "Zero air voids", xScale = "linear", peak, referenceXs = [] }: {
  data: any[]; xKey: string; yKey: string; xLabel: string; yLabel: string; secondary?: any[];
  secondaryYKey?: string; secondaryLabel?: string; xScale?: "linear" | "log";
  peak?: { x: number; y: number }; referenceXs?: number[];
}) {
  const yValues = [...data.map(row => Number(row?.[yKey])), ...(secondary ?? []).map(row => Number(row?.[secondaryYKey]))]
    .filter(Number.isFinite);
  if (peak) yValues.push(peak.y);
  const min = yValues.length ? Math.min(...yValues) : 0;
  const max = yValues.length ? Math.max(...yValues) : 1;
  const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.03, 0.05);
  const yMin = min >= 0 ? Math.max(0, min - pad) : min - pad;
  const yMax = max + pad;
  return (
    <div className="h-72 w-full rounded border bg-white p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 22, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} type="number" scale={xScale} domain={["dataMin", "dataMax"]} label={{ value: xLabel, position: "insideBottom", offset: -16 }} />
          <YAxis domain={[yMin, yMax]} label={{ value: yLabel, angle: -90, position: "insideLeft" }} />
          <Tooltip />
          <Legend verticalAlign="top" height={24} />
          {referenceXs.map(value => <ReferenceLine key={value} x={value} stroke="#111827" strokeDasharray="4 4" />)}
          <Line name={yLabel} dataKey={yKey} type="monotone" stroke="#111827" strokeWidth={2} dot />
          {secondary?.length ? <Line name={secondaryLabel} data={secondary} dataKey={secondaryYKey} type="linear" stroke="#6b7280" strokeDasharray="5 4" dot={false} /> : null}
          {peak && <ReferenceDot x={peak.x} y={peak.y} r={5} fill="#111827" stroke="#111827" label="MDD / OMC" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function LabTests() {
  const { sectionCan, user, isOwner } = useAuth();
  const { companyName } = useFeatureFlags();
  const { toast } = useToast();
  const query = useQueryClient();
  const { uploadFile, isUploading } = useUpload();
  const canAdd = sectionCan("lab_tests", "create");
  const canEdit = sectionCan("lab_tests", "edit");
  const [siteId, setSiteId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [tab, setTab] = useState("add");
  const [form, setForm] = useState<any>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [printTest, setPrintTest] = useState<any>(null);
  const [filter, setFilter] = useState({ testType: "", verdict: "", dateFrom: "", dateTo: "", boqItemId: "", layerNo: "" });
  const [setupForm, setSetupForm] = useState<any>({
    kind: "sand_pouring_cylinder",
    equipmentNo: "",
    calibratedOn: today(),
    validUntil: "",
    calibratedByPersonnelId: null,
    attachment: null,
    values: { sandBulkDensityGcc: "", sandInConeG: "" },
  });
  const [benchmarkForm, setBenchmarkForm] = useState<any>({
    materialId: "", sourceName: "", mddGcc: "", omcPercent: "", specificGravity: "", effectiveFrom: today(),
  });
  const [editingBenchmarkId, setEditingBenchmarkId] = useState<number | null>(null);
  const [benchmarkReason, setBenchmarkReason] = useState("");
  const [specItemId, setSpecItemId] = useState<number | null>(null);
  const [specRows, setSpecRows] = useState<any[]>([]);
  const [registerStretch, setRegisterStretch] = useState({ from: "", to: "" });
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const selectSite = (id: number) => {
    setSiteId(id);
    try { localStorage.setItem(`lab-tests:last-site:${String((user as any)?.id ?? "user")}`, String(id)); } catch {}
  };

  const { data: bootstrap, isLoading: bootstrapLoading, error: bootstrapError } = useQuery<any>({
    queryKey: ["/api/lab-tests/bootstrap", projectId],
    queryFn: async () => {
      const url = new URL("/api/lab-tests/bootstrap", window.location.origin);
      if (projectId) url.searchParams.set("projectId", String(projectId));
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load sites and test setup.");
      return response.json();
    },
  });
  const sites = bootstrap?.sites ?? [];
  const projects = bootstrap?.projects ?? [];
  const items = bootstrap?.items ?? [];
  const personnel = bootstrap?.personnel ?? [];
  const materials = bootstrap?.materials ?? [];
  const personnelOptionsFor = (selectedId: unknown) => personnel
    .filter((person: any) => Number(person.isActive) === 1 || Number(person.id) === Number(selectedId))
    .map((person: any) => [String(person.id), `${displayCaps(person.name)}${Number(person.isActive) === 1 ? "" : " (inactive)"}`] as [string, string]);
  const projectItems = items as any[];
  const currentProject = projects.find((project: any) => Number(project.id) === Number(projectId));

  useEffect(() => {
    if (!siteId && sites.length) {
      let lastUsed = 0;
      try { lastUsed = Number(localStorage.getItem(`lab-tests:last-site:${String((user as any)?.id ?? "user")}`)); } catch {}
      const preferred = lastUsed || Number((user as any)?.siteId);
      const match = sites.find((site: any) => Number(site.id) === preferred);
      setSiteId(Number(match?.id ?? sites[0].id));
    }
  }, [sites, siteId, user]);
  useEffect(() => {
    if (siteId && projects.length) {
      const candidate = projects.find((project: any) => Number(project.siteId) === siteId);
      if (!projectId || !projects.some((project: any) => Number(project.id) === projectId && Number(project.siteId) === siteId)) {
        setProjectId(candidate ? Number(candidate.id) : null);
      }
    }
  }, [siteId, projects, projectId]);
  useEffect(() => {
    if (!editingId) setForm((current: any) => ({ ...current, siteId, boqProjectId: projectId, boqItemId: null }));
  }, [siteId, projectId, editingId]);
  useEffect(() => {
    const linkedId = Number(bootstrap?.currentUserPersonnelId);
    if (!editingId && linkedId > 0 && !form.siteEngineerPersonnelId) {
      setForm((current: any) => current.siteEngineerPersonnelId ? current : ({ ...current, siteEngineerPersonnelId: linkedId }));
    }
  }, [bootstrap?.currentUserPersonnelId, editingId, form.siteEngineerPersonnelId]);

  const { data: setup } = useQuery<any>({
    queryKey: ["/api/lab-tests/setup", siteId, projectId],
    queryFn: async () => {
      const response = await fetch(`/api/lab-tests/setup?siteId=${siteId}&projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load lab setup.");
      return response.json();
    },
    enabled: !!siteId && !!projectId,
  });
  const { data: tests = [], isLoading: testsLoading, refetch: refreshTests } = useQuery<any[]>({
    queryKey: ["/api/lab-tests", siteId, projectId, filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (siteId) params.set("siteId", String(siteId));
      if (projectId) params.set("projectId", String(projectId));
      for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
      const response = await fetch(`/api/lab-tests?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load tests.");
      return response.json();
    },
    enabled: !!siteId && !!projectId,
  });

  const selectedItem = projectItems.find((item: any) => Number(item.id) === Number(form.boqItemId));
  const configuredLayers = selectedItem?.layerConfig?.dprLayers ?? selectedItem?.layerConfig?.layers;
  const itemLayerCount = Math.max(1, Number(
    Array.isArray(selectedItem?.layerConfig?.layers)
      ? selectedItem.layerConfig.layers.length
      : selectedItem?.layerConfig?.layerCount ?? 1,
  ));
  const layerChoices = Array.isArray(configuredLayers) && configuredLayers.length
    ? configuredLayers.map((entry: any, index: number) => typeof entry === "string" ? entry
      : typeof entry === "object" ? String(entry.name ?? entry.label ?? `Layer ${index + 1}`)
        : `Layer ${index + 1}`)
    : FALLBACK_LAYERS;
  const activeBenchmark = useMemo(() => {
    const rows = (setup?.benchmarks ?? []).filter((row: any) =>
      row.isActive && (row.materialId == null || Number(row.materialId) === Number(form.materialId))
      && (row.boqProjectId == null || Number(row.boqProjectId) === Number(projectId))
      && (row.sourceName == null || row.sourceName.trim().toLowerCase() === String(form.sampleSourceName).trim().toLowerCase()),
    );
    return rows[0] ?? null;
  }, [setup, form.materialId, form.sampleSourceName, projectId]);
  const activeSpec = useMemo(() => {
    if (!selectedItem) return null;
    const explicit = (setup?.specs ?? []).find((row: any) => Number(row.boqItemId) === Number(selectedItem.id) && row.testType === form.testType);
    if (explicit) return explicit;
    const defaults = soilQualityDefaultsForWork(`${selectedItem.itemName ?? ""} ${selectedItem.description ?? ""}`);
    return defaults.find(row => row.testType === form.testType) ?? null;
  }, [setup, selectedItem, form.testType]);
  const activeCalibration = useMemo(() => {
    const kind = form.testType === "field_density_sand" ? "sand_pouring_cylinder"
      : form.testType === "field_density_core_cutter" ? "core_cutter"
        : form.testType === "cbr" ? "proving_ring" : "speedy_moisture_meter";
    return (setup?.calibrations ?? []).find((row: any) =>
      row.kind === kind && (!row.validUntil || row.validUntil >= form.dateTested)
      && (!row.siteId || Number(row.siteId) === Number(siteId))
    ) ?? null;
  }, [setup, form.testType, form.dateTested, siteId]);
  const calculationContext: LabCalculationContext = {
    mddGcc: activeBenchmark?.mddGcc ?? null,
    omcPercent: activeBenchmark?.omcPercent ?? null,
    specificGravity: activeBenchmark?.specificGravity ?? 2.65,
    minValue: activeSpec?.minValue ?? null,
    maxValue: activeSpec?.maxValue ?? null,
    requiredPercent: form.testType.startsWith("field_density") ? activeSpec?.minValue ?? null : null,
    sandBulkDensityGcc: Number(activeCalibration?.values?.sandBulkDensityGcc) || null,
    sandInConeG: Number(activeCalibration?.values?.sandInConeG) || null,
    ringConstantKgPerDivision: Number(activeCalibration?.values?.ringConstantKgPerDivision ?? activeCalibration?.values?.ringConstant) || null,
    speedyCorrection: activeCalibration?.values?.correctionPairs ?? null,
  };
  const calculation = useMemo(() => calculateSoilLabTest(form.testType, form.readings, calculationContext), [form.testType, form.readings, calculationContext.mddGcc, calculationContext.omcPercent, calculationContext.minValue, calculationContext.maxValue, calculationContext.requiredPercent, calculationContext.sandBulkDensityGcc, calculationContext.sandInConeG, calculationContext.ringConstantKgPerDivision, calculationContext.speedyCorrection]);

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      if (!form.siteId || !form.boqProjectId) throw new Error("Choose a site and BOQ project.");
      const payload = {
        ...form,
        siteId: Number(form.siteId),
        boqProjectId: Number(form.boqProjectId),
        boqItemId: form.boqItemId ? Number(form.boqItemId) : null,
        materialId: form.materialId ? Number(form.materialId) : null,
        siteEngineerPersonnelId: form.siteEngineerPersonnelId ? Number(form.siteEngineerPersonnelId) : null,
        sampledByPersonnelId: form.sampledByPersonnelId ? Number(form.sampledByPersonnelId) : null,
        testedByPersonnelId: form.testedByPersonnelId ? Number(form.testedByPersonnelId) : null,
        chainageFrom: toKm(form.chainageFrom),
        chainageTo: toKm(form.chainageTo),
        status,
      };
      const response = correctionMode
        ? await apiRequest("POST", `/api/lab-tests/${editingId}/correct`, { ...payload, reason: correctionReason })
        : await apiRequest(editingId ? "PUT" : "POST", editingId ? `/api/lab-tests/${editingId}` : "/api/lab-tests", payload);
      return response.json();
    },
    onSuccess: async (saved: any, status) => {
      toast({ title: status === "submitted" ? "Test submitted" : "Draft saved", description: saved?.testNo ? `${saved.testNo} was saved.` : "The test was saved." });
      setEditingId(null);
      setCorrectionMode(false);
      setCorrectionReason("");
      setForm(emptyForm(siteId ?? undefined, projectId ?? undefined));
      await Promise.all([refreshTests(), query.invalidateQueries({ queryKey: ["/api/lab-tests/setup"] })]);
      if (status === "submitted") setTab("list");
    },
    onError: (error: any) => toast({ title: "Could not save test", description: error.message, variant: "destructive" }),
  });

  const retestMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/lab-tests/${id}/retest`, {})).json(),
    onSuccess: (saved: any) => {
      setEditingId(Number(saved.id));
      setForm({ ...emptyForm(siteId ?? undefined, projectId ?? undefined), ...saved, readings: initialReadings(saved.testType), attachment: null, status: "draft" });
      setTab("add");
      toast({ title: "Retest started", description: `New draft ${saved.testNo} is ready.` });
      void refreshTests();
    },
    onError: (error: any) => toast({ title: "Could not start retest", description: error.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (args: { id: number; reason: string }) => apiRequest("POST", `/api/lab-tests/${args.id}/cancel`, { reason: args.reason }),
    onSuccess: () => {
      toast({ title: "Test cancelled" });
      setSelectedTest(null);
      void refreshTests();
    },
    onError: (error: any) => toast({ title: "Could not cancel test", description: error.message, variant: "destructive" }),
  });

  const setFormField = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  const setReading = (key: string, value: any) => setForm((current: any) => ({
    ...current, readings: { ...current.readings, [key]: value },
  }));
  const updateReadingObject = (key: string, index: number, field: string, value: any) => {
    const rows = Array.isArray(form.readings[key]) ? [...form.readings[key]] : [];
    rows[index] = { ...(rows[index] ?? {}), [field]: value };
    setReading(key, rows);
  };
  const onAttachment = async (file?: File) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (file.size > 15 * 1024 * 1024 || (!file.type.startsWith("image/") && !isPdf)) {
      toast({ title: "Unsupported file", description: "Choose an image or PDF up to 15 MB.", variant: "destructive" });
      return;
    }
    const uploaded = await uploadFile(file);
    if (!uploaded) return;
    setFormField("attachment", { fileName: file.name, objectPath: uploaded.objectPath, mimeType: file.type || (isPdf ? "application/pdf" : "image/*"), fileSize: file.size });
  };
  const onCalibrationAttachment = async (file?: File) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (file.size > 15 * 1024 * 1024 || (!file.type.startsWith("image/") && !isPdf)) {
      toast({ title: "Unsupported file", description: "Choose an image or PDF up to 15 MB.", variant: "destructive" });
      return;
    }
    const uploaded = await uploadFile(file);
    if (!uploaded) return;
    setSetupForm((current: any) => ({
      ...current,
      attachment: { fileName: file.name, objectPath: uploaded.objectPath, mimeType: file.type || (isPdf ? "application/pdf" : "image/*"), fileSize: file.size },
    }));
  };

  const startEdit = (test: any) => {
    setEditingId(Number(test.id));
    setCorrectionMode(false);
    setForm({
      ...emptyForm(siteId ?? undefined, projectId ?? undefined),
      ...test,
      chainageFrom: test.chainageFrom == null ? "" : chainageText(test.chainageFrom),
      chainageTo: test.chainageTo == null ? "" : chainageText(test.chainageTo),
      attachment: test.attachments?.[0] ?? null,
      status: "draft",
    });
    setTab("add");
    setSelectedTest(null);
  };

  const layerRegisterQuery = useQuery<any[]>({
    queryKey: ["/api/lab-tests/layer-register", projectId, form.boqItemId, registerStretch],
    queryFn: async () => {
      const params = new URLSearchParams({ projectId: String(projectId), boqItemId: String(form.boqItemId) });
      if (registerStretch.from) params.set("chainageFrom", String(toKm(registerStretch.from)));
      if (registerStretch.to) params.set("chainageTo", String(toKm(registerStretch.to)));
      const response = await fetch(`/api/lab-tests/layer-register?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load layer register.");
      return response.json();
    },
    enabled: tab === "register" && !!projectId && !!form.boqItemId,
  });
  const frequencyQuery = useQuery<any[]>({
    queryKey: ["/api/lab-tests/frequency", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/lab-tests/frequency?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load frequency check.");
      return response.json();
    },
    enabled: tab === "frequency" && !!projectId,
  });

  const contextLabel = activeCalibration
    ? `Calibration ${activeCalibration.equipmentNo} · ${activeCalibration.calibratedOn}`
    : "No active calibration";
  const benchmarkLabel = activeBenchmark?.sourceTestId
    ? `Proctor ${activeBenchmark.sourceTestNo || activeBenchmark.sourceTestId} · ${activeBenchmark.effectiveFrom}`
    : activeBenchmark ? `Benchmark · ${activeBenchmark.effectiveFrom}` : "No material benchmark";
  const specLabel = activeSpec?.note || (activeSpec ? "Saved quality specification" : "No quality requirement set");
  const detailsAllowed = !!siteId && !!projectId;

  return (
    <HubShell title="Tests" subtitle="Soil laboratory and field test sheets" backHref="/site/hub" backLabel="Site operations">
      <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <div>
            <h1 className="text-xl font-semibold">Tests</h1>
            <p className="text-sm text-muted-foreground">Record, calculate and review soil test results.</p>
          </div>
          <Link href="/site/hub"><Button variant="outline" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button></Link>
        </div>

        <Card className="print:hidden">
          <CardContent className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Site</Label>
              <Select value={siteId ? String(siteId) : ""} onValueChange={value => selectSite(Number(value))}>
                <SelectTrigger><SelectValue placeholder="Choose site" /></SelectTrigger>
                <SelectContent>{sites.map((site: any) => <SelectItem key={site.id} value={String(site.id)}>{displayCaps(site.name)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>BOQ project</Label>
              <Select value={projectId ? String(projectId) : ""} onValueChange={value => setProjectId(Number(value))}>
                <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
                <SelectContent>{projects.filter((project: any) => Number(project.siteId) === Number(siteId)).map((project: any) => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
          {bootstrapLoading && <p className="px-3 pb-3 text-sm text-muted-foreground">Loading test setup…</p>}
          {bootstrapError && <p className="px-3 pb-3 text-sm text-red-700">Could not load sites or projects.</p>}
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="add">Add test</TabsTrigger>
            <TabsTrigger value="list">Test list</TabsTrigger>
            <TabsTrigger value="register">Layer register</TabsTrigger>
            <TabsTrigger value="frequency">Frequency check</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Beaker className="h-5 w-5" />{editingId ? "Edit draft" : "New soil test"}</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                {!detailsAllowed ? <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Choose a site and BOQ project to start.</p> : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <FieldSelect label="Test type" value={form.testType} options={TEST_TYPES.map(row => [row.value, row.label])} onChange={value => setForm((current: any) => ({ ...current, testType: value, readings: initialReadings(value as SoilLabTestType) }))} />
                      <FieldSelect label="Place" value={form.place} options={PLACES} onChange={value => setFormField("place", value)} />
                      <FieldInput label="Date sampled" type="date" value={form.dateSampled} onChange={value => setFormField("dateSampled", value)} />
                      <FieldInput label="Date tested" type="date" value={form.dateTested} onChange={value => setFormField("dateTested", value)} />
                      <FieldSelect label="BOQ item" value={form.boqItemId ? String(form.boqItemId) : ""} options={projectItems.map((item: any) => [String(item.id), `${item.itemCode ? `${item.itemCode} · ` : ""}${item.itemName || item.description}`])} onChange={value => setFormField("boqItemId", value ? Number(value) : null)} optional />
                      <FieldSelect label="Layer" value={form.layer ?? ""} options={layerChoices.map((value: string) => [value, value] as [string, string])} onChange={value => setFormField("layer", value || null)} optional />
                      <FieldSelect label="Layer number" value={form.layerNo ? String(form.layerNo) : ""} options={Array.from({ length: itemLayerCount }, (_, index) => [String(index + 1), `Layer ${index + 1}`] as [string, string])} onChange={value => setFormField("layerNo", value ? Number(value) : null)} optional />
                      <FieldInput label="From chainage (km)" value={form.chainageFrom} onChange={value => setFormField("chainageFrom", value)} placeholder="2+600" />
                      <FieldInput label="To chainage (km)" value={form.chainageTo} onChange={value => setFormField("chainageTo", value)} placeholder="2+700" />
                      <FieldSelect label="Side" value={form.side} options={[["Centre", "Centre"], ["LHS", "LHS"], ["RHS", "RHS"], ["Both", "Both"]]} onChange={value => setFormField("side", value)} optional />
                      <FieldSelect label="Sample source" value={form.sampleSourceKind} options={SOURCE_KINDS} onChange={value => setFormField("sampleSourceKind", value)} />
                      <FieldInput label="Source name" value={form.sampleSourceName} onChange={value => setFormField("sampleSourceName", value)} placeholder="Borrow area / quarry / stockpile" />
                      <FieldSelect label="Material" value={form.materialId ? String(form.materialId) : ""} options={materials.map((item: any) => [String(item.id), displayCaps(item.name)])} onChange={value => setFormField("materialId", value ? Number(value) : null)} optional />
                      <FieldSelect label="Site engineer" value={form.siteEngineerPersonnelId ? String(form.siteEngineerPersonnelId) : ""} options={personnelOptionsFor(form.siteEngineerPersonnelId)} onChange={value => setFormField("siteEngineerPersonnelId", value ? Number(value) : null)} optional />
                      <FieldSelect label="Sampled by" value={form.sampledByPersonnelId ? String(form.sampledByPersonnelId) : ""} options={personnelOptionsFor(form.sampledByPersonnelId)} onChange={value => setFormField("sampledByPersonnelId", value ? Number(value) : null)} optional />
                      <FieldSelect label="Tested by" value={form.testedByPersonnelId ? String(form.testedByPersonnelId) : ""} options={personnelOptionsFor(form.testedByPersonnelId)} onChange={value => setFormField("testedByPersonnelId", value ? Number(value) : null)} optional />
                    </div>

                    <div className="rounded border bg-slate-50 p-3 text-sm">
                      <p className="font-semibold">Benchmarks and requirement</p>
                      <div className="mt-2 grid gap-1 sm:grid-cols-3">
                        <span>MDD: {calculationContext.mddGcc ?? "—"} g/cc <small>({benchmarkLabel})</small></span>
                        <span>OMC: {calculationContext.omcPercent ?? "—"}% <small>({benchmarkLabel})</small></span>
                        <span>Required: {activeSpec?.minValue ?? activeSpec?.maxValue ?? "—"} <small>({specLabel})</small></span>
                        {form.testType.startsWith("field_density") && <span>Sand: {calculationContext.sandBulkDensityGcc ?? "—"} g/cc · cone {calculationContext.sandInConeG ?? "—"} g <small>({contextLabel})</small></span>}
                        {form.testType === "cbr" && <span>Proving ring: {calculationContext.ringConstantKgPerDivision ?? "—"} kg/div <small>({contextLabel})</small></span>}
                      </div>
                    </div>

                    <TestReadings
                      testType={form.testType}
                      readings={form.readings}
                      results={calculation.results}
                      personnel={personnel}
                      activeCalibration={activeCalibration}
                      onReading={setReading}
                      onArrayRow={updateReadingObject}
                    />
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea value={form.remarks} onChange={event => setFormField("remarks", event.target.value)} />
                    </div>

                    <div className="rounded border p-3">
                      <Label htmlFor="lab-test-file" className="flex items-center gap-2"><Upload className="h-4 w-4" />Photo / sheet (optional)</Label>
                      <Input id="lab-test-file" type="file" accept="image/*,.pdf,application/pdf" onChange={event => void onAttachment(event.target.files?.[0])} className="mt-2" />
                      {form.attachment && <p className="mt-2 flex items-center gap-2 text-sm">{form.attachment.fileName}<button type="button" onClick={() => setFormField("attachment", null)} aria-label="Remove attachment"><X className="h-4 w-4" /></button></p>}
                      {isUploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
                    </div>

                    {correctionMode && <div className="space-y-2 rounded border border-amber-400 bg-amber-50 p-3"><Label htmlFor="lab-owner-correction-reason">Owner correction reason</Label><Textarea id="lab-owner-correction-reason" value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} /></div>}
                    {calculation.errors.length > 0 && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"><strong>Check readings</strong><ul className="mt-1 list-disc pl-5">{calculation.errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
                    {calculation.verdict !== "na" && <div className="flex items-center gap-2"><strong>Result</strong>{verdictBadge(calculation.verdict)}</div>}
                    <div className="flex flex-wrap gap-2 print:hidden">
                      {canAdd || (editingId && canEdit) || correctionMode ? (
                        <>
                          {!correctionMode && <Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending || isUploading}><Save className="mr-2 h-4 w-4" />Save draft</Button>}
                          <Button onClick={() => saveMutation.mutate("submitted")} disabled={!detailsAllowed || calculation.errors.length > 0 || saveMutation.isPending || isUploading || (correctionMode && !correctionReason.trim())}><Check className="mr-2 h-4 w-4" />{correctionMode ? "Save correction" : "Submit"}</Button>
                        </>
                      ) : <p className="text-sm text-muted-foreground">You can view tests, but do not have permission to add or edit them.</p>}
                      {editingId && <Button variant="ghost" onClick={() => { setEditingId(null); setCorrectionMode(false); setCorrectionReason(""); setForm(emptyForm(siteId ?? undefined, projectId ?? undefined)); }}>Cancel edit</Button>}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="list" className="space-y-4 print:hidden">
            <Card>
              <CardHeader><CardTitle className="flex items-center justify-between text-base">Test list<Button variant="outline" size="sm" onClick={() => void refreshTests()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  <FieldSelect label="Test type" value={filter.testType} options={TEST_TYPES.map(row => [row.value, row.label])} onChange={value => setFilter(current => ({ ...current, testType: value }))} optional />
                  <FieldInput label="From" type="date" value={filter.dateFrom} onChange={value => setFilter(current => ({ ...current, dateFrom: value }))} />
                  <FieldInput label="To" type="date" value={filter.dateTo} onChange={value => setFilter(current => ({ ...current, dateTo: value }))} />
                  <FieldSelect label="Result" value={filter.verdict} options={[["pass", "Pass"], ["fail", "Fail"], ["na", "Not assessed"]]} onChange={value => setFilter(current => ({ ...current, verdict: value }))} optional />
                  <FieldSelect label="BOQ item" value={filter.boqItemId} options={projectItems.map((item: any) => [String(item.id), item.itemName || item.description])} onChange={value => setFilter(current => ({ ...current, boqItemId: value }))} optional />
                  <FieldSelect label="Layer" value={filter.layerNo} options={[["1", "Layer 1"], ["2", "Layer 2"], ["3", "Layer 3"], ["4", "Layer 4"]]} onChange={value => setFilter(current => ({ ...current, layerNo: value }))} optional />
                </div>
                {testsLoading ? <p>Loading tests…</p> : tests.length === 0 ? <p className="text-sm text-muted-foreground">No tests match these filters.</p> : (
                  <div className="space-y-2">
                    {tests.map((test: any) => {
                      const retest = tests.find((row: any) => Number(row.retestOfTestId) === Number(test.id));
                      return (
                        <button key={test.id} type="button" onClick={() => setSelectedTest(test)} className="w-full rounded-lg border bg-white p-3 text-left hover:bg-slate-50">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">{test.testNo} · {labelForTest(test.testType)}</span>
                            {verdictBadge(test.verdict)}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">{test.dateSampled} · {test.itemLabel || displayCaps(test.sampleSourceName) || "No BOQ item"} · {test.layer || "Layer not set"}{test.layerNo != null ? ` · Layer ${test.layerNo}` : ""} · {chainageText(test.chainageFrom)}</div>
                           <div className="text-xs text-muted-foreground">Site engineer: {displayCaps(test.siteEngineerName) || "—"} · Sampled by: {displayCaps(test.sampledByName) || "—"} · Tested by: {displayCaps(test.testedByName) || "—"}</div>
                          {test.verdict === "fail" && <p className="mt-1 text-sm font-semibold">Failed test — retest required</p>}
                          {retest && <p className="mt-1 text-sm font-semibold">Retested → {retest.verdict === "pass" ? "Pass" : retest.verdict === "fail" ? "Fail" : "Not assessed"}</p>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Layer register</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <FieldSelect label="BOQ item" value={form.boqItemId ? String(form.boqItemId) : ""} options={projectItems.map((item: any) => [String(item.id), item.itemName || item.description])} onChange={value => setFormField("boqItemId", value ? Number(value) : null)} optional />
                <div className="grid grid-cols-2 gap-2"><FieldInput label="From chainage" value={registerStretch.from} onChange={value => setRegisterStretch(row => ({ ...row, from: value }))} placeholder="0+000" /><FieldInput label="To chainage" value={registerStretch.to} onChange={value => setRegisterStretch(row => ({ ...row, to: value }))} placeholder="1+000" /></div>
                <div className="overflow-x-auto rounded border">
                  <table className="min-w-full text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-2 text-left">100 m stretch</th>{[1, 2, 3, 4].map(layer => <th key={layer} className="p-2">Layer {layer}</th>)}</tr></thead>
                    <tbody>{layerRegisterRows(registerStretch, layerRegisterQuery.data ?? []).map(row => <tr key={row.key} className="border-b"><td className="p-2">{row.chainage}</td>{[1, 2, 3, 4].map(layer => <td key={layer} className="p-2 text-center">{row.layers[layer] ? `${row.layers[layer].verdict === "pass" ? "✓" : row.layers[layer].verdict === "fail" ? "✗" : "—"} ${firstResult(row.layers[layer])}` : "—"}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="frequency" className="space-y-4">
            <Card><CardHeader><CardTitle className="text-base">Frequency check</CardTitle></CardHeader><CardContent>
              <div className="space-y-2 sm:hidden">{(frequencyQuery.data ?? []).map((row: any, index: number) => <div key={`${row.boqItemId}-${row.testType}-${index}`} className="rounded border p-3 text-sm">
                <p className="font-semibold">{row.itemName}</p><p>{labelForTest(row.testType)}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <div><dt className="text-xs text-muted-foreground">Quantity laid</dt><dd>{row.quantityLaid} {row.frequencyUnit}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Required</dt><dd>{row.testsRequired}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Done / passed</dt><dd>{row.testsDone} / {row.testsPassed}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Shortfall</dt><dd className="font-semibold">{row.shortfall}</dd></div>
                </dl>
              </div>)}</div>
              <div className="hidden overflow-x-auto sm:block"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">BOQ item</th><th className="p-2">Test</th><th className="p-2">Quantity laid</th><th className="p-2">Required</th><th className="p-2">Done / passed</th><th className="p-2">Shortfall</th></tr></thead>
                <tbody>{(frequencyQuery.data ?? []).map((row: any, index: number) => <tr key={`${row.boqItemId}-${row.testType}-${index}`} className="border-b"><td className="p-2">{row.itemName}</td><td className="p-2">{labelForTest(row.testType)}</td><td className="p-2">{row.quantityLaid} {row.frequencyUnit}</td><td className="p-2">{row.testsRequired}</td><td className="p-2">{row.testsDone} / {row.testsPassed}</td><td className="p-2 font-semibold">{row.shortfall}</td></tr>)}</tbody>
              </table></div>
              {frequencyQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No quality specifications are configured for this project.</p>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="setup" className="space-y-4 print:hidden">
            {!isOwner ? <Card><CardContent className="p-4 text-sm">Test setup is available to the Owner.</CardContent></Card> : (
              <>
                <Card><CardHeader><CardTitle className="text-base">Add calibration</CardTitle></CardHeader><CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <FieldSelect label="Calibration type" value={setupForm.kind} options={[
                      ["sand_pouring_cylinder", "Sand pouring cylinder"],
                      ["speedy_moisture_meter", "Speedy moisture meter"],
                      ["proving_ring", "Proving ring"],
                      ["core_cutter", "Core cutter"],
                     ]} onChange={value => setSetupForm((row: any) => ({
                       ...row, kind: value, values: value === "sand_pouring_cylinder" ? { sandBulkDensityGcc: "", sandInConeG: "" }
                         : value === "speedy_moisture_meter" ? { correctionPairsText: '[{"indicated":10,"corrected":11},{"indicated":20,"corrected":21}]' } : {},
                     }))} />
                    <FieldInput label="Equipment no." value={setupForm.equipmentNo} onChange={value => setSetupForm((row: any) => ({ ...row, equipmentNo: value }))} />
                    <FieldInput label="Calibrated on" type="date" value={setupForm.calibratedOn} onChange={value => setSetupForm((row: any) => ({ ...row, calibratedOn: value }))} />
                    <FieldInput label="Valid until" type="date" value={setupForm.validUntil} onChange={value => setSetupForm((row: any) => ({ ...row, validUntil: value }))} />
                    {setupForm.kind === "sand_pouring_cylinder" && <>
                      <FieldInput label="Sand bulk density (g/cc)" type="number" value={setupForm.values.sandBulkDensityGcc ?? ""} onChange={value => setSetupForm((row: any) => ({ ...row, values: { ...row.values, sandBulkDensityGcc: value } }))} />
                      <FieldInput label="Sand in cone (g)" type="number" value={setupForm.values.sandInConeG ?? ""} onChange={value => setSetupForm((row: any) => ({ ...row, values: { ...row.values, sandInConeG: value } }))} />
                    </>}
                    {setupForm.kind === "proving_ring" && <FieldInput label="Ring constant (kg/div)" type="number" value={setupForm.values.ringConstantKgPerDivision ?? ""} onChange={value => setSetupForm((row: any) => ({ ...row, values: { ...row.values, ringConstantKgPerDivision: value } }))} />}
                    {setupForm.kind === "core_cutter" && <>
                      <FieldInput label="Cutter volume (cc)" type="number" value={setupForm.values.cutterVolumeCc ?? ""} onChange={value => setSetupForm((row: any) => ({ ...row, values: { ...row.values, cutterVolumeCc: value } }))} />
                      <FieldInput label="Cutter weight (g)" type="number" value={setupForm.values.cutterWeightG ?? ""} onChange={value => setSetupForm((row: any) => ({ ...row, values: { ...row.values, cutterWeightG: value } }))} />
                    </>}
                     {setupForm.kind === "speedy_moisture_meter" && <div className="space-y-1 sm:col-span-3"><Label>Indicated → corrected moisture pairs (JSON)</Label><Textarea value={setupForm.values.correctionPairsText ?? ""} onChange={event => setSetupForm((row: any) => ({ ...row, values: { ...row.values, correctionPairsText: event.target.value } }))} rows={3} /><p className="text-xs text-muted-foreground">Enter at least two pairs, for example: [{`{"indicated":10,"corrected":11}`}, {`{"indicated":20,"corrected":21}`}].</p></div>}
                     <FieldSelect label="Calibrated by" value={setupForm.calibratedByPersonnelId ? String(setupForm.calibratedByPersonnelId) : ""} options={personnel.filter((person: any) => Number(person.isActive) === 1).map((person: any) => [String(person.id), displayCaps(person.name)])} onChange={value => setSetupForm((row: any) => ({ ...row, calibratedByPersonnelId: value ? Number(value) : null }))} optional />
                  </div>
                   <div className="space-y-2 rounded border p-3">
                     <Label htmlFor="lab-calibration-file">Calibration certificate (optional)</Label>
                     <Input id="lab-calibration-file" type="file" accept="image/*,.pdf,application/pdf" onChange={event => void onCalibrationAttachment(event.target.files?.[0])} />
                     {setupForm.attachment && <p className="text-sm">{setupForm.attachment.fileName}</p>}
                   </div>
                   <Button onClick={() => void saveCalibration(setupForm, siteId)} disabled={!siteId || isUploading}><Save className="mr-2 h-4 w-4" />Save calibration</Button>
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Saved calibrations</CardTitle></CardHeader><CardContent className="space-y-2">
                  {(setup?.calibrations ?? []).map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                    <span>{row.equipmentNo} · {row.kind.replaceAll("_", " ")} · calibrated {row.calibratedOn}{row.validUntil ? ` · valid until ${row.validUntil}` : ""}</span>
                    {row.objectPath && <InstalledDocumentLink className="underline" href={row.objectPath} fileName={row.fileName || "certificate"}>{row.fileName || "Open certificate"}</InstalledDocumentLink>}
                  </div>)}
                  {!setup?.calibrations?.length && <p className="text-sm text-muted-foreground">No calibration records for this site.</p>}
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">{editingBenchmarkId ? "Edit material benchmark" : "Add material benchmark"}</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FieldSelect label="Material" value={benchmarkForm.materialId} options={materials.map((material: any) => [String(material.id), material.name])} onChange={value => setBenchmarkForm((row: any) => ({ ...row, materialId: value }))} optional />
                  <FieldInput label="Sample source" value={benchmarkForm.sourceName} onChange={value => setBenchmarkForm((row: any) => ({ ...row, sourceName: value }))} />
                  <FieldInput label="MDD (g/cc)" type="number" value={benchmarkForm.mddGcc} onChange={value => setBenchmarkForm((row: any) => ({ ...row, mddGcc: value }))} />
                  <FieldInput label="OMC (%)" type="number" value={benchmarkForm.omcPercent} onChange={value => setBenchmarkForm((row: any) => ({ ...row, omcPercent: value }))} />
                  <FieldInput label="Specific gravity" type="number" value={benchmarkForm.specificGravity} onChange={value => setBenchmarkForm((row: any) => ({ ...row, specificGravity: value }))} />
                  <FieldInput label="Effective from" type="date" value={benchmarkForm.effectiveFrom} onChange={value => setBenchmarkForm((row: any) => ({ ...row, effectiveFrom: value }))} />
                  {editingBenchmarkId && <div className="space-y-1 sm:col-span-2"><Label>Reason for change</Label><Input value={benchmarkReason} onChange={event => setBenchmarkReason(event.target.value)} /></div>}
                  <Button onClick={() => void saveBenchmark(benchmarkForm, projectId)} disabled={!projectId || (editingBenchmarkId != null && !benchmarkReason.trim())}><Save className="mr-2 h-4 w-4" />{editingBenchmarkId ? "Save benchmark changes" : "Save benchmark"}</Button>
                  {editingBenchmarkId && <Button variant="outline" onClick={() => { setEditingBenchmarkId(null); setBenchmarkReason(""); setBenchmarkForm({ materialId: "", sourceName: "", mddGcc: "", omcPercent: "", specificGravity: "", effectiveFrom: today() }); }}>Cancel edit</Button>}
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Saved material benchmarks</CardTitle></CardHeader><CardContent className="space-y-2">
                  {(setup?.benchmarks ?? []).map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                    <span>{materials.find((material: any) => Number(material.id) === Number(row.materialId))?.name || row.sourceName || "Any material"} · MDD {row.mddGcc} g/cc · OMC {row.omcPercent}% · from {row.effectiveFrom}{row.sourceTestNo ? ` · ${row.sourceTestNo}` : ""}{row.isActive ? "" : " · inactive"}</span>
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingBenchmarkId(Number(row.id));
                      setBenchmarkReason("");
                      setBenchmarkForm({ ...row, materialId: row.materialId == null ? "" : String(row.materialId), sourceName: row.sourceName ?? "", mddGcc: String(row.mddGcc), omcPercent: String(row.omcPercent), specificGravity: row.specificGravity == null ? "" : String(row.specificGravity), effectiveFrom: String(row.effectiveFrom).slice(0, 10) });
                    }}>Edit</Button>
                    {row.isActive && <Button size="sm" variant="destructive" onClick={() => {
                      setEditingBenchmarkId(Number(row.id));
                      setBenchmarkReason("");
                      setBenchmarkForm({ ...row, materialId: row.materialId == null ? "" : String(row.materialId), sourceName: row.sourceName ?? "", mddGcc: String(row.mddGcc), omcPercent: String(row.omcPercent), specificGravity: row.specificGravity == null ? "" : String(row.specificGravity), effectiveFrom: String(row.effectiveFrom).slice(0, 10), isActive: false });
                    }}>Deactivate</Button>}
                  </div>)}
                  {!setup?.benchmarks?.length && <p className="text-sm text-muted-foreground">No material benchmarks saved.</p>}
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Quality specifications</CardTitle></CardHeader><CardContent className="space-y-3">
                  <FieldSelect label="BOQ item" value={specItemId ? String(specItemId) : ""} options={projectItems.map((item: any) => [String(item.id), item.itemName || item.description])} onChange={value => {
                    const id = value ? Number(value) : null;
                    setSpecItemId(id);
                    const item = projectItems.find((candidate: any) => Number(candidate.id) === id);
                    const saved = (setup?.specs ?? []).filter((row: any) => Number(row.boqItemId) === Number(id));
                    const defaults = !saved.length && item ? soilQualityDefaultsForWork(`${item.itemName ?? ""} ${item.description ?? ""}`) : [];
                    setSpecRows((saved.length ? saved : defaults).map((row: any) => ({
                      ...row, testType: row.testType, minValue: row.minValue, maxValue: row.maxValue,
                      frequencyQty: row.frequencyQty, frequencyUnit: row.frequencyUnit, note: row.note,
                    })));
                  }} optional />
                  {specRows.map((row, index) => <div key={`${row.testType}-${index}`} className="grid grid-cols-2 gap-2 rounded border p-3 sm:grid-cols-5">
                    <span className="col-span-2 self-center text-sm font-medium sm:col-span-1">{labelForTest(row.testType)}</span>
                    <FieldInput label="Minimum" type="number" value={numberInput(row.minValue)} onChange={value => setSpecRows(rows => rows.map((entry, i) => i === index ? { ...entry, minValue: value === "" ? null : Number(value) } : entry))} />
                    <FieldInput label="Maximum" type="number" value={numberInput(row.maxValue)} onChange={value => setSpecRows(rows => rows.map((entry, i) => i === index ? { ...entry, maxValue: value === "" ? null : Number(value) } : entry))} />
                    <FieldInput label="Frequency quantity" type="number" value={numberInput(row.frequencyQty)} onChange={value => setSpecRows(rows => rows.map((entry, i) => i === index ? { ...entry, frequencyQty: value === "" ? "" : Number(value) } : entry))} />
                    <FieldSelect label="Frequency unit" value={row.frequencyUnit} options={[["sqm", "sqm"], ["cum", "cum"], ["MT", "MT"], ["per_layer", "per layer"], ["as_required", "As required"]]} onChange={value => setSpecRows(rows => rows.map((entry, i) => i === index ? { ...entry, frequencyUnit: value } : entry))} />
                  </div>)}
                  {specItemId && <div className="flex flex-wrap gap-2">
                    <FieldSelect label="Add test requirement" value="" options={TEST_TYPES.filter(row => !specRows.some(spec => spec.testType === row.value)).map(row => [row.value, row.label] as [string, string])} onChange={value => {
                      const item = projectItems.find((candidate: any) => Number(candidate.id) === Number(specItemId));
                      const fallback = soilQualityDefaultsForWork(`${item?.itemName ?? ""} ${item?.description ?? ""}`).find(row => row.testType === value);
                      setSpecRows(rows => [...rows, fallback ? { ...fallback } : { testType: value, minValue: null, maxValue: null, frequencyQty: 1, frequencyUnit: "as_required", note: "" }]);
                    }} optional />
                    <Button onClick={() => void saveSpecs(specItemId, specRows)}><Save className="mr-2 h-4 w-4" />Save specifications</Button>
                  </div>}
                  <p className="text-xs text-muted-foreground">Defaults are suggestions only. Saved edits are not overwritten.</p>
                </CardContent></Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {selectedTest && (
          <TestDetailDialog
            test={selectedTest}
            isOwner={isOwner}
            canEdit={canEdit}
            onClose={() => { setSelectedTest(null); setShowCorrection(false); setCorrectionReason(""); }}
            onEdit={() => startEdit(selectedTest)}
            onRetest={() => retestMutation.mutate(Number(selectedTest.id))}
            onPrint={() => setPrintTest(selectedTest)}
            onCancel={reason => cancelMutation.mutate({ id: Number(selectedTest.id), reason })}
            correcting={showCorrection}
            setCorrecting={setShowCorrection}
            reason={correctionReason}
            setReason={setCorrectionReason}
            onOwnerCorrection={(reason) => {
              setEditingId(Number(selectedTest.id));
              setCorrectionMode(true);
              setCorrectionReason(reason);
              setForm({ ...emptyForm(siteId ?? undefined, projectId ?? undefined), ...selectedTest, attachment: selectedTest.attachments?.[0] ?? null, status: "submitted" });
              setShowCorrection(false);
              setSelectedTest(null);
              setTab("add");
            }}
          />
        )}
        {printTest && <LabTestPrint test={printTest} project={currentProject} companyName={companyName} onClose={() => setPrintTest(null)} />}
      </div>
    </HubShell>
  );

  async function saveCalibration(value: any, selectedSiteId: number | null) {
    try {
      const values = { ...value.values };
      if (value.kind === "speedy_moisture_meter") {
        try {
          values.correctionPairs = JSON.parse(String(values.correctionPairsText ?? ""));
        } catch {
          throw new Error("Enter the speedy-meter correction pairs as valid JSON.");
        }
        delete values.correctionPairsText;
      }
      await apiRequest("POST", "/api/lab-tests/calibrations", {
        ...value,
        siteId: selectedSiteId,
        calibratedByPersonnelId: value.calibratedByPersonnelId ? Number(value.calibratedByPersonnelId) : null,
        attachment: value.attachment,
        values: value.kind === "speedy_moisture_meter"
          ? values
          : Object.fromEntries(Object.entries(values).map(([key, entry]) => [key, entry === "" ? null : Number(entry)])),
        validUntil: value.validUntil || null,
      });
      toast({ title: "Calibration saved" });
      setSetupForm((current: any) => ({
        ...current, equipmentNo: "", validUntil: "", calibratedByPersonnelId: null, attachment: null,
        values: current.kind === "sand_pouring_cylinder" ? { sandBulkDensityGcc: "", sandInConeG: "" } : {},
      }));
      await query.invalidateQueries({ queryKey: ["/api/lab-tests/setup"] });
    } catch (error: any) {
      toast({ title: "Could not save calibration", description: error.message, variant: "destructive" });
    }
  }
  async function saveBenchmark(value: any, selectedProjectId: number | null) {
    try {
      const payload = {
        ...value,
        materialId: value.materialId ? Number(value.materialId) : null,
        boqProjectId: selectedProjectId,
        mddGcc: Number(value.mddGcc),
        omcPercent: Number(value.omcPercent),
        specificGravity: value.specificGravity === "" ? null : Number(value.specificGravity),
      };
      if (editingBenchmarkId) {
        await apiRequest("PATCH", `/api/lab-tests/benchmarks/${editingBenchmarkId}`, { ...payload, reason: benchmarkReason });
      } else await apiRequest("POST", "/api/lab-tests/benchmarks", payload);
      toast({ title: editingBenchmarkId ? "Benchmark updated" : "Benchmark saved" });
      setEditingBenchmarkId(null);
      setBenchmarkReason("");
      setBenchmarkForm({ materialId: "", sourceName: "", mddGcc: "", omcPercent: "", specificGravity: "", effectiveFrom: today() });
      await query.invalidateQueries({ queryKey: ["/api/lab-tests/setup"] });
    } catch (error: any) {
      toast({ title: "Could not save benchmark", description: error.message, variant: "destructive" });
    }
  }
  async function saveSpecs(itemId: number, specs: any[]) {
    try {
      await apiRequest("POST", `/api/lab-tests/specs/${itemId}`, { specs });
      toast({ title: "Quality specifications saved" });
      await query.invalidateQueries({ queryKey: ["/api/lab-tests/setup"] });
    } catch (error: any) {
      toast({ title: "Could not save specifications", description: error.message, variant: "destructive" });
    }
  }
}

function FieldInput({ label, value, onChange, type = "text", placeholder, min, max, step }: {
  label: string; value: unknown; onChange: (value: string) => void; type?: string;
  placeholder?: string; min?: number; max?: number; step?: number;
}) {
  const id = `lab-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={numberInput(value)} placeholder={placeholder}
        min={min} max={max} step={step} onChange={event => onChange(event.target.value)} className="bg-white" />
    </div>
  );
}

function FieldSelect({ label, value, options, onChange, optional = false }: {
  label: string; value: string; options: readonly (readonly [string, string])[] | Array<[string, string]>;
  onChange: (value: string) => void; optional?: boolean;
}) {
  const id = `lab-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const selected = value || (optional ? "__none" : "");
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={selected} onValueChange={next => onChange(next === "__none" ? "" : next)}>
        <SelectTrigger id={id} className="bg-white"><SelectValue placeholder={`Choose ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value="__none">None</SelectItem>}
          {options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function labelForTest(type: string) {
  return TEST_TYPES.find(test => test.value === type)?.label ?? type;
}

function ResultCell({ label, value, unit }: { label: string; value: unknown; unit?: string }) {
  return <div className="rounded border bg-slate-100 px-3 py-2"><span className="block text-xs text-slate-600">{label}</span><strong>{value == null || value === "" ? "—" : `${value}${unit ? ` ${unit}` : ""}`}</strong></div>;
}

function NumericTable({ title, columns, rows, onRow, onAdd, maxRows = 6 }: {
  title: string;
  columns: Array<{ key: string; label: string; type?: string }>;
  rows: any[];
  onRow: (index: number, key: string, value: string) => void;
  onAdd?: () => void;
  maxRows?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3>{onAdd && rows.length < maxRows && <Button type="button" size="sm" variant="outline" onClick={onAdd}>Add trial</Button>}</div>
      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead><tr className="bg-slate-50">{columns.map(column => <th key={column.key} className="p-2 text-left">{column.label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="border-t">
            <td className="p-2">{index + 1}</td>
            {columns.slice(1).map(column => <td key={column.key} className="min-w-28 p-1">
              <Input type={column.type ?? "number"} step={column.type === "number" ? "any" : undefined} value={numberInput(row[column.key])} onChange={event => onRow(index, column.key, event.target.value)} aria-label={`${title} ${index + 1} ${column.label}`} className="h-9 bg-white" />
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function TestReadings({ testType, readings, results, activeCalibration, onReading, onArrayRow }: {
  testType: SoilLabTestType; readings: Record<string, any>; results: any;
  personnel: any[]; activeCalibration: any;
  onReading: (key: string, value: any) => void;
  onArrayRow: (key: string, index: number, field: string, value: any) => void;
}) {
  const pits = Array.isArray(readings.pits) && readings.pits.length ? readings.pits : [{}];
  const trials = Array.isArray(readings.trials) ? readings.trials : [];
  const liquidTrials = Array.isArray(readings.liquidLimitTrials) ? readings.liquidLimitTrials : [];
  const plasticTrials = Array.isArray(readings.plasticLimitTrials) ? readings.plasticLimitTrials : [];
  const updatePit = (index: number, key: string, value: string) => onArrayRow("pits", index, key, value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value);
  const updateTrial = (index: number, key: string, value: string) => onArrayRow("trials", index, key, value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value);
  const updateLiquid = (index: number, key: string, value: string) => onArrayRow("liquidLimitTrials", index, key, value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value);
  const updatePlastic = (index: number, key: string, value: string) => onArrayRow("plasticLimitTrials", index, key, value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value);
  const addRow = (key: string, current: any[], initial: any = {}) => onReading(key, [...current, initial]);

  if (testType === "field_density_sand" || testType === "field_density_core_cutter") {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Field density readings</h3>
        {pits.map((pit: any, index: number) => {
          const calculated = results?.pits?.[index] ?? {};
          return <div key={index} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between"><h4 className="font-semibold">Pit {index + 1}</h4>{pits.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => onReading("pits", pits.filter((_: any, i: number) => i !== index))}>Remove</Button>}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FieldInput label="Chainage (km)" value={pit.chainage ?? ""} onChange={value => updatePit(index, "chainage", value)} placeholder="2+600" />
              <FieldSelect label="Side" value={pit.side ?? ""} options={[["Centre", "Centre"], ["LHS", "LHS"], ["RHS", "RHS"], ["Both", "Both"]]} onChange={value => updatePit(index, "side", value)} optional />
              <FieldInput label="Offset (m)" type="number" value={pit.offsetM ?? ""} onChange={value => updatePit(index, "offsetM", value)} />
              <FieldInput label="Depth (mm)" type="number" value={pit.depthMm ?? ""} onChange={value => updatePit(index, "depthMm", value)} />
            </div>
            {testType === "field_density_sand" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <FieldInput label="W1 — cylinder + sand before (g)" type="number" value={pit.w1 ?? ""} onChange={value => updatePit(index, "w1", value)} />
                <FieldInput label="W2 — cylinder + sand after (g)" type="number" value={pit.w2 ?? ""} onChange={value => updatePit(index, "w2", value)} />
                <FieldInput label="W3 — sand in cone (g)" type="number" value={pit.w3 ?? activeCalibration?.values?.sandInConeG ?? ""} onChange={value => updatePit(index, "w3", value)} />
                <FieldInput label="Wet soil weight Ww (g)" type="number" value={pit.wetSoilWeight ?? ""} onChange={value => updatePit(index, "wetSoilWeight", value)} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <FieldInput label="Soil + cutter (g)" type="number" value={pit.soilAndCutterWeight ?? ""} onChange={value => updatePit(index, "soilAndCutterWeight", value)} />
                <FieldInput label="Cutter weight (g)" type="number" value={pit.cutterWeight ?? activeCalibration?.values?.cutterWeightG ?? ""} onChange={value => updatePit(index, "cutterWeight", value)} />
                <FieldInput label="Cutter volume (cc)" type="number" value={pit.cutterVolume ?? activeCalibration?.values?.cutterVolumeCc ?? ""} onChange={value => updatePit(index, "cutterVolume", value)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FieldSelect label="Moisture method" value={pit.moistureMethod ?? "oven"} options={[["oven", "Oven"], ["speedy", "Speedy meter"]]} onChange={value => updatePit(index, "moistureMethod", value)} />
              {pit.moistureMethod === "speedy" ? (
                <FieldInput label="Speedy indicated moisture (%)" type="number" value={pit.speedyIndicated ?? ""} onChange={value => updatePit(index, "speedyIndicated", value)} />
              ) : <>
                <FieldInput label="W5 — empty container (g)" type="number" value={pit.w5 ?? ""} onChange={value => updatePit(index, "w5", value)} />
                <FieldInput label="W6 — container + wet soil (g)" type="number" value={pit.w6 ?? ""} onChange={value => updatePit(index, "w6", value)} />
                <FieldInput label="W7 — container + dry soil (g)" type="number" value={pit.w7 ?? ""} onChange={value => updatePit(index, "w7", value)} />
              </>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ResultCell label="Pit volume" value={calculated.pitVolumeCc} unit="cc" />
              <ResultCell label="Bulk density" value={calculated.bulkDensityGcc} unit="g/cc" />
              <ResultCell label="Dry density" value={calculated.dryDensityGcc} unit="g/cc" />
              <ResultCell label="Compaction" value={calculated.compactionPercent} unit="%" />
            </div>
            <div className="flex items-center gap-2"><span className="text-sm">Pit result</span>{verdictBadge(calculated.verdict ?? "na")}</div>
          </div>;
        })}
        {pits.length < 3 && <Button type="button" variant="outline" onClick={() => addRow("pits", pits, {})}>Add pit</Button>}
      </div>
    );
  }

  if (testType === "moisture_content") {
    return <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <FieldSelect label="Method" value={readings.moistureMethod ?? "oven"} options={[["oven", "Oven"], ["speedy", "Speedy meter"]]} onChange={value => onReading("moistureMethod", value)} />
        {readings.moistureMethod === "speedy" ? <FieldInput label="Speedy indicated moisture (%)" type="number" value={readings.speedyIndicated ?? ""} onChange={value => onReading("speedyIndicated", value === "" ? "" : Number(value))} /> : <>
          <FieldInput label="W5 — empty container (g)" type="number" value={readings.w5 ?? ""} onChange={value => onReading("w5", value === "" ? "" : Number(value))} />
          <FieldInput label="W6 — container + wet soil (g)" type="number" value={readings.w6 ?? ""} onChange={value => onReading("w6", value === "" ? "" : Number(value))} />
          <FieldInput label="W7 — container + dry soil (g)" type="number" value={readings.w7 ?? ""} onChange={value => onReading("w7", value === "" ? "" : Number(value))} />
        </>}
      </div>
      <ResultCell label="Moisture content" value={results?.moisturePercent} unit="%" />
    </div>;
  }

  if (testType === "proctor_light" || testType === "proctor_modified") {
    const rows = trials.length ? trials : Array.from({ length: 3 }, () => ({}));
    const graph = (results?.graph ?? []).map((point: any) => ({ ...point, moisturePercent: Number(point.moisturePercent), dryDensityGcc: Number(point.dryDensityGcc) }));
    const zeroAirVoids = results?.zeroAirVoids ?? [];
    return <div className="space-y-4">
      <NumericTable title="Compaction trials" rows={rows} maxRows={6}
        columns={[{ key: "trial", label: "Trial" }, { key: "w1", label: "Empty mould W1 (g)" }, { key: "w2", label: "Mould + wet soil W2 (g)" }, { key: "volumeCc", label: "Mould volume (cc)" }, { key: "moistureMethod", label: "Moisture method", type: "text" }, { key: "w5", label: "W5 empty pan" }, { key: "w6", label: "W6 wet pan" }, { key: "w7", label: "W7 dry pan" }]}
        onRow={updateTrial} onAdd={() => addRow("trials", rows, {})} />
      <div className="grid grid-cols-2 gap-2"><ResultCell label="MDD" value={results?.mddGcc} unit="g/cc" /><ResultCell label="OMC" value={results?.omcPercent} unit="%" /></div>
      {graph.length > 0 && <TestLineChart data={graph} xKey="moisturePercent" yKey="dryDensityGcc" xLabel="Water content (%)" yLabel="Dry density (g/cc)" secondary={zeroAirVoids} />}
      {results?.mddGcc == null && <p className="text-sm text-amber-800">Add a trial on the missing side of the peak to calculate MDD and OMC.</p>}
    </div>;
  }

  if (testType === "cbr") {
    const dial = readings.dialReadings ?? {};
    const chart = (results?.points ?? []).filter((point: any) => point.loadKg != null);
    return <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <FieldInput label="Proving ring constant (kg/div)" type="number" value={readings.ringConstantKgPerDivision ?? activeCalibration?.values?.ringConstantKgPerDivision ?? ""} onChange={value => onReading("ringConstantKgPerDivision", value === "" ? "" : Number(value))} />
        <FieldInput label="Initial swell gauge" type="number" value={readings.initialSwellGauge ?? ""} onChange={value => onReading("initialSwellGauge", value === "" ? "" : Number(value))} />
        <FieldInput label="Final swell gauge" type="number" value={readings.finalSwellGauge ?? ""} onChange={value => onReading("finalSwellGauge", value === "" ? "" : Number(value))} />
        <FieldInput label="Specimen height (mm)" type="number" value={readings.specimenHeightMm ?? ""} onChange={value => onReading("specimenHeightMm", value === "" ? "" : Number(value))} />
        <FieldInput label="Mould density before soaking (g/cc)" type="number" value={readings.mouldDensityBeforeSoaking ?? ""} onChange={value => onReading("mouldDensityBeforeSoaking", value === "" ? "" : Number(value))} />
        <FieldInput label="Moisture before soaking (%)" type="number" value={readings.moistureBeforeSoaking ?? ""} onChange={value => onReading("moistureBeforeSoaking", value === "" ? "" : Number(value))} />
        <FieldInput label="Mould density after soaking (g/cc)" type="number" value={readings.mouldDensityAfterSoaking ?? ""} onChange={value => onReading("mouldDensityAfterSoaking", value === "" ? "" : Number(value))} />
        <FieldInput label="Moisture after soaking (%)" type="number" value={readings.moistureAfterSoaking ?? ""} onChange={value => onReading("moistureAfterSoaking", value === "" ? "" : Number(value))} />
      </div>
      <div className="overflow-x-auto rounded border"><table className="min-w-full text-sm"><thead><tr className="bg-slate-50"><th className="p-2">Penetration (mm)</th><th className="p-2">Dial reading</th><th className="p-2">Load (kg)</th></tr></thead><tbody>
        {PENETRATIONS.map(value => {
          const point = results?.points?.find((item: any) => item.penetrationMm === value);
          return <tr className="border-t" key={value}><td className="p-2 text-center">{value}</td><td className="p-1"><Input aria-label={`Dial at ${value} mm`} type="number" value={dial[String(value)] ?? ""} onChange={event => onReading("dialReadings", { ...dial, [String(value)]: Number(event.target.value) })} className="h-9 bg-white" /></td><td className="bg-slate-100 p-2 text-center">{point?.loadKg ?? "—"}</td></tr>;
        })}
      </tbody></table></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ResultCell label="CBR at 2.5 mm" value={results?.cbrAt25Percent} unit="%" />
        <ResultCell label="CBR at 5.0 mm" value={results?.cbrAt50Percent} unit="%" />
        <ResultCell label="Reported CBR" value={results?.reportedCbrPercent} unit="%" />
        <ResultCell label="Swell" value={results?.swellPercent} unit="%" />
      </div>
      {chart.length > 0 && <TestLineChart data={chart} xKey="penetrationMm" yKey="loadKg" xLabel="Penetration (mm)" yLabel="Load (kg)" />}
    </div>;
  }

  const flowRows = liquidTrials.length ? liquidTrials : Array.from({ length: 3 }, () => ({}));
  const plasticRows = plasticTrials.length ? plasticTrials : Array.from({ length: 2 }, () => ({}));
  const flowPoints = (results?.flowLine ?? []).map((point: any) => ({ blows: point.blows, moisturePercent: point.moisturePercent }));
  return <div className="space-y-4">
    <NumericTable title="Liquid limit trials" rows={flowRows} maxRows={6}
      columns={[{ key: "trial", label: "Trial" }, { key: "blows", label: "Blows" }, { key: "moistureMethod", label: "Method", type: "text" }, { key: "w5", label: "W5 empty pan" }, { key: "w6", label: "W6 wet pan" }, { key: "w7", label: "W7 dry pan" }]}
      onRow={updateLiquid} onAdd={() => addRow("liquidLimitTrials", flowRows, {})} />
    <div className="flex items-center gap-2"><input id="lab-np" type="checkbox" checked={readings.nonPlastic === true} onChange={event => onReading("nonPlastic", event.target.checked)} /><Label htmlFor="lab-np">Non-plastic (NP)</Label></div>
    {!readings.nonPlastic && <NumericTable title="Plastic limit trials" rows={plasticRows} maxRows={4}
      columns={[{ key: "trial", label: "Trial" }, { key: "moistureMethod", label: "Method", type: "text" }, { key: "w5", label: "W5 empty pan" }, { key: "w6", label: "W6 wet pan" }, { key: "w7", label: "W7 dry pan" }]}
      onRow={updatePlastic} onAdd={() => addRow("plasticLimitTrials", plasticRows, {})} />}
    <div className="grid grid-cols-3 gap-2"><ResultCell label="Liquid limit" value={results?.liquidLimitPercent} unit="%" /><ResultCell label="Plastic limit" value={results?.plasticLimitPercent} unit="%" /><ResultCell label="Plasticity index" value={results?.plasticityIndexPercent} unit="%" /></div>
    {flowPoints.length > 1 && <TestLineChart data={flowPoints} xKey="blows" yKey="moisturePercent" xLabel="Blows (log scale)" yLabel="Moisture (%)" secondary={results?.flowLineFit} secondaryYKey="moisturePercent" secondaryLabel="Best-fit flow line" xScale="log" />}
  </div>;
}

function firstResult(test: any) {
  const result: any = test?.results ?? {};
  return result.pits?.[0]?.compactionPercent ?? result.reportedCbrPercent ?? result.plasticityIndexPercent ?? "—";
}

function TestResultsTable({ testType, readings = {}, results = {} }: { testType: SoilLabTestType; readings?: any; results?: any }) {
  const compactRows = (headers: string[], rows: unknown[][]) => <div className="overflow-x-auto rounded border">
    <table className="min-w-full border-collapse text-sm">
      <thead><tr>{headers.map(header => <th key={header} className="border-b border-black p-2 text-left">{header}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-300 last:border-0">
        {row.map((value, cell) => <td key={cell} className="p-2">{value == null || value === "" ? "—" : String(value)}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
  if (testType === "field_density_sand" || testType === "field_density_core_cutter") {
    const inputs = Array.isArray(readings.pits) ? readings.pits : [];
    const pits = Array.isArray(results.pits) ? results.pits : [];
    const headers = testType === "field_density_sand"
      ? ["Pit", "Chainage", "Side / offset", "Depth (mm)", "W1 (g)", "W2 (g)", "W3 (g)", "Sand density (g/cc)", "Ww (g)", "W4 (g)", "Volume (cc)", "Bulk density (g/cc)", "Water (%)", "Dry density (g/cc)", "MDD (g/cc)", "Compaction (%)", "Required (%)", "Result"]
      : ["Pit", "Chainage", "Side / offset", "Depth (mm)", "Soil + cutter (g)", "Cutter (g)", "Volume (cc)", "Wet density (g/cc)", "Water (%)", "Dry density (g/cc)", "MDD (g/cc)", "Compaction (%)", "Required (%)", "Result"];
    return <div className="space-y-3">
      {compactRows(headers, pits.map((pit: any, index: number) => {
        const input = inputs[index] ?? {};
        const location = `${input.side ?? ""}${input.offsetM !== "" && input.offsetM != null ? ` ${input.offsetM} m` : ""}`.trim();
        return testType === "field_density_sand"
          ? [index + 1, input.chainage, location, input.depthMm, input.w1, input.w2, input.w3 ?? pit.sandInConeG, pit.sandBulkDensityGcc, input.wetSoilWeight, pit.sandWeightG, pit.pitVolumeCc, pit.bulkDensityGcc, pit.moisturePercent, pit.dryDensityGcc, pit.mddGcc, pit.compactionPercent, pit.requiredPercent, pit.verdict?.toUpperCase()]
          : [index + 1, input.chainage, location, input.depthMm, input.soilAndCutterWeight, input.cutterWeight, pit.pitVolumeCc, pit.bulkDensityGcc, pit.moisturePercent, pit.dryDensityGcc, pit.mddGcc, pit.compactionPercent, pit.requiredPercent, pit.verdict?.toUpperCase()];
      }))}
    </div>;
  }
  if (testType === "proctor_light" || testType === "proctor_modified") {
    const trials = Array.isArray(results.trials) ? results.trials : [];
    const graph = Array.isArray(results.graph) ? results.graph : [];
    const inputTrials = Array.isArray(readings.trials) ? readings.trials : [];
    return <div className="space-y-3">
      {compactRows(["Trial", "W1 (g)", "W2 (g)", "Volume (cc)", "W5 (g)", "W6 (g)", "W7 (g)", "Wet soil (g)", "Water content (%)", "Wet density (g/cc)", "Dry density (g/cc)"],
        trials.map((trial: any, index: number) => {
          const input = inputTrials[index] ?? {};
          return [trial.trialNo, input.w1, input.w2, input.volumeCc, input.w5, input.w6, input.w7, trial.wetSoilWeightG, trial.moisturePercent, trial.bulkDensityGcc, trial.dryDensityGcc];
        }))}
      <div className="grid grid-cols-2 gap-3">
        <ResultCell label="Maximum dry density" value={results.mddGcc} unit="g/cc" />
        <ResultCell label="Optimum moisture content" value={results.omcPercent} unit="%" />
      </div>
      {graph.length > 0 && <TestLineChart data={graph} xKey="moisturePercent" yKey="dryDensityGcc" xLabel="Water content (%)" yLabel="Dry density (g/cc)" secondary={results.zeroAirVoids ?? []} peak={results.omcPercent != null && results.mddGcc != null ? { x: results.omcPercent, y: results.mddGcc } : undefined} />}
    </div>;
  }
  if (testType === "cbr") {
    const points = Array.isArray(results.points) ? results.points : [];
    return <div className="space-y-3">
      {compactRows(["Penetration (mm)", "Dial (div)", "Load (kg)"], points.map((point: any) => [point.penetrationMm, point.dial, point.loadKg]))}
      <p className="text-sm">Proving ring: {readings.ringConstantKgPerDivision ?? "—"} kg/div · Swell gauge: {readings.initialSwellGauge ?? "—"} to {readings.finalSwellGauge ?? "—"} mm · Specimen height: {readings.specimenHeightMm ?? "—"} mm</p>
      {compactRows(["Mould density before soaking (g/cc)", "Moisture before soaking (%)", "Mould density after soaking (g/cc)", "Moisture after soaking (%)"], [[
        results.mouldDensityBeforeSoaking, results.moistureBeforeSoaking,
        results.mouldDensityAfterSoaking, results.moistureAfterSoaking,
      ]])}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultCell label="CBR at 2.5 mm" value={results.cbrAt25Percent} unit="%" />
        <ResultCell label="CBR at 5.0 mm" value={results.cbrAt50Percent} unit="%" />
        <ResultCell label="CBR reported (higher value)" value={results.reportedCbrPercent} unit="%" />
        <ResultCell label="Swell after soaking" value={results.swellPercent} unit="%" />
      </div>
      {points.some((point: any) => point.loadKg != null) && <TestLineChart data={points.filter((point: any) => point.loadKg != null)} xKey="penetrationMm" yKey="loadKg" xLabel="Penetration (mm)" yLabel="Load (kg)" referenceXs={[2.5, 5]} />}
    </div>;
  }
  if (testType === "atterberg") {
    return <div className="space-y-3">
      {compactRows(["Liquid-limit blows", "W5 (g)", "W6 (g)", "W7 (g)", "Water content (%)"],
        (Array.isArray(readings.liquidLimitTrials) ? readings.liquidLimitTrials : []).map((trial: any, index: number) => [
          trial.blows, trial.w5, trial.w6, trial.w7, results.flowLine?.[index]?.moisturePercent,
        ]))}
      {!readings.nonPlastic && compactRows(["Plastic-limit trial", "W5 (g)", "W6 (g)", "W7 (g)"],
        (Array.isArray(readings.plasticLimitTrials) ? readings.plasticLimitTrials : []).map((trial: any, index: number) => [
          index + 1, trial.w5, trial.w6, trial.w7,
        ]))}
      <div className="grid grid-cols-3 gap-3">
        <ResultCell label="Liquid limit" value={results.liquidLimitPercent} unit="%" />
        <ResultCell label="Plastic limit" value={results.plasticLimitPercent} unit="%" />
        <ResultCell label="Plasticity index" value={results.plasticityIndexPercent} unit="%" />
      </div>
      {Array.isArray(results.flowLine) && results.flowLine.length > 1 && <TestLineChart data={results.flowLine} xKey="blows" yKey="moisturePercent" xLabel="Blows (log scale)" yLabel="Moisture (%)" secondary={results.flowLineFit} secondaryYKey="moisturePercent" secondaryLabel="Best-fit flow line" xScale="log" />}
    </div>;
  }
  return <ResultCell label="Moisture content" value={results.moisturePercent} unit="%" />;
}

function layerRegisterRows(stretch: { from: string; to: string }, tests: any[]) {
  const from = toKm(stretch.from) ?? 0;
  const to = toKm(stretch.to) ?? Math.max(1, from + 0.1);
  const rows: any[] = [];
  const start = Math.floor(from * 10) / 10;
  const end = Math.ceil(to * 10) / 10;
  for (let km = start; km < end; km += 0.1) {
    const layers: Record<number, any> = {};
    for (const test of tests) {
      const testKm = Number(test.chainageFrom ?? 0);
      const layer = Number(test.layerNo ?? 0);
      if (Math.floor(testKm * 10) / 10 === Math.floor(km * 10) / 10 && layer) layers[layer] ??= test;
    }
    rows.push({ key: km.toFixed(1), chainage: `${chainageText(km)}–${chainageText(km + 0.1)}`, layers });
  }
  return rows;
}

function TestDetailDialog({ test, isOwner, canEdit, onClose, onEdit, onRetest, onPrint, onCancel, correcting, setCorrecting, reason, setReason, onOwnerCorrection }: {
  test: any; isOwner: boolean; canEdit: boolean; onClose: () => void; onEdit: () => void;
  onRetest: () => void; onPrint: () => void; onCancel: (reason: string) => void;
  correcting: boolean; setCorrecting: (value: boolean) => void; reason: string;
  setReason: (value: string) => void; onOwnerCorrection: (reason: string) => void;
}) {
  const [cancelReason, setCancelReason] = useState("");
  const { data: history = [] } = useQuery<any[]>({
    queryKey: ["/api/lab-tests", test.id, "history"],
    queryFn: async () => {
      const response = await fetch(`/api/lab-tests/${test.id}/history`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load test history.");
      return response.json();
    },
  });
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal="true">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
      <div className="flex items-start justify-between gap-2"><div><h2 className="text-lg font-bold">{test.testNo} · {labelForTest(test.testType)}</h2><p className="text-sm text-muted-foreground">{test.projectName} · {test.dateSampled} · {test.itemLabel || test.sampleSourceName}</p></div><Button variant="ghost" onClick={onClose} aria-label="Close">×</Button></div>
      <div className="my-3 flex items-center gap-2">{verdictBadge(test.verdict)}<Badge variant="outline">{test.status}</Badge>{test.retestOfTestId && <span className="text-sm">Retest of #{test.retestOfTestId}</span>}</div>
      <p className="mb-3 text-sm">Site engineer: {displayCaps(test.siteEngineerName) || "—"} · Sampled by: {displayCaps(test.sampledByName) || "—"} · Tested by: {displayCaps(test.testedByName) || "—"}</p>
      <TestResultsTable testType={test.testType} readings={test.readings} results={test.results} />
      {test.attachments?.map((file: any) => <InstalledDocumentLink key={file.id} href={file.objectPath} fileName={file.fileName} className="mt-2 block text-sm underline">{file.fileName}</InstalledDocumentLink>)}
      <details className="mt-3 rounded border p-3">
        <summary className="cursor-pointer font-semibold">Test history</summary>
        {history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No history available.</p> : <div className="mt-2 space-y-2">
          {history.map((entry: any) => <div key={entry.id} className="border-t pt-2 text-sm first:border-0">
            <p><strong>{historyLabel(entry.action)}</strong> · {entry.userName} · {entry.createdAt ? format(new Date(entry.createdAt), "dd MMM yyyy, HH:mm") : "Time unavailable"}</p>
            {entry.reason && <p>Reason: {entry.reason}</p>}
            {(entry.oldValues || entry.newValues) && <p className="text-xs text-muted-foreground">Previous: {resultSummary(entry.oldValues)} · Saved: {resultSummary(entry.newValues)}</p>}
          </div>)}
        </div>}
      </details>
      {correcting && <div className="mt-4 space-y-2 rounded border p-3"><Label htmlFor="correction-reason">Owner correction reason</Label><Textarea id="correction-reason" value={reason} onChange={event => setReason(event.target.value)} /><Button disabled={!reason.trim()} onClick={() => onOwnerCorrection(reason)}>Correct test</Button><Button variant="ghost" onClick={() => setCorrecting(false)}>Cancel</Button></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onPrint}><Printer className="mr-2 h-4 w-4" />Print view</Button>
        {test.verdict === "fail" && test.status === "submitted" && <Button onClick={onRetest}><RefreshCw className="mr-2 h-4 w-4" />Retest</Button>}
        {test.status === "draft" && canEdit && <Button onClick={onEdit}>Edit draft</Button>}
        {test.status === "submitted" && isOwner && <Button variant="outline" onClick={() => setCorrecting(true)}>Correct as Owner</Button>}
        {isOwner && <div className="ml-auto flex min-w-48 items-center gap-2"><Input placeholder="Cancellation reason" value={cancelReason} onChange={event => setCancelReason(event.target.value)} /><Button variant="destructive" onClick={() => onCancel(cancelReason)} disabled={!cancelReason.trim()}>Cancel test</Button></div>}
      </div>
    </div>
  </div>;
}

function historyLabel(action: string) {
  return ({
    create: "Draft saved",
    submit: "Test submitted",
    edit: "Draft updated",
    owner_correction: "Owner correction",
    cancel: "Test cancelled",
    benchmark_edit: "Benchmark updated",
    benchmark_deactivate: "Benchmark deactivated",
  } as Record<string, string>)[action] ?? action;
}

function resultSummary(value: any) {
  if (!value) return "No snapshot";
  const results = value.results ?? {};
  if (Array.isArray(results.pits)) return `${value.verdict ?? "na"} · ${results.pits.map((pit: any) => `${pit.compactionPercent ?? "—"}%`).join(", ")}`;
  if (results.reportedCbrPercent != null) return `${value.verdict ?? "na"} · CBR ${results.reportedCbrPercent}%`;
  if (results.mddGcc != null) return `${value.verdict ?? "na"} · MDD ${results.mddGcc} g/cc, OMC ${results.omcPercent}%`;
  if (results.plasticityIndexPercent != null) return `${value.verdict ?? "na"} · PI ${results.plasticityIndexPercent}%`;
  if (results.moisturePercent != null) return `${value.verdict ?? "na"} · moisture ${results.moisturePercent}%`;
  return String(value.verdict ?? value.status ?? "Saved");
}

function LabTestPrint({ test, project, companyName, onClose }: { test: any; project: any; companyName: string; onClose: () => void }) {
  const name = labelForTest(test.testType);
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-white p-4 sm:p-8 print:static print:overflow-visible print:p-0">
    <div className="mx-auto max-w-4xl print:max-w-none">
      <div className="mb-4 flex gap-2 print:hidden"><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button><Button variant="outline" onClick={onClose}>Close</Button></div>
      <header className="border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-bold">{companyName}</h1>
        <p>{project?.name ?? test.projectName ?? ""}</p>
        <p>{project?.clientName ?? ""}</p>
        <p>{project?.consultantName ?? ""}</p>
        <h2 className="mt-3 text-lg font-bold">{name}</h2>
        <p>{standardForType(test.testType)} · Test no. {test.testNo}</p>
      </header>
      <div className="my-4 grid grid-cols-2 gap-x-8 gap-y-2 border-b border-black pb-3 text-sm sm:grid-cols-4">
        <PrintFact label="Site" value={test.siteName} /><PrintFact label="Date sampled" value={test.dateSampled} />
        <PrintFact label="Date tested" value={test.dateTested} /><PrintFact label="Place" value={test.place} />
        <PrintFact label="BOQ item" value={test.itemLabel} /><PrintFact label="Layer" value={test.layer} /><PrintFact label="Layer number" value={test.layerNo} />
        <PrintFact label="Chainage" value={`${chainageText(test.chainageFrom)} to ${chainageText(test.chainageTo)}`} /><PrintFact label="Side" value={test.side} />
        <PrintFact label="Sample source" value={test.sampleSourceName} /><PrintFact label="Sample no." value={test.sampleNo} />
        <PrintFact label="Site engineer" value={displayCaps(test.siteEngineerName)} /><PrintFact label="Sampled by" value={displayCaps(test.sampledByName)} /><PrintFact label="Tested by" value={displayCaps(test.testedByName)} />
      </div>
      <h3 className="font-bold">Calculated results</h3>
      <div className="my-2 border border-black p-3 text-sm print:text-xs">
        <TestResultsTable testType={test.testType} readings={test.readings} results={test.results} />
      </div>
      <div className="my-3 flex items-center gap-3"><strong>Verdict</strong><span className="border border-black px-2 py-1 font-extrabold">{String(test.verdict ?? "na").toUpperCase()}</span></div>
      <p className="min-h-12 border-b border-black text-sm"><strong>Remarks: </strong>{test.remarks ?? ""}</p>
      <div className="mt-16 grid grid-cols-2 gap-12 text-center text-sm"><div className="border-t border-black pt-2">For {companyName}<br />Lab in-charge</div><div className="border-t border-black pt-2">Consultant's / Department representative</div></div>
    </div>
    <style>{`@media print { body * { visibility: hidden !important; } .fixed.inset-0, .fixed.inset-0 * { visibility: visible !important; } .fixed.inset-0 { position: absolute !important; inset: 0 !important; } }`}</style>
  </div>;
}

function standardForType(testType: SoilLabTestType) {
  return ({
    field_density_sand: "IS 2720 Part 28",
    field_density_core_cutter: "IS 2720 Part 29",
    moisture_content: "IS 2720 Part 2",
    proctor_light: "IS 2720 Part 7",
    proctor_modified: "IS 2720 Part 8",
    cbr: "IS 2720 Part 16",
    atterberg: "IS 2720 Part 5",
  } as Record<SoilLabTestType, string>)[testType];
}

function PrintFact({ label, value }: { label: string; value: unknown }) {
  return <div><span className="block text-xs font-semibold">{label}</span><span>{value == null || value === "" ? " " : String(value)}</span></div>;
}
