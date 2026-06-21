import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, FileSpreadsheet, Settings2, Loader2,
  Check, CalendarDays, Truck, MapPin, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BoqProject } from "@shared/schema";
import { WORKING_DAYS_DEFAULT, WORKING_HRS_DEFAULT } from "@shared/planningEngine";

export default function BoqProgramSettings() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { toast } = useToast();

  const { data: project, isLoading } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const [workingDays, setWorkingDays] = useState("");
  const [workingHrs, setWorkingHrs] = useState("");
  const [hmp, setHmp] = useState("");
  const [wmm, setWmm] = useState("");
  const [quarry, setQuarry] = useState("");
  const [speed, setSpeed] = useState("30");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (project && !initialized) {
      setWorkingDays(String(project.workingDaysPerMonth ?? WORKING_DAYS_DEFAULT));
      setWorkingHrs(String(project.workingHoursPerDay ?? WORKING_HRS_DEFAULT));
      setHmp(project.hmpChainageKm != null ? String(project.hmpChainageKm) : "");
      setWmm(project.wmmPlantChainageKm != null ? String(project.wmmPlantChainageKm) : "");
      setQuarry(project.quarryChainageKm != null ? String(project.quarryChainageKm) : "");
      setSpeed(String(project.avgTipperSpeedKmHr ?? 30));
      setInitialized(true);
    }
  }, [project, initialized]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/boq/projects/${projectId}`, {
        workingDaysPerMonth: parseInt(workingDays) || WORKING_DAYS_DEFAULT,
        workingHoursPerDay: parseInt(workingHrs) || WORKING_HRS_DEFAULT,
        hmpChainageKm: hmp ? parseFloat(hmp) : null,
        wmmPlantChainageKm: wmm ? parseFloat(wmm) : null,
        quarryChainageKm: quarry ? parseFloat(quarry) : null,
        avgTipperSpeedKmHr: speed ? parseFloat(speed) : 30,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boq/projects", projectId] });
      toast({ title: "Program settings saved" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading project…
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
    <div className="space-y-5 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="breadcrumb">
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
      <div className="flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-slate-800">Program Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{project.name}</p>
        </div>
      </div>

      {/* Schedule Defaults */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2 px-4 pt-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-slate-700">Schedule Defaults</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Used by the Work Programme to calculate auto-duration for BOQ items.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">WORKING DAYS / MONTH</Label>
              <Input
                type="number"
                min="1"
                max="31"
                step="1"
                className="h-9 mt-1"
                placeholder={String(WORKING_DAYS_DEFAULT)}
                value={workingDays}
                onChange={e => setWorkingDays(e.target.value)}
                data-testid="input-working-days"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Default: {WORKING_DAYS_DEFAULT} days/month
              </p>
            </div>
            <div>
              <Label className="text-xs">WORKING HOURS / DAY</Label>
              <Input
                type="number"
                min="1"
                max="24"
                step="0.5"
                className="h-9 mt-1"
                placeholder={String(WORKING_HRS_DEFAULT)}
                value={workingHrs}
                onChange={e => setWorkingHrs(e.target.value)}
                data-testid="input-working-hours"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Default: {WORKING_HRS_DEFAULT} hrs/day
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-[11px] text-blue-700">
            Auto-duration = (BOQ qty ÷ bottleneck output) ÷ ({workingHrs || WORKING_HRS_DEFAULT} hrs/day) ÷ ({workingDays || WORKING_DAYS_DEFAULT} days/month)
          </div>
        </CardContent>
      </Card>

      {/* Source Locations */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2 px-4 pt-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-slate-700">Source Locations</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Distances from the mid-project chainage to each supply source. Used to auto-compute tipper haul distance in item recipes.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">HMP CHAINAGE (km)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                className="h-9 mt-1"
                placeholder="e.g. 8.5"
                value={hmp}
                onChange={e => setHmp(e.target.value)}
                data-testid="input-hmp-chainage"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Hot Mix Plant → site</p>
            </div>
            <div>
              <Label className="text-xs">WMM PLANT CHAINAGE (km)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                className="h-9 mt-1"
                placeholder="e.g. 5.0"
                value={wmm}
                onChange={e => setWmm(e.target.value)}
                data-testid="input-wmm-chainage"
              />
              <p className="text-[10px] text-muted-foreground mt-1">WMM Plant → site</p>
            </div>
            <div>
              <Label className="text-xs">QUARRY CHAINAGE (km)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                className="h-9 mt-1"
                placeholder="e.g. 12.0"
                value={quarry}
                onChange={e => setQuarry(e.target.value)}
                data-testid="input-quarry-chainage"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Quarry → site</p>
            </div>
            <div>
              <Label className="text-xs">AVG TIPPER SPEED (km/hr)</Label>
              <Input
                type="number"
                step="1"
                min="1"
                className="h-9 mt-1"
                placeholder="30"
                value={speed}
                onChange={e => setSpeed(e.target.value)}
                data-testid="input-tipper-speed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Default: 30 km/hr</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tipper fleet info */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2 px-4 pt-3">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Tipper Fleet Defaults</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            When you open the Equipment tab on a BOQ item recipe, the tipper fleet calculator
            is pre-populated with the haul distance and speed from settings above
            based on the item's layer type (Bituminous → HMP, Granular/Plant → WMM, Granular/Quarry → Quarry).
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            {[
              { label: "Bituminous haul", val: hmp || "—", unit: "km" },
              { label: "Granular/Plant haul", val: wmm || "—", unit: "km" },
              { label: "Granular/Quarry haul", val: quarry || "—", unit: "km" },
            ].map(({ label, val, unit }) => (
              <div key={label} className="rounded border border-slate-200 bg-slate-50 py-2 px-1">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className="text-sm font-bold text-slate-700 mt-0.5">{val} {val !== "—" ? unit : ""}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
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
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-program-settings"
        >
          {saveMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Saving…</>
            : <><Check className="w-4 h-4 mr-1.5" /> Save Settings</>}
        </Button>
      </div>
    </div>
  );
}
