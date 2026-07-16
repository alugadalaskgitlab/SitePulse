import { useState, useEffect, useMemo } from "react";
import { useFeatureFlags } from "@/lib/featureFlags";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Users, Package, Layers, Truck, Settings, Gauge, Droplets, ChevronRight, ChevronDown, ChevronUp, Loader2, Pencil, Trash2, Download, Printer, Lock, ArrowUpRight, RotateCcw, AlertTriangle, Shield, Fuel, Power, ClipboardList, Receipt, FileText, ArrowRightLeft, Scale, Flame, X, MapPin, Check, Wrench, FlaskConical, TestTube, BarChart3, Cylinder } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { queryClient, apiRequest, isForbiddenError, NO_PERMISSION_DESCRIPTION, NO_CREATE_PERMISSION_DESCRIPTION } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import type { Party, PlantMaterial, MixTemplate, EquipmentMasterType, MixType, MaterialOpeningStock, Personnel, LdoFlowReading, PlantSettings, PlantSettingsWithSite, Site } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import type { PlantTankConfig, SingleTankConfig, TankSlot } from "@shared/tank-calibration";
import { generateChartPreview, parseTankConfig, getTankCapacity, TANK_SHAPE_LABELS, TANK_SLOT_LABELS } from "@shared/tank-calibration";
import { EQUIPMENT_TYPES, METER_TYPES, PERSONNEL_ROLES } from "@shared/schema";
import { computeTankStock } from "@/lib/ldoStock";
import { format } from "date-fns";

export default function Plant() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString || window.location.search);
  const tabParam = params.get("tab");

  const initialView = ((): "home" | "hmp" | "fleet" | "reports" => {
    if (tabParam === "operations") return "hmp";
    if (tabParam === "stock" || tabParam === "reports") return "reports";
    return "home";
  })();

  const [plantView, setPlantView] = useState<"home" | "hmp" | "fleet" | "reports">(initialView);
  const { isAdmin, isManager } = useAuth();
  const { rmcEnabled } = useFeatureFlags();

  const { data: allPlantSettings } = useQuery<PlantSettingsWithSite[]>({
    queryKey: ['/api/plant-module/plant-settings'],
    enabled: isAdmin,
  });
  const primaryPlantName = allPlantSettings?.[0]?.plantName;
  const currentPlantType = (
    allPlantSettings?.find(s => s.plantName === primaryPlantName) ?? allPlantSettings?.[0]
  )?.plantType ?? "hma";

  const { getBackLink } = useOrigin();
  const backLink = getBackLink("/");

  const VIEW_SUBTITLES: Record<string, string> = {
    home: "Hot-mix plant operations and material tracking",
    hmp: "Heating sessions, shift logs & production dispatches",
    fleet: "Equipment usage, maintenance & fleet management",
    reports: "Production reports, stock ledgers & finance",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          {plantView === "home" ? (
            <Link href={backLink}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setPlantView("home")} data-testid="button-back-to-home">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Plant Dashboard</h1>
            <p className="text-muted-foreground mt-1">{VIEW_SUBTITLES[plantView]}</p>
          </div>
        </div>
        {(isAdmin || isManager) && plantView === "home" && (
          <div className="flex gap-2">
            {isAdmin && (
              <a
                href={primaryPlantName
                  ? `/api/admin/operator-manual.pdf?plant=${encodeURIComponent(primaryPlantName)}`
                  : '/api/admin/operator-manual.pdf'}
                download="plant-operator-guide.pdf"
                data-testid="link-operator-manual"
              >
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  Operator Guide (PDF)
                </Button>
              </a>
            )}
            <a
              href={primaryPlantName
                ? `/api/admin/admin-guide.pdf?plant=${encodeURIComponent(primaryPlantName)}`
                : '/api/admin/admin-guide.pdf'}
              download="plant-admin-guide.pdf"
              data-testid="link-admin-guide"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <FileText className="w-4 h-4" />
                Admin Guide (PDF)
              </Button>
            </a>
          </div>
        )}
      </div>

      {plantView === "home" && (
        <PlantHomeCards
          plantType={currentPlantType}
          plantName={primaryPlantName}
          rmcEnabled={rmcEnabled}
          onNavigate={setPlantView}
        />
      )}
      {plantView === "hmp" && (
        <HMPOpsView plantType={currentPlantType} plantName={primaryPlantName} />
      )}
      {plantView === "fleet" && (
        <EquipmentFleetView plantName={primaryPlantName} />
      )}
      {plantView === "reports" && (
        <ReportsAnalysisView plantType={currentPlantType} rmcEnabled={rmcEnabled} />
      )}
    </div>
  );
}

function PlantHomeCards({
  plantType,
  plantName,
  rmcEnabled,
  onNavigate,
}: {
  plantType: string;
  plantName?: string;
  rmcEnabled: boolean;
  onNavigate: (view: "hmp" | "fleet" | "reports") => void;
}) {
  const { sectionVisible, isAdmin, isManager } = useAuth();
  const { appendPlantContext } = useOrigin();

  const { data: openCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/maintenance/open-count"],
    enabled: sectionVisible("plant_equipment"),
    staleTime: 5 * 60 * 1000,
  });
  const openBreakdownCount = openCountData?.count ?? 0;

  const isHma = plantType !== "rmc";

  const hmpVisible =
    isHma && (
      sectionVisible("plant_production") ||
      sectionVisible("plant_shift_logs") ||
      sectionVisible("plant_heating") ||
      sectionVisible("site_procurement") ||
      sectionVisible("site_diesel")
    );
  const fleetVisible = sectionVisible("plant_equipment") || sectionVisible("site_diesel");
  const reportsVisible =
    sectionVisible("plant_daily_reports") ||
    sectionVisible("plant_heating") ||
    sectionVisible("plant_stock") ||
    sectionVisible("plant_variance") ||
    sectionVisible("plant_audit") ||
    sectionVisible("plant_diesel_proc") ||
    sectionVisible("plant_bitumen") ||
    sectionVisible("plant_ldo") ||
    sectionVisible("vendor_bills") ||
    sectionVisible("vendor_bills_view") ||
    sectionVisible("vendor_bills_raise") ||
    sectionVisible("vendor_bills_verify") ||
    sectionVisible("vendor_bills_approve");
  const mastersVisible =
    sectionVisible("master_parties") ||
    sectionVisible("master_materials") ||
    sectionVisible("master_equipment") ||
    sectionVisible("master_personnel");

  return (
    <div className="space-y-4">
      {rmcEnabled && (
        <Link href="/plant/rmc">
          <Card className="hover-elevate cursor-pointer border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-900/10" data-testid="tile-rmc-hub-shortcut">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0">
                <FlaskConical className="w-5 h-5 text-teal-700 dark:text-teal-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base text-teal-800 dark:text-teal-200">RMC Operations</h3>
                <p className="text-sm text-muted-foreground">Batch records, delivery challans, cube tests &amp; more</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {hmpVisible && (
          <button className="text-left w-full" onClick={() => onNavigate("hmp")} data-testid="tile-hmp-ops">
            <Card className="hover-elevate cursor-pointer h-full border-orange-200 dark:border-orange-800">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                  <Flame className="w-7 h-7 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">HMP Operations</h3>
                  <p className="text-sm text-muted-foreground">Shift logs, heating sessions &amp; production dispatches</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </button>
        )}

        {fleetVisible && (
          <button className="text-left w-full" onClick={() => onNavigate("fleet")} data-testid="tile-equipment-fleet">
            <Card className="hover-elevate cursor-pointer h-full border-blue-200 dark:border-blue-800">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="relative w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Wrench className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                  {openBreakdownCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-sm font-bold flex items-center justify-center">{openBreakdownCount}</span>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Equipment &amp; Fleet</h3>
                  <p className="text-sm text-muted-foreground">
                    {openBreakdownCount > 0
                      ? <span className="text-destructive font-medium">{openBreakdownCount} open breakdown{openBreakdownCount !== 1 ? "s" : ""}</span>
                      : "Usage logs, breakdowns & diesel tracking"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </button>
        )}

        {reportsVisible && (
          <button className="text-left w-full" onClick={() => onNavigate("reports")} data-testid="tile-reports-analysis">
            <Card className="hover-elevate cursor-pointer h-full border-purple-200 dark:border-purple-800">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Reports &amp; Analysis</h3>
                  <p className="text-sm text-muted-foreground">Production reports, stock ledgers &amp; finance</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </button>
        )}

        {mastersVisible && (
          <Link href="/masters/hub" className="text-left w-full block" data-testid="tile-masters-config">
            <Card className="hover-elevate cursor-pointer h-full">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center shrink-0">
                  <Settings className="w-7 h-7 text-slate-600 dark:text-slate-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Masters &amp; Config</h3>
                  <p className="text-sm text-muted-foreground">Parties, materials, equipment &amp; personnel</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}

function HMPOpsView({ plantType = "hma", plantName }: { plantType?: string; plantName?: string }) {
  const { appendPlantContext } = useOrigin();
  const { sectionVisible } = useAuth();
  const opLink = (path: string) => appendPlantContext(path, { defaultTab: "operations" });
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {sectionVisible("plant_production") && (
        <Link href={opLink("/plant/dispatches")}>
          <Card className="hover-elevate cursor-pointer h-full">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Truck className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Plant Production &amp; Dispatches</h3>
                <p className="text-sm text-muted-foreground">Log outgoing truck loads with mix data</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {sectionVisible("plant_shift_logs") && (
        <Link href={opLink("/plant/shift-log")}>
          <Card className="hover-elevate cursor-pointer h-full border-blue-200 dark:border-blue-800" data-testid="tile-today-shift-log">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Pencil className="w-7 h-7 text-blue-700 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Plant Log</h3>
                <p className="text-sm text-muted-foreground">View plant shift logs or start a new entry</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {sectionVisible("plant_heating") && (
        <Link href={opLink(`/plant/heating-sessions/${todayStr}`)}>
          <Card className="hover-elevate cursor-pointer h-full border-orange-200 dark:border-orange-800" data-testid="tile-heating-sessions">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Flame className="w-7 h-7 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Bitumen Heating Sessions</h3>
                <p className="text-sm text-muted-foreground">Per-session boiler runs – night pre-heat + day-time, with optional inline DG</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {sectionVisible("site_procurement") && (
        <Link href={opLink("/plant/purchase-indents")}>
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-purchase-indents">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <ClipboardList className="w-7 h-7 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Purchase Indents</h3>
                <p className="text-sm text-muted-foreground">Raise and track material purchase requests</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {sectionVisible("site_diesel") && (
        <Link href={opLink("/plant/diesel-requirements")}>
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-diesel-requirements">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Fuel className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Daily Diesel Requirements</h3>
                <p className="text-sm text-muted-foreground">Plan and track daily diesel needs per equipment</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}

function EquipmentFleetView({ plantName }: { plantName?: string }) {
  const { appendPlantContext } = useOrigin();
  const { sectionVisible, isAdmin } = useAuth();
  const opLink = (path: string) => appendPlantContext(path, { defaultTab: "operations" });

  const { data: openCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/maintenance/open-count"],
    enabled: sectionVisible("plant_equipment"),
    staleTime: 5 * 60 * 1000,
  });
  const openBreakdownCount = openCountData?.count ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {sectionVisible("plant_equipment") && (
        <Link href={opLink("/plant/equipment-usage") + (plantName ? `&plant=${encodeURIComponent(plantName)}` : "")}>
          <Card className="hover-elevate cursor-pointer h-full">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Gauge className="w-7 h-7 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Equipment Usage</h3>
                <p className="text-sm text-muted-foreground">Track meter readings and diesel consumption</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {sectionVisible("plant_equipment") && (
        <Link href={opLink("/plant/maintenance")}>
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-maintenance">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="relative w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Wrench className="w-7 h-7 text-red-600 dark:text-red-400" />
                {openBreakdownCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-sm font-bold flex items-center justify-center" data-testid="badge-open-breakdowns">{openBreakdownCount}</span>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Maintenance &amp; Breakdowns</h3>
                <p className="text-sm text-muted-foreground">
                  {openBreakdownCount > 0
                    ? <span className="text-destructive font-medium">{openBreakdownCount} open breakdown{openBreakdownCount !== 1 ? "s" : ""}</span>
                    : "Log breakdowns, services, PM events and parts used"}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {sectionVisible("site_diesel") && (
        <Link href={opLink("/plant/diesel-requirements")}>
          <Card className="hover-elevate cursor-pointer h-full">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Fuel className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Daily Diesel Requirements</h3>
                <p className="text-sm text-muted-foreground">Plan and track daily diesel needs per equipment</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}

function ReportsAnalysisView({ plantType = "hma", rmcEnabled = false }: { plantType?: string; rmcEnabled?: boolean }) {
  return (
    <div className="space-y-8">
      <ReportsTab plantType={plantType} rmcEnabled={rmcEnabled} />
      <StockDetailsTab plantType={plantType} rmcEnabled={rmcEnabled} />
    </div>
  );
}

function OperationsTab({ plantType = "hma", plantName }: { plantType?: string; plantName?: string }) {
  const { appendPlantContext } = useOrigin();
  const { sectionVisible } = useAuth();
  const { rmcEnabled } = useFeatureFlags();
  const opLink = (path: string) => appendPlantContext(path, { defaultTab: "operations" });
  // Task #763: isRmc is driven purely by the feature flag; the plantType guard was removed
  // because plant_settings may be empty (defaulting to "hma"), hiding RMC navigation even
  // when the RMC module is intentionally enabled.
  const isRmc = rmcEnabled;

  const { data: openCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/maintenance/open-count"],
    enabled: sectionVisible("plant_equipment"),
    staleTime: 5 * 60 * 1000,
  });
  const openBreakdownCount = openCountData?.count ?? 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: cubeTestStatsData } = useQuery<{ failCount: number }>({
    queryKey: ["/api/rmc/cube-tests/stats", thirtyDaysAgo],
    queryFn: () => apiRequest("GET", `/api/rmc/cube-tests/stats?dateFrom=${thirtyDaysAgo}`).then(r => r.json()),
    enabled: isRmc && sectionVisible("plant_production"),
    staleTime: 5 * 60 * 1000,
  });
  const cubeTestFailCount = cubeTestStatsData?.failCount ?? 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: rmcSummary, isLoading: rmcSummaryLoading } = useQuery<{
    date: string;
    totalVolumeM3: number;
    totalBatches: number;
    byGrade: { grade: string; volumeM3: number; batchesCount: number }[];
  }>({
    queryKey: ["/api/rmc/today-summary", plantName, todayStr],
    queryFn: async () => {
      const params = new URLSearchParams({ date: todayStr });
      if (plantName) params.set("plantName", plantName);
      const r = await fetch(`/api/rmc/today-summary?${params}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: isRmc && sectionVisible("plant_production"),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {!isRmc && sectionVisible("plant_production") && (
      <Link href={opLink("/plant/dispatches")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Truck className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Plant Production and Dispatches</h3>
              <p className="text-sm text-muted-foreground">Log outgoing truck loads with mix data</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      )}

      {sectionVisible("plant_equipment") && (
      <Link href={opLink("/plant/equipment-usage") + (plantName ? `&plant=${encodeURIComponent(plantName)}` : "")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Gauge className="w-7 h-7 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Equipment Usage</h3>
              <p className="text-sm text-muted-foreground">Track meter readings and diesel consumption</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      )}

      {sectionVisible("plant_equipment") && (
      <Link href={opLink("/plant/maintenance")}>
        <Card className="hover-elevate cursor-pointer h-full" data-testid="card-maintenance">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <Wrench className="w-7 h-7 text-red-600 dark:text-red-400" />
              {openBreakdownCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-sm font-bold flex items-center justify-center" data-testid="badge-open-breakdowns">{openBreakdownCount}</span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Maintenance & Breakdowns</h3>
              <p className="text-sm text-muted-foreground">
                {openBreakdownCount > 0
                  ? <span className="text-destructive font-medium">{openBreakdownCount} open breakdown{openBreakdownCount !== 1 ? "s" : ""}</span>
                  : "Log breakdowns, services, PM events and parts used"}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      )}

      {sectionVisible("site_procurement") && (
      <Link href={opLink("/plant/purchase-indents")}>
        <Card className="hover-elevate cursor-pointer h-full" data-testid="card-purchase-indents">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <ClipboardList className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Purchase Indents</h3>
              <p className="text-sm text-muted-foreground">Raise and track material purchase requests</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      )}

      {!isRmc && sectionVisible("plant_shift_logs") && (
      <Link href={opLink("/plant/shift-log")}>
        <Card className="hover-elevate cursor-pointer h-full border-blue-200 dark:border-blue-800" data-testid="tile-today-shift-log">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Pencil className="w-7 h-7 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Plant Log</h3>
              <p className="text-sm text-muted-foreground">View plant shift logs or start a new entry</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      )}

      {!isRmc && sectionVisible("plant_heating") && (
      <Link href={opLink(`/plant/heating-sessions/${new Date().toISOString().slice(0, 10)}`)}>
        <Card className="hover-elevate cursor-pointer h-full border-orange-200 dark:border-orange-800" data-testid="tile-heating-sessions">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Flame className="w-7 h-7 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Bitumen Heating Sessions</h3>
              <p className="text-sm text-muted-foreground">Per-session boiler runs – night pre-heat + day-time, with optional inline DG</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      )}

      {sectionVisible("site_diesel") && (
      <Link href={opLink("/plant/diesel-requirements")}>
        <Card className="hover-elevate cursor-pointer h-full" data-testid="card-diesel-requirements">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Fuel className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Daily Diesel Requirements</h3>
              <p className="text-sm text-muted-foreground">Plan and track daily diesel needs per equipment</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {isRmc && sectionVisible("plant_production") && (
      <div className="col-span-1 md:col-span-3" data-testid="card-rmc-shift-summary">
        <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5 text-teal-700 dark:text-teal-400" />
              </div>
              <div>
                <h3 className="font-semibold text-base leading-tight">Today's RMC Production</h3>
                <p className="text-sm text-muted-foreground">{todayStr}</p>
              </div>
              {rmcSummaryLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
              {!rmcSummaryLoading && rmcSummary && (
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400" data-testid="text-rmc-total-volume">{rmcSummary.totalVolumeM3.toFixed(2)} m³</p>
                  <p className="text-sm text-muted-foreground">{rmcSummary.totalBatches} batch{rmcSummary.totalBatches !== 1 ? "es" : ""}</p>
                </div>
              )}
              {!rmcSummaryLoading && !rmcSummary && (
                <p className="ml-auto text-sm text-muted-foreground">No data</p>
              )}
            </div>
            {rmcSummary && rmcSummary.byGrade.length > 0 ? (
              <div className="mt-3 border-t border-teal-100 dark:border-teal-800 pt-3">
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm font-medium text-muted-foreground mb-1 px-1">
                  <span>Grade</span>
                  <span className="text-right">Batches</span>
                  <span className="text-right">Volume (m³)</span>
                </div>
                {rmcSummary.byGrade.map(g => (
                  <div key={g.grade} className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm px-1 py-0.5 rounded hover:bg-teal-50 dark:hover:bg-teal-900/20" data-testid={`row-rmc-grade-${g.grade}`}>
                    <span className="font-medium text-teal-800 dark:text-teal-300">{g.grade}</span>
                    <span className="text-right text-muted-foreground">{g.batchesCount}</span>
                    <span className="text-right font-semibold">{g.volumeM3.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : !rmcSummaryLoading && (
              <p className="text-sm text-muted-foreground mt-2 text-center py-2">No batches recorded today</p>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {isRmc && sectionVisible("plant_production") && (
      <Link href={opLink("/plant/rmc/batch-records")}>
        <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid="tile-rmc-batch-records">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <Truck className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">RMC Batch Records</h3>
              <p className="text-sm text-muted-foreground">Log concrete batches & generate delivery challans</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}
      {isRmc && sectionVisible("plant_production") && (
      <Link href={opLink("/plant/rmc/delivery-challans")}>
        <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid="tile-rmc-delivery-challans">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <FileText className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Delivery Challans</h3>
              <p className="text-sm text-muted-foreground">View and print DCs generated from batch records</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {isRmc && sectionVisible("plant_materials") && (
      <Link href={opLink("/plant/rmc/raw-materials")}>
        <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid="tile-rmc-raw-materials">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <Package className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">RMC Raw Material Receipts</h3>
              <p className="text-sm text-muted-foreground">Track incoming cement, aggregates & admixtures</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {isRmc && sectionVisible("plant_production") && (
      <Link href={opLink("/plant/rmc/cube-tests")}>
        <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid="tile-rmc-cube-tests">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
              <TestTube className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              {cubeTestFailCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-sm font-bold flex items-center justify-center" data-testid="badge-cube-failures">{cubeTestFailCount}</span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Cube Tests QC</h3>
              <p className="text-sm text-muted-foreground">
                {cubeTestFailCount > 0
                  ? <span className="text-destructive font-medium">{cubeTestFailCount} failed test{cubeTestFailCount !== 1 ? "s" : ""} in last 30 days</span>
                  : "Record compressive strength test results"}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {isRmc && sectionVisible("plant_production") && (
      <Link href={opLink("/plant/rmc/mix-designs")}>
        <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid="tile-rmc-mix-designs">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <FlaskConical className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Mix Designs</h3>
              <p className="text-sm text-muted-foreground">Manage approved concrete mix design grades</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

    </div>
  );
}

function ReportsTab({ plantType = "hma", rmcEnabled = false }: { plantType?: string; rmcEnabled?: boolean }) {
  const { sectionVisible, isAdmin, isManager } = useAuth();
  const isRmc = rmcEnabled;
  const todayStr = new Date().toISOString().slice(0, 10);
  const appendRoleAndTab = (path: string) => {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}tab=reports`;
  };
  return (
    <div className="space-y-4">
      <div className="bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md text-sm">
        Reports — {isRmc ? "RMC daily production, material receipts, cube test summaries." : "All daily plant reports, historical reports, and heating trends. Use date / plant filters and bulk PDF / ZIP export."}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {!isRmc && sectionVisible("plant_daily_reports") && (
        <Link href={appendRoleAndTab(`/plant/daily-report/${todayStr}`)}>
          <Card className="hover-elevate cursor-pointer h-full border-green-200 dark:border-green-800" data-testid="tile-today-daily-report-reports">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <FileText className="w-7 h-7 text-green-700 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Today's Daily Plant Report</h3>
                <p className="text-sm text-muted-foreground">Consolidated daily report — production, dispatches, fuel, manpower, idle</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        )}
        {!isRmc && sectionVisible("plant_daily_reports") && (
        <Link href={appendRoleAndTab("/plant/daily-reports")}>
          <Card className="hover-elevate cursor-pointer h-full border-slate-200 dark:border-slate-800" data-testid="tile-historical-daily-reports-reports">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center">
                <FileText className="w-7 h-7 text-slate-700 dark:text-slate-300" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Historical Daily Reports</h3>
                <p className="text-sm text-muted-foreground">Browse all dates with date / plant filters; bulk PDF / ZIP export</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        )}
        {!isRmc && sectionVisible("plant_heating") && (
        <Link href={appendRoleAndTab("/plant/heating-trends")}>
          <Card className="hover-elevate cursor-pointer h-full border-orange-200 dark:border-orange-800" data-testid="tile-heating-trends-reports">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Flame className="w-7 h-7 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Boiler / Heating Trends</h3>
                <p className="text-sm text-muted-foreground">Daily L/MT, L/Hr trends with date-range filter and Excel export</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        )}
        {isRmc && sectionVisible("plant_daily_reports") && (
        <Link href={appendRoleAndTab("/plant/rmc/daily-report")}>
          <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid="tile-rmc-daily-report-reports">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <BarChart3 className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">RMC Daily Report</h3>
                <p className="text-sm text-muted-foreground">Day-wise RMC production, materials & cube test summary</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        )}
        {(isAdmin || isManager) && (
        <Link href="/plant/dispatch-summary">
          <Card className="hover-elevate cursor-pointer h-full border-indigo-200 dark:border-indigo-800" data-testid="tile-plant-project-dispatch-summary">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <BarChart3 className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Plant-Project Dispatch Summary</h3>
                <p className="text-sm text-muted-foreground">Cross-plant dispatch analysis — loads & MT by plant and party</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        )}
      </div>
    </div>
  );
}

function StockDetailsTab({ plantType = "hma", rmcEnabled = false }: { plantType?: string; rmcEnabled?: boolean }) {
  const isRmc = rmcEnabled;
  const { appendOrigin } = useOrigin();
  const { sectionVisible, isAdmin } = useAuth();
  const { toast } = useToast();

  const [dieselCorrPhysicalL, setDieselCorrPhysicalL] = useState("");
  const [dieselCorrPartyId, setDieselCorrPartyId] = useState<string>("");
  const [dieselCorrDate, setDieselCorrDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dieselCorrNotes, setDieselCorrNotes] = useState("");
  const [showDieselCorrForm, setShowDieselCorrForm] = useState(false);
  const [dispatchNotesBackfillResult, setDispatchNotesBackfillResult] = useState<{ updated: number; skipped: number; errors: number } | null>(null);

  const appendRoleAndTab = (path: string) => {
    const base = appendOrigin(path);
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}tab=stock`;
  };

  const { data: ldoFlowReadings } = useQuery<LdoFlowReading[]>({
    queryKey: ["/api/plant-module/ldo-flow-readings"],
  });

  const { data: materials } = useQuery<{ id: number; name: string; defaultUom: string }[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: stockBalances } = useQuery<{ id: number; partyId: number | null; materialId: number; balance: number; uom: string }[]>({
    queryKey: ["/api/plant-module/stock-balances"],
  });

  const { data: allParties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const dieselBalToL = (balance: number, uom: string) => {
    const u = (uom || "").toUpperCase();
    if (u === "MT" || u === "TON" || u === "TONS") return balance * 1000 / 0.84;
    if (u === "KG") return balance / 0.84;
    return balance;
  };

  const dieselMaterialId = materials?.find(m => m.name.toUpperCase() === "DIESEL")?.id ?? null;

  const dieselPartyBalances = (stockBalances && dieselMaterialId)
    ? stockBalances.filter(b => b.materialId === dieselMaterialId)
    : [];

  const dieselBookStockL = dieselPartyBalances.reduce((s, b) => s + dieselBalToL(b.balance, b.uom), 0);

  const dieselSelectedPartyBalanceL = (() => {
    if (!dieselCorrPartyId) return null;
    const b = dieselPartyBalances.find(b => String(b.partyId) === dieselCorrPartyId);
    return b ? dieselBalToL(b.balance, b.uom) : 0;
  })();

  const dispatchNotesBackfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/backfill-dispatch-notes", {});
      return res.json();
    },
    onSuccess: (result: { updated: number; skipped: number; errors: number }) => {
      setDispatchNotesBackfillResult(result);
      toast({
        title: "Dispatch notes backfill complete",
        description: `Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    },
  });

  const dieselCorrectionMutation = useMutation({
    mutationFn: async (data: { materialId: number; partyId: number; physicalQty: number; uom: string; date: string; notes: string; correctedBy: string }) => {
      const res = await apiRequest("POST", "/api/plant-module/stock-correction", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      const adjL = result.adjustment || 0;
      const sign = adjL >= 0 ? "+" : "";
      const newL = result.newBalance || 0;
      toast({ title: "Diesel stock correction posted", description: `Adjustment: ${sign}${adjL.toFixed(0)} L. Book stock now ${newL.toFixed(0)} L.` });
      setShowDieselCorrForm(false);
      setDieselCorrPhysicalL("");
      setDieselCorrNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const ldoTankSummary = (() => {
    if (!ldoFlowReadings) return null;
    const LDO_DENSITY = 0.84;
    const t1 = computeTankStock(ldoFlowReadings, 1)?.stockL ?? null;
    const t2 = computeTankStock(ldoFlowReadings, 2)?.stockL ?? null;
    const totalL = (t1 || 0) + (t2 || 0);
    return { tank1L: t1, tank2L: t2, totalL, totalMT: (totalL * LDO_DENSITY / 1000) };
  })();

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {sectionVisible("plant_stock") && (
      <Link href={appendRoleAndTab("/plant/stock")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Layers className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Stock Balances & Ledger</h3>
              <p className="text-sm text-muted-foreground">View party-wise stock and transaction history</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {!isRmc && sectionVisible("plant_variance") && (
      <Link href={appendRoleAndTab("/plant/variance-report")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Variance Report</h3>
              <p className="text-sm text-muted-foreground">View dispatches where actual differs from theoretical</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {!isRmc && sectionVisible("plant_audit") && (
      <Link href={appendRoleAndTab("/plant/audit-report")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Shield className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Audit Report</h3>
              <p className="text-sm text-muted-foreground">Complete history of consumption adjustments</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {sectionVisible("plant_diesel_proc") && (
      <Link href={appendRoleAndTab("/plant/diesel-procurement")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Fuel className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Diesel Procurement</h3>
              <p className="text-sm text-muted-foreground">Track all diesel: plant receipts + direct site purchases</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {!isRmc && sectionVisible("plant_bitumen") && (
      <Link href={appendRoleAndTab("/plant/bitumen-stock")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Droplets className="w-7 h-7 text-amber-700 dark:text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Bitumen Stock Tracker</h3>
              <p className="text-sm text-muted-foreground">Track bitumen tank dip readings & actual stock (2 tanks)</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}

      {!isRmc && sectionVisible("plant_ldo") && (
      <Link href={appendRoleAndTab("/plant/ldo-flow-meter")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Gauge className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">LDO Flow Meter Tracker</h3>
              <p className="text-sm text-muted-foreground">Track LDO consumption, tank stock & variance analysis</p>
              {ldoTankSummary && (
                <div className="mt-2 flex items-center gap-3 text-sm" data-testid="text-ldo-stock-summary">
                  <span className="font-bold text-blue-700 dark:text-blue-300">{ldoTankSummary.totalL.toFixed(0)} L</span>
                  <span className="text-muted-foreground">({ldoTankSummary.totalMT.toFixed(3)} MT)</span>
                  <span className="text-sm text-muted-foreground">
                    T1: {ldoTankSummary.tank1L !== null ? `${ldoTankSummary.tank1L.toFixed(0)} L` : "—"} |
                    T2: {ldoTankSummary.tank2L !== null ? `${ldoTankSummary.tank2L.toFixed(0)} L` : "—"}
                  </span>
                </div>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      )}
      </div>

      {/* ── Diesel Physical Stock Correction Card (admin only) ── */}
      {isAdmin && dieselMaterialId && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base font-semibold">Diesel Book Stock Correction</CardTitle>
              </div>
              {!showDieselCorrForm && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (!dieselCorrPartyId && dieselPartyBalances.length > 0) setDieselCorrPartyId(String(dieselPartyBalances[0].partyId));
                  setShowDieselCorrForm(true);
                }} data-testid="button-show-diesel-correction-form">
                  Post Correction
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground text-sm mb-1">Total Book Stock (All Parties)</div>
                <div className={`font-bold text-lg ${dieselBookStockL < 0 ? "text-red-600" : "text-foreground"}`}>
                  {dieselBookStockL.toFixed(0)} L
                </div>
                <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                  {dieselPartyBalances.map(b => (
                    <div key={b.id} className="flex justify-between gap-2">
                      <span>{allParties?.find(p => p.id === b.partyId)?.name ?? `Party ${b.partyId}`}:</span>
                      <span className={dieselBalToL(b.balance, b.uom) < 0 ? "text-red-500" : ""}>{dieselBalToL(b.balance, b.uom).toFixed(0)} L</span>
                    </div>
                  ))}
                  {dieselPartyBalances.length === 0 && <span className="italic">No balances yet</span>}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground text-sm mb-1">How to use</div>
                <div className="text-sm text-muted-foreground">
                  Select a party, enter their physical diesel quantity from a dip-stick reading, and post the correction to align the book stock.
                </div>
              </div>
            </div>

            {showDieselCorrForm && (
              <div className="border rounded-lg p-4 space-y-4 bg-blue-50/50 dark:bg-blue-950/20">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Post Physical Diesel Stock Correction</p>

                {/* Party + date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Party to Correct</Label>
                    <Select value={dieselCorrPartyId} onValueChange={id => setDieselCorrPartyId(id)}>
                      <SelectTrigger data-testid="select-diesel-corr-party">
                        <SelectValue placeholder="Select party" />
                      </SelectTrigger>
                      <SelectContent>
                        {allParties?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                            {dieselPartyBalances.find(b => b.partyId === p.id) !== undefined &&
                              ` (${dieselBalToL(dieselPartyBalances.find(b => b.partyId === p.id)?.balance ?? 0, dieselPartyBalances.find(b => b.partyId === p.id)?.uom ?? "L").toFixed(0)} L)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dieselCorrPartyId && dieselSelectedPartyBalanceL !== null && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Current book stock: <span className={dieselSelectedPartyBalanceL < 0 ? "text-red-500 font-medium" : "font-medium"}>{dieselSelectedPartyBalanceL.toFixed(0)} L</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm">As on Date</Label>
                    <Input type="date" value={dieselCorrDate} onChange={e => setDieselCorrDate(e.target.value)} data-testid="input-diesel-corr-date" />
                  </div>
                </div>

                {/* Physical qty + preview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <Label className="text-sm">Physical Stock (Liters)</Label>
                    <Input
                      type="number" step="1" min="0"
                      value={dieselCorrPhysicalL}
                      onChange={e => setDieselCorrPhysicalL(e.target.value)}
                      placeholder="e.g. 850"
                      data-testid="input-diesel-corr-physical-l"
                    />
                    <p className="text-sm text-muted-foreground mt-1">From dip-stick reading</p>
                  </div>
                  {dieselCorrPartyId && dieselSelectedPartyBalanceL !== null && dieselCorrPhysicalL && (
                    <div className={`rounded-lg p-2 text-center ${
                      parseFloat(dieselCorrPhysicalL) - dieselSelectedPartyBalanceL > 0
                        ? "bg-green-50 dark:bg-green-900/20"
                        : "bg-red-50 dark:bg-red-900/20"
                    }`}>
                      <div className="text-sm text-muted-foreground">Adjustment</div>
                      <div className={`font-bold text-base ${
                        parseFloat(dieselCorrPhysicalL) - dieselSelectedPartyBalanceL > 0
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      }`}>
                        {(() => {
                          const adj = parseFloat(dieselCorrPhysicalL) - dieselSelectedPartyBalanceL;
                          return `${adj > 0 ? "+" : ""}${adj.toFixed(0)} L`;
                        })()}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm">Notes (optional)</Label>
                    <Input value={dieselCorrNotes} onChange={e => setDieselCorrNotes(e.target.value)} placeholder="e.g. Dip stick reading" data-testid="input-diesel-corr-notes" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!dieselCorrPartyId || !dieselCorrPhysicalL || dieselCorrectionMutation.isPending}
                    onClick={() => {
                      if (!dieselMaterialId || !dieselCorrPartyId) return;
                      const physL = parseFloat(dieselCorrPhysicalL);
                      const partyName = allParties?.find(p => String(p.id) === dieselCorrPartyId)?.name || `Party ${dieselCorrPartyId}`;
                      dieselCorrectionMutation.mutate({
                        materialId: dieselMaterialId,
                        partyId: parseInt(dieselCorrPartyId),
                        physicalQty: physL,
                        uom: "Liters",
                        date: dieselCorrDate,
                        notes: dieselCorrNotes || `Diesel dip stick reconciliation (${partyName})`,
                        correctedBy: "admin",
                      });
                    }}
                    data-testid="button-post-diesel-correction"
                  >
                    {dieselCorrectionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Correction"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowDieselCorrForm(false); setDieselCorrPhysicalL(""); setDieselCorrNotes(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(sectionVisible("vendor_bills") || sectionVisible("vendor_bills_view") || sectionVisible("vendor_bills_raise") || sectionVisible("vendor_bills_verify") || sectionVisible("vendor_bills_approve")) && (<>
      <div className="mt-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Procurement & Finance</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href={appendRoleAndTab("/plant/vendor-bills")}>
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-vendor-bills">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Receipt className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Vendor Bills</h3>
                <p className="text-sm text-muted-foreground">Track and process vendor invoices with workflow</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
      </>)}

      {isAdmin && (
        <>
          <div className="mt-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Admin Tools</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href={appendRoleAndTab("/plant/data-sync")}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid="card-data-sync">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-900/30 flex items-center justify-center">
                    <ArrowRightLeft className="w-7 h-7 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">Data Export / Import</h3>
                    <p className="text-sm text-muted-foreground">Transfer data between development and production</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>

            <Link href={appendRoleAndTab("/plant/ldo-backfill")}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid="card-ldo-backfill">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Gauge className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">LDO Meter Backfill</h3>
                    <p className="text-sm text-muted-foreground">Enter historical Tank-1 / Tank-2 opening &amp; closing meters for past dates</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>

            <Link href={appendRoleAndTab("/plant/ldo-dip-backfill")}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid="card-ldo-dip-backfill">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                    <Droplets className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">LDO Dip-Stick Backfill</h3>
                    <p className="text-sm text-muted-foreground">Enter historical Tank-1 / Tank-2 dip-stick depths so book vs physical reconciliation is complete</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>

            <Card className="h-full" data-testid="card-dispatch-notes-backfill">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-7 h-7 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg">Backfill Dispatch Notes</h3>
                  <p className="text-sm text-muted-foreground">Update old ledger notes to "Mix — Site" format</p>
                  {dispatchNotesBackfillResult && (
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1" data-testid="text-dispatch-notes-backfill-result">
                      Updated: {dispatchNotesBackfillResult.updated} · Skipped: {dispatchNotesBackfillResult.skipped} · Errors: {dispatchNotesBackfillResult.errors}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={dispatchNotesBackfillMutation.isPending}
                  onClick={() => dispatchNotesBackfillMutation.mutate()}
                  data-testid="button-run-dispatch-notes-backfill"
                >
                  {dispatchNotesBackfillMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const PLANT_TYPE_LABELS: Record<string, string> = {
  hma: "Hot Mix Asphalt (HMA)",
  rmc: "Ready Mix Concrete (RMC)",
  mixed: "Mixed (HMA + RMC)",
};

// ── Per-slot tank configuration editor ─────────────────────────────────────
function TankSlotEditor({
  slotKey,
  label,
  config,
  onChange,
}: {
  slotKey: TankSlot;
  label: string;
  config: SingleTankConfig | undefined;
  onChange: (cfg: SingleTankConfig | undefined) => void;
}) {
  const enabled = !!config;
  const shape = config?.shape ?? "horizontal_cylinder";

  const defaultForShape = (s: string): SingleTankConfig => {
    if (s === "vertical_cylinder") return { shape: "vertical_cylinder", diameterCm: 200, heightCm: 150 };
    if (s === "vertical_cone_top") return { shape: "vertical_cone_top", diameterCm: 200, cylinderHeightCm: 150, coneHeightCm: 30 };
    return { shape: "horizontal_cylinder", diameterCm: 250, lengthCm: 1060 };
  };

  const update = (patch: Partial<any>) => onChange({ ...config!, ...patch } as SingleTankConfig);
  const numField = (val: number | undefined, key: string) =>
    <Input type="number" min={0} value={val ?? ""} placeholder="cm"
      onChange={(e) => update({ [key]: parseFloat(e.target.value) || 0 })}
      className="h-8 text-sm" data-testid={`input-tank-${slotKey}-${key}`} />;

  const preview = enabled && config && config.diameterCm > 0 ? generateChartPreview(config) : null;
  const capacity = enabled && config && config.diameterCm > 0 ? getTankCapacity(config) : 0;

  return (
    <div className={`border rounded-lg p-3 space-y-3 ${enabled ? "border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-900/10" : "bg-muted/20"}`}>
      <div className="flex items-center gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => onChange(checked ? defaultForShape("horizontal_cylinder") : undefined)}
          data-testid={`switch-tank-${slotKey}`}
        />
        <span className="font-medium text-sm">{label}</span>
        {enabled && capacity > 0 && (
          <span className="ml-auto text-sm text-muted-foreground">{Math.round(capacity).toLocaleString()} L capacity</span>
        )}
      </div>

      {enabled && config && (
        <>
          <div>
            <Label className="text-sm">Tank Shape</Label>
            <Select value={shape} onValueChange={(v) => onChange(defaultForShape(v))}>
              <SelectTrigger className="mt-1 h-8 text-sm" data-testid={`select-tank-${slotKey}-shape`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TANK_SHAPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-sm">Diameter (cm)</Label>
              {numField(config.diameterCm, "diameterCm")}
            </div>
            {config.shape === "horizontal_cylinder" && (
              <div>
                <Label className="text-sm">Length (cm)</Label>
                {numField(config.lengthCm, "lengthCm")}
              </div>
            )}
            {config.shape === "vertical_cylinder" && (
              <div>
                <Label className="text-sm">Height (cm)</Label>
                {numField(config.heightCm, "heightCm")}
              </div>
            )}
            {config.shape === "vertical_cone_top" && (
              <>
                <div>
                  <Label className="text-sm">Cylinder Height (cm)</Label>
                  {numField(config.cylinderHeightCm, "cylinderHeightCm")}
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm">Cone Height (cm)</Label>
                    {numField(config.coneHeightCm, "coneHeightCm")}
                  </div>
                  <div />
                </div>
              </>
            )}
            <div>
              <Label className="text-sm">Dead Stock Depth (cm)</Label>
              <Input type="number" min={0} value={config.deadStockDepthCm ?? ""}
                placeholder="e.g. 12"
                onChange={(e) => update({ deadStockDepthCm: parseFloat(e.target.value) || undefined })}
                className="h-8 text-sm" data-testid={`input-tank-${slotKey}-deadStock`} />
            </div>
          </div>

          {preview && (
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Chart Preview</p>
              <div className="grid grid-cols-3 text-sm gap-x-4 gap-y-0.5">
                <span className="text-muted-foreground font-medium">% Full</span>
                <span className="text-muted-foreground font-medium">Dip (cm)</span>
                <span className="text-muted-foreground font-medium">Volume (L)</span>
                {preview.map((row) => (
                  <span key={row.pct} className="contents">
                    <span>{row.pct}%</span>
                    <span>{row.depthCm}</span>
                    <span>{row.volumeL.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PlantTypeConfigSection() {
  const { toast } = useToast();
  const { data: allSettings = [], isLoading: settingsLoading } = useQuery<PlantSettingsWithSite[]>({
    queryKey: ['/api/plant-module/plant-settings'],
  });

  // ── Edit-type dialog state ──────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<PlantSettings | null>(null);
  const [editType, setEditType] = useState<string>("hma");

  // ── Rename dialog state ─────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<PlantSettings | null>(null);
  const [renameTo, setRenameTo] = useState("");

  // ── Delete confirmation state ───────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<PlantSettings | null>(null);

  // ── Add-plant dialog state ──────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<string>("hma");
  const [addSiteId, setAddSiteId] = useState<string>("");
  const [addPartyId, setAddPartyId] = useState<string>("");

  // ── Assign-site dialog state ─────────────────────────────────────────────────
  const [assignSiteTarget, setAssignSiteTarget] = useState<PlantSettingsWithSite | null>(null);
  const [assignSiteId, setAssignSiteId] = useState<string>("");

  // ── Primary party dialog state ───────────────────────────────────────────────
  const [primaryPartyTarget, setPrimaryPartyTarget] = useState<PlantSettingsWithSite | null>(null);
  const [primaryPartyIdEdit, setPrimaryPartyIdEdit] = useState<string>("");

  // ── Tank Calibration dialog state ────────────────────────────────────────────
  const [calibrateTarget, setCalibrateTarget] = useState<PlantSettings | null>(null);
  const [calibrateConfig, setCalibrateConfig] = useState<PlantTankConfig>({});

  const { data: sitesList = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const { data: partiesList = [] } = useQuery<Party[]>({ queryKey: ["/api/parties"] });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/api/plant-module/plant-settings'] });

  // Save edited type
  const editTypeMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("No plant selected");
      const res = await apiRequest("PUT", `/api/plant-module/plant-settings/${encodeURIComponent(editTarget.plantName)}`, {
        plantType: editType,
        siteId: editTarget.siteId ?? null,
        primaryPartyId: (editTarget as any).primaryPartyId ?? null,
        bitumenTank1LitresPerCm: editTarget.bitumenTank1LitresPerCm ?? null,
        bitumenTank2LitresPerCm: editTarget.bitumenTank2LitresPerCm ?? null,
        bitumenDensityKgPerL: editTarget.bitumenDensityKgPerL ?? null,
        tankConfig: (editTarget as any).tankConfig ?? null,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setEditTarget(null);
      toast({ title: "Plant type updated", description: `"${editTarget?.plantName}" is now ${PLANT_TYPE_LABELS[editType] ?? editType}.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Rename: single atomic server-side endpoint (validates duplicate, uses DB transaction)
  const renameMutation = useMutation({
    mutationFn: async () => {
      if (!renameTarget) throw new Error("No plant selected");
      const newName = renameTo.trim();
      if (!newName) throw new Error("Plant name is required");
      const res = await apiRequest("POST", `/api/plant-module/plant-settings/${encodeURIComponent(renameTarget.plantName)}/rename`, { newName });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Plant renamed", description: `Renamed to "${renameTo.trim()}". Existing records referencing the old name are not updated automatically.` });
      setRenameTarget(null);
      setRenameTo("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete plant
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) throw new Error("No plant selected");
      const res = await apiRequest("DELETE", `/api/plant-module/plant-settings/${encodeURIComponent(deleteTarget.plantName)}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Plant removed", description: `"${deleteTarget?.plantName}" has been deleted.` });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Add new plant
  const addMutation = useMutation({
    mutationFn: async () => {
      const name = addName.trim();
      if (!name) throw new Error("Plant name is required");
      if (allSettings.some(s => s.plantName.toLowerCase() === name.toLowerCase())) {
        throw new Error("A plant with this name already exists");
      }
      const res = await apiRequest("PUT", `/api/plant-module/plant-settings/${encodeURIComponent(name)}`, {
        plantType: addType,
        siteId: addSiteId ? parseInt(addSiteId) : null,
        primaryPartyId: addPartyId ? parseInt(addPartyId) : null,
        bitumenTank1LitresPerCm: null,
        bitumenTank2LitresPerCm: null,
        bitumenDensityKgPerL: null,
        tankConfig: null,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Plant added", description: `"${addName.trim()}" created as ${PLANT_TYPE_LABELS[addType] ?? addType}.` });
      setAddOpen(false);
      setAddName("");
      setAddType("hma");
      setAddSiteId("");
      setAddPartyId("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Assign / update site for an existing plant
  const assignSiteMutation = useMutation({
    mutationFn: async () => {
      if (!assignSiteTarget) throw new Error("No plant selected");
      const res = await apiRequest("PUT", `/api/plant-module/plant-settings/${encodeURIComponent(assignSiteTarget.plantName)}`, {
        plantType: assignSiteTarget.plantType ?? "hma",
        siteId: assignSiteId ? parseInt(assignSiteId) : null,
        primaryPartyId: (assignSiteTarget as any).primaryPartyId ?? null,
        bitumenTank1LitresPerCm: assignSiteTarget.bitumenTank1LitresPerCm ?? null,
        bitumenTank2LitresPerCm: assignSiteTarget.bitumenTank2LitresPerCm ?? null,
        bitumenDensityKgPerL: assignSiteTarget.bitumenDensityKgPerL ?? null,
        tankConfig: (assignSiteTarget as any).tankConfig ?? null,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      const siteName = assignSiteId ? (sitesList.find(s => String(s.id) === assignSiteId)?.name ?? "selected site") : "none";
      toast({ title: "Site assigned", description: assignSiteId ? `"${assignSiteTarget?.plantName}" linked to ${siteName}.` : `"${assignSiteTarget?.plantName}" is now unlinked from any site.` });
      setAssignSiteTarget(null);
      setAssignSiteId("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Set / update primary party for an existing plant
  const primaryPartyMutation = useMutation({
    mutationFn: async () => {
      if (!primaryPartyTarget) throw new Error("No plant selected");
      const res = await apiRequest("PUT", `/api/plant-module/plant-settings/${encodeURIComponent(primaryPartyTarget.plantName)}`, {
        plantType: primaryPartyTarget.plantType ?? "hma",
        siteId: primaryPartyTarget.siteId ?? null,
        primaryPartyId: primaryPartyIdEdit ? parseInt(primaryPartyIdEdit) : null,
        bitumenTank1LitresPerCm: primaryPartyTarget.bitumenTank1LitresPerCm ?? null,
        bitumenTank2LitresPerCm: primaryPartyTarget.bitumenTank2LitresPerCm ?? null,
        bitumenDensityKgPerL: primaryPartyTarget.bitumenDensityKgPerL ?? null,
        tankConfig: (primaryPartyTarget as any).tankConfig ?? null,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      const partyName = primaryPartyIdEdit ? (partiesList.find(p => String(p.id) === primaryPartyIdEdit)?.name ?? "selected party") : "none";
      toast({ title: "Primary party updated", description: primaryPartyIdEdit ? `"${primaryPartyTarget?.plantName}" default party set to ${partyName}.` : `"${primaryPartyTarget?.plantName}" primary party cleared.` });
      setPrimaryPartyTarget(null);
      setPrimaryPartyIdEdit("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Save tank calibration config
  const calibrateMutation = useMutation({
    mutationFn: async () => {
      if (!calibrateTarget) throw new Error("No plant selected");
      const res = await apiRequest("PUT", `/api/plant-module/plant-settings/${encodeURIComponent(calibrateTarget.plantName)}`, {
        plantType: calibrateTarget.plantType ?? "hma",
        siteId: calibrateTarget.siteId ?? null,
        primaryPartyId: (calibrateTarget as any).primaryPartyId ?? null,
        bitumenTank1LitresPerCm: calibrateTarget.bitumenTank1LitresPerCm ?? null,
        bitumenTank2LitresPerCm: calibrateTarget.bitumenTank2LitresPerCm ?? null,
        bitumenDensityKgPerL: calibrateTarget.bitumenDensityKgPerL ?? null,
        tankConfig: Object.keys(calibrateConfig).length > 0 ? JSON.stringify(calibrateConfig) : null,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Tank calibration saved", description: `Tank dimensions for "${calibrateTarget?.plantName}" have been saved.` });
      setCalibrateTarget(null);
      setCalibrateConfig({});
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (settingsLoading) return null;

  const isEmpty = allSettings.length === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <CardTitle>Plant Configuration</CardTitle>
              <CardDescription>
                {isEmpty
                  ? "No plants configured yet. Add your first plant to get started."
                  : "Manage plant entries — rename, change type, add or remove plants."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isEmpty && (
            <p className="text-sm text-muted-foreground py-2">
              Use the button below to add your first plant.
            </p>
          )}

          {allSettings.map((s) => {
            return (
              <div
                key={s.plantName}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                data-testid={`plant-row-${s.plantName}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate" data-testid={`text-plant-name-${s.plantName}`}>{s.plantName}</p>
                    {s.siteName ? (
                      <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" data-testid={`badge-site-${s.plantName}`}>
                        {s.siteName}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground" data-testid={`badge-no-site-${s.plantName}`}>Shared / Mobile</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{PLANT_TYPE_LABELS[s.plantType ?? "hma"] ?? s.plantType}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setAssignSiteTarget(s); setAssignSiteId(s.siteId ? String(s.siteId) : ""); }}
                  data-testid={`btn-assign-site-${s.plantName}`}
                >
                  <MapPin className="w-3 h-3 mr-1" />
                  Site
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPrimaryPartyTarget(s);
                    setPrimaryPartyIdEdit((s as any).primaryPartyId ? String((s as any).primaryPartyId) : "");
                  }}
                  data-testid={`btn-primary-party-${s.plantName}`}
                >
                  <Users className="w-3 h-3 mr-1" />
                  Party
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const existing = parseTankConfig((s as any).tankConfig ?? null);
                    setCalibrateTarget(s);
                    setCalibrateConfig(existing ?? {});
                  }}
                  data-testid={`btn-calibrate-tanks-${s.plantName}`}
                >
                  <Cylinder className="w-3 h-3 mr-1" />
                  Tanks
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditTarget(s); setEditType(s.plantType ?? "hma"); }}
                  data-testid={`btn-edit-type-${s.plantName}`}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Type
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRenameTarget(s); setRenameTo(s.plantName); }}
                  data-testid={`btn-rename-${s.plantName}`}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(s)}
                  data-testid={`btn-delete-plant-${s.plantName}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}

          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={() => setAddOpen(true)}
            data-testid="btn-add-plant"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Another Plant
          </Button>

          <p className="text-sm text-muted-foreground pt-1">
            HMA shows shift logs, heating, and dispatch tracking. RMC shows batch records, cube tests, and raw material receipts. Mixed shows both.
          </p>
        </CardContent>
      </Card>

      {/* ── Edit Type Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Plant Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Changing the type for <strong>{editTarget?.plantName}</strong> will affect which tabs and features are shown for this plant.
            </p>
            <div>
              <Label>Plant Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger className="mt-1" data-testid="select-edit-plant-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hma">Hot Mix Asphalt (HMA)</SelectItem>
                  <SelectItem value="rmc">Ready Mix Concrete (RMC)</SelectItem>
                  <SelectItem value="mixed">Mixed (HMA + RMC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditTarget(null)} data-testid="btn-cancel-edit-type">Cancel</Button>
              <Button
                onClick={() => editTypeMutation.mutate()}
                disabled={editTypeMutation.isPending || editType === (editTarget?.plantType ?? "hma")}
                data-testid="btn-save-edit-type"
              >
                {editTypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Rename Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => { if (!o) { setRenameTarget(null); setRenameTo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Plant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Renaming only updates this settings entry. Existing shift logs, daily reports, dispatch records, and any other data that references <strong>{renameTarget?.plantName}</strong> will <em>not</em> be updated automatically.
              </p>
            </div>
            <div>
              <Label htmlFor="input-rename-plant">New Name <span className="text-destructive">*</span></Label>
              <Input
                id="input-rename-plant"
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                placeholder="e.g., Site A HMA Plant"
                className="mt-1"
                data-testid="input-rename-plant"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRenameTarget(null); setRenameTo(""); }} data-testid="btn-cancel-rename">Cancel</Button>
              <Button
                onClick={() => renameMutation.mutate()}
                disabled={renameMutation.isPending || !renameTo.trim() || renameTo.trim() === renameTarget?.plantName}
                data-testid="btn-confirm-rename"
              >
                {renameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rename"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.plantName}</strong> from plant configuration. Existing records that reference this plant will not be affected, but you will no longer be able to manage its settings here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-delete-plant">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="btn-confirm-delete-plant"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add Plant Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setAddName(""); setAddType("hma"); setAddSiteId(""); setAddPartyId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Another Plant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="input-add-plant-name">Plant Name <span className="text-destructive">*</span></Label>
              <Input
                id="input-add-plant-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g., RMC Plant, Site B HMA"
                className="mt-1"
                data-testid="input-add-plant-name"
              />
              <p className="text-sm text-muted-foreground mt-1">
                This name appears across all plant records, reports, and shift logs for this plant.
              </p>
            </div>
            <div>
              <Label>Plant Type</Label>
              <Select value={addType} onValueChange={setAddType}>
                <SelectTrigger className="mt-1" data-testid="select-add-plant-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hma">Hot Mix Asphalt (HMA)</SelectItem>
                  <SelectItem value="rmc">Ready Mix Concrete (RMC)</SelectItem>
                  <SelectItem value="mixed">Mixed (HMA + RMC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Site / Project <span className="text-muted-foreground text-sm">(optional)</span></Label>
              <Select value={addSiteId || "__none__"} onValueChange={v => setAddSiteId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1" data-testid="select-add-plant-site">
                  <SelectValue placeholder="Not assigned to a site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Shared / Mobile plant —</SelectItem>
                  {sitesList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primary Party <span className="text-muted-foreground text-sm">(optional — default contractor for manpower)</span></Label>
              <Select value={addPartyId || "__none__"} onValueChange={v => setAddPartyId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1" data-testid="select-add-plant-party">
                  <SelectValue placeholder="No default party" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No default party —</SelectItem>
                  {partiesList.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAddOpen(false); setAddName(""); setAddType("hma"); setAddSiteId(""); setAddPartyId(""); }} data-testid="btn-cancel-add-plant">Cancel</Button>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !addName.trim()}
                data-testid="btn-confirm-add-plant"
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Plant"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Site Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!assignSiteTarget} onOpenChange={(o) => { if (!o) { setAssignSiteTarget(null); setAssignSiteId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Site / Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Link <strong>{assignSiteTarget?.plantName}</strong> to a site so its production, fuel, and shift data rolls up to that project.
            </p>
            <div>
              <Label>Site / Project</Label>
              <Select value={assignSiteId || "__none__"} onValueChange={v => setAssignSiteId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1" data-testid="select-assign-site">
                  <SelectValue placeholder="Shared / Mobile plant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Shared / Mobile plant (no site) —</SelectItem>
                  {sitesList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAssignSiteTarget(null); setAssignSiteId(""); }} data-testid="btn-cancel-assign-site">Cancel</Button>
              <Button
                onClick={() => assignSiteMutation.mutate()}
                disabled={assignSiteMutation.isPending}
                data-testid="btn-confirm-assign-site"
              >
                {assignSiteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Primary Party Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!primaryPartyTarget} onOpenChange={(o) => { if (!o) { setPrimaryPartyTarget(null); setPrimaryPartyIdEdit(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Primary Party</DialogTitle>
            <DialogDescription>
              The default contractor/party used for manpower entries on <strong>{primaryPartyTarget?.plantName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Primary Party</Label>
              <Select value={primaryPartyIdEdit || "__none__"} onValueChange={v => setPrimaryPartyIdEdit(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1" data-testid="select-primary-party">
                  <SelectValue placeholder="No default party" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No default party —</SelectItem>
                  {partiesList.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setPrimaryPartyTarget(null); setPrimaryPartyIdEdit(""); }} data-testid="btn-cancel-primary-party">Cancel</Button>
              <Button
                onClick={() => primaryPartyMutation.mutate()}
                disabled={primaryPartyMutation.isPending}
                data-testid="btn-confirm-primary-party"
              >
                {primaryPartyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Tank Calibration Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!calibrateTarget} onOpenChange={(o) => { if (!o) { setCalibrateTarget(null); setCalibrateConfig({}); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cylinder className="w-5 h-5 text-teal-600" />
              Tank Calibration — {calibrateTarget?.plantName}
            </DialogTitle>
            <DialogDescription>
              Configure tank dimensions to auto-generate accurate dip charts. Tanks not enabled here will fall back to the plant's default lookup tables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3">
              {(Object.entries(TANK_SLOT_LABELS) as [TankSlot, string][]).map(([slot, label]) => (
                <TankSlotEditor
                  key={slot}
                  slotKey={slot}
                  label={label}
                  config={calibrateConfig[slot]}
                  onChange={(cfg) => {
                    setCalibrateConfig(prev => {
                      const next = { ...prev };
                      if (cfg) next[slot] = cfg;
                      else delete next[slot];
                      return next;
                    });
                  }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Tip: For horizontal cylinders, enter the inner diameter and the internal barrel length. For vertical tanks, diameter and fill height. Dead stock depth excludes the unpumpable bottom layer from usable volume calculations.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCalibrateTarget(null); setCalibrateConfig({}); }} data-testid="btn-cancel-calibrate">Cancel</Button>
              <Button
                onClick={() => calibrateMutation.mutate()}
                disabled={calibrateMutation.isPending}
                data-testid="btn-save-calibrate"
              >
                {calibrateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Calibration"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MastersTab() {
  const { sectionVisible, isAdmin } = useAuth();
  return (
    <div className="space-y-6">
      {isAdmin && <div id="plant-config"><PlantTypeConfigSection /></div>}
      {sectionVisible("master_parties") && <div id="party-master"><PartyMaster /></div>}
      {sectionVisible("master_parties") && <div id="site-master"><SitesMasterSection /></div>}
      {sectionVisible("master_materials") && <div id="material-master"><MaterialMaster /></div>}
      {sectionVisible("master_materials") && <div id="mix-templates"><MixTemplateMaster /></div>}
      {sectionVisible("master_equipment") && <div id="equipment-master"><EquipmentMasterSection /></div>}
      {sectionVisible("master_personnel") && <div id="personnel-master"><PersonnelMasterSection /></div>}
    </div>
  );
}

export function SitesMasterSection() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canEdit = sectionCan("master_parties", "edit");
  const canCreate = sectionCan("master_parties", "create");
  const canDelete = isAdmin;

  const [newSiteName, setNewSiteName] = useState("");
  const [newSitePartyId, setNewSitePartyId] = useState<string>("all");
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null);
  const [editingSiteName, setEditingSiteName] = useState("");
  const [editingSitePartyId, setEditingSitePartyId] = useState<string>("all");

  const { data: sitesList = [], isLoading: sitesLoading } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const { data: partiesList = [] } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const getPartyName = (partyId: number | null) => {
    if (!partyId) return null;
    return partiesList.find(p => p.id === partyId)?.name || null;
  };

  const createSiteMutation = useMutation({
    mutationFn: async (data: { name: string; partyId: number | null }) => {
      const response = await apiRequest("POST", "/api/sites", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create site");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setNewSiteName("");
      setNewSitePartyId("all");
      toast({ title: "Site Added", description: "New site has been added." });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateSiteMutation = useMutation({
    mutationFn: async ({ id, name, partyId }: { id: number; name: string; partyId: number | null }) => {
      const response = await apiRequest("PATCH", `/api/sites/${id}`, { name, partyId });
      if (!response.ok) throw new Error("Failed to update site");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setEditingSiteId(null);
      setEditingSiteName("");
      setEditingSitePartyId("all");
      toast({ title: "Site Updated", description: "Site has been updated." });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/sites/${id}`);
      if (!response.ok) throw new Error("Failed to delete site");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site Deleted", description: "Site has been removed." });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const toggleSiteActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: number }) => {
      const response = await apiRequest("PATCH", `/api/sites/${id}`, { isActive });
      if (!response.ok) throw new Error("Failed to update site status");
      return response.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({
        title: vars.isActive === 1 ? "Site Activated" : "Site Closed",
        description: vars.isActive === 1
          ? "Site is now active and will appear in the dashboard."
          : "Site marked as closed. It will be hidden from daily tracking.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not update site status.", variant: "destructive" });
    },
  });

  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    createSiteMutation.mutate({
      name: newSiteName.trim(),
      partyId: newSitePartyId !== "all" ? parseInt(newSitePartyId) : null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <CardTitle>Sites Master</CardTitle>
            <CardDescription>Manage site names to avoid misspellings in reports</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {canCreate && (
          <form onSubmit={handleAddSite} className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm">Site Name</Label>
              <Input
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value.toUpperCase())}
                placeholder="Enter new site name"
                className="uppercase"
                data-testid="input-new-site"
              />
            </div>
            <div className="w-[180px]">
              <Label className="text-sm">Party (optional)</Label>
              <Select value={newSitePartyId} onValueChange={setNewSitePartyId}>
                <SelectTrigger data-testid="select-new-site-party">
                  <SelectValue placeholder="All parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All parties</SelectItem>
                  {partiesList.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={createSiteMutation.isPending || !newSiteName.trim()}
              className="gap-1"
              data-testid="button-add-site"
            >
              {createSiteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </Button>
          </form>
        )}

        {sitesLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sitesList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-sites">
            No sites added yet.
          </p>
        ) : (
          <div className="space-y-2">
            {sitesList.map((site) => (
              <div key={site.id} className={`flex items-center gap-2 p-2 rounded border transition-opacity ${site.isActive === 0 ? "opacity-50 bg-slate-50 dark:bg-slate-900/30" : ""}`} data-testid={`site-row-${site.id}`}>
                {editingSiteId === site.id ? (
                  <>
                    <Input
                      value={editingSiteName}
                      onChange={(e) => setEditingSiteName(e.target.value.toUpperCase())}
                      className="uppercase flex-1"
                      data-testid={`input-edit-site-${site.id}`}
                      autoFocus
                    />
                    <Select value={editingSitePartyId} onValueChange={setEditingSitePartyId}>
                      <SelectTrigger className="w-[140px]" data-testid={`select-edit-site-party-${site.id}`}>
                        <SelectValue placeholder="Party" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All parties</SelectItem>
                        {partiesList.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (editingSiteName.trim()) {
                          updateSiteMutation.mutate({
                            id: site.id,
                            name: editingSiteName.trim(),
                            partyId: editingSitePartyId !== "all" ? parseInt(editingSitePartyId) : null,
                          });
                        }
                      }}
                      disabled={updateSiteMutation.isPending}
                      data-testid={`button-save-site-${site.id}`}
                    >
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditingSiteId(null); setEditingSiteName(""); setEditingSitePartyId("all"); }}
                      data-testid={`button-cancel-edit-site-${site.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" data-testid={`text-site-name-${site.id}`}>{site.name}</span>
                      {site.partyId && (
                        <Badge variant="outline" className="text-sm">{getPartyName(site.partyId) || "Unknown"}</Badge>
                      )}
                      {site.isActive === 0 && (
                        <Badge variant="outline" className="text-sm border-slate-400 text-slate-500" data-testid={`badge-closed-${site.id}`}>Closed</Badge>
                      )}
                    </div>
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title={site.isActive === 0 ? "Reactivate site" : "Mark as closed"}
                        onClick={() => {
                          const closing = site.isActive !== 0;
                          if (closing && !confirm(`Mark "${site.name}" as closed? It will be hidden from the daily dashboard and dropdowns.`)) return;
                          toggleSiteActiveMutation.mutate({ id: site.id, isActive: site.isActive === 0 ? 1 : 0 });
                        }}
                        disabled={toggleSiteActiveMutation.isPending}
                        data-testid={`button-toggle-site-${site.id}`}
                      >
                        <Power className={`w-3.5 h-3.5 ${site.isActive === 0 ? "text-slate-400" : "text-green-600"}`} />
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingSiteId(site.id);
                          setEditingSiteName(site.name);
                          setEditingSitePartyId(site.partyId ? String(site.partyId) : "all");
                        }}
                        data-testid={`button-edit-site-${site.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete site "${site.name}"?`)) {
                            deleteSiteMutation.mutate(site.id);
                          }
                        }}
                        disabled={deleteSiteMutation.isPending}
                        data-testid={`button-delete-site-${site.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

  );
}

export function PartyMaster() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canEdit = sectionCan("master_parties", "edit");
  const canCreate = sectionCan("master_parties", "create");
  const canDelete = isAdmin;
  const canExport = sectionCan("master_parties", "view_reports");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const exportToExcel = (data: Party[]) => {
    const ws = XLSX.utils.json_to_sheet(data.map(p => ({ Name: p.name, Notes: p.notes || "" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parties");
    XLSX.writeFile(wb, "parties.xlsx");
    toast({ title: "Exported to Excel" });
  };

  const handlePrint = () => {
    window.print();
  };

  const { data: parties, isLoading } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; notes?: string }) =>
      apiRequest("POST", "/api/plant-module/parties", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Party created successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; notes?: string } }) =>
      apiRequest("PATCH", `/api/plant-module/parties/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Party updated successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/parties/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      toast({ title: "Party deleted successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const resetForm = () => {
    setName("");
    setNotes("");
    setEditingParty(null);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (editingParty) {
      updateMutation.mutate({ id: editingParty.id, data: { name, notes } });
    } else {
      createMutation.mutate({ name, notes });
    }
  };

  const openEdit = (party: Party) => {
    setEditingParty(party);
    setName(party.name);
    setNotes(party.notes || "");
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Party/Job Master
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => parties && exportToExcel(parties)} disabled={!parties?.length} data-testid="button-export-parties">
                <Download className="w-4 h-4" /> Excel
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print-parties">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            {canCreate && (
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-add-party">
                <Plus className="w-4 h-4" /> Add Party
              </Button>
            </DialogTrigger>
            )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingParty ? "Edit Party" : "Add New Party"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="party-name">Party/Job Name</Label>
                <Input
                  id="party-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., GIRIDHAR - BC"
                  data-testid="input-party-name"
                />
              </div>
              <div>
                <Label htmlFor="party-notes">Notes (optional)</Label>
                <Textarea
                  id="party-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.toUpperCase())}
                  placeholder="Additional notes..."
                  data-testid="input-party-notes"
                />
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-party">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingParty ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !parties?.length ? (
          <p className="text-muted-foreground text-center py-6">No parties added yet.</p>
        ) : (
          <div className="space-y-2">
            {parties.map((party) => (
              <div key={party.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{party.name}</p>
                  {party.notes && <p className="text-sm text-muted-foreground">{party.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(party)} data-testid={`button-edit-party-${party.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(party.id)} data-testid={`button-delete-party-${party.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MaterialMaster() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canEdit = sectionCan("master_materials", "edit");
  const canCreate = sectionCan("master_materials", "create");
  const canDelete = isAdmin;
  const canExport = sectionCan("master_materials", "view_reports");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<PlantMaterial | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [defaultUom, setDefaultUom] = useState("Ton");
  const [procurementRoute, setProcurementRoute] = useState("stores");
  const [bulkDensity, setBulkDensity] = useState("");
  const [volumeUom, setVolumeUom] = useState("CFT");
  
  // Opening Stock dialog state
  const [openingStockDialogOpen, setOpeningStockDialogOpen] = useState(false);
  const [selectedMaterialForStock, setSelectedMaterialForStock] = useState<PlantMaterial | null>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockPartyId, setStockPartyId] = useState<string>("");
  const [stockDate, setStockDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockNotes, setStockNotes] = useState("");
  const [stockTankNumber, setStockTankNumber] = useState<string>("");
  const [editingOpeningStock, setEditingOpeningStock] = useState<MaterialOpeningStock | null>(null);
  const [deleteOpeningStockId, setDeleteOpeningStockId] = useState<number | null>(null);

  const exportToExcel = (data: PlantMaterial[]) => {
    const ws = XLSX.utils.json_to_sheet(data.map(m => ({ Name: m.name, Category: m.category || "", UOM: m.defaultUom })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materials");
    XLSX.writeFile(wb, "materials.xlsx");
    toast({ title: "Exported to Excel" });
  };

  const { data: materials, isLoading } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: openingStocks } = useQuery<MaterialOpeningStock[]>({
    queryKey: ["/api/plant-module/opening-stocks"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category?: string; defaultUom: string; procurementRoute: string; bulkDensity?: number | null; conversionFromUom?: string }) =>
      apiRequest("POST", "/api/plant-module/materials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      resetForm();
      toast({ title: "Material created successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; category?: string; defaultUom: string; procurementRoute: string; bulkDensity?: number | null; conversionFromUom?: string }> }) =>
      apiRequest("PATCH", `/api/plant-module/materials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      resetForm();
      toast({ title: "Material updated successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const createOpeningStockMutation = useMutation({
    mutationFn: (data: { materialId: number; partyId?: number | null; isPlantCommon: number; quantity: number; uom: string; date: string; notes?: string }) =>
      apiRequest("POST", "/api/plant-module/opening-stocks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('stock') || q.queryKey[0]?.toString().includes('opening') || false });
      resetOpeningStockForm();
      toast({ title: "Opening stock added successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateOpeningStockMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/opening-stocks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('stock') || q.queryKey[0]?.toString().includes('opening') || false });
      resetOpeningStockForm();
      toast({ title: "Opening stock updated successfully" });
    },
  });

  const deleteOpeningStockMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/opening-stocks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('stock') || q.queryKey[0]?.toString().includes('opening') || false });
      setDeleteOpeningStockId(null);
      toast({ title: "Opening stock deleted successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/materials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      toast({ title: "Material deleted successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingMaterial(null);
    setName("");
    setCategory("");
    setDefaultUom("Ton");
    setProcurementRoute("stores");
    setBulkDensity("");
    setVolumeUom("CFT");
  };

  const resetOpeningStockForm = () => {
    setOpeningStockDialogOpen(false);
    setSelectedMaterialForStock(null);
    setEditingOpeningStock(null);
    setStockQuantity("");
    setStockPartyId("");
    setStockDate(new Date().toISOString().split('T')[0]);
    setStockNotes("");
    setStockTankNumber("");
  };

  const openEdit = (material: PlantMaterial) => {
    setEditingMaterial(material);
    setName(material.name);
    setCategory(material.category || "");
    setDefaultUom(material.defaultUom || "Ton");
    setProcurementRoute((material as any).procurementRoute || "stores");
    setBulkDensity((material as any).bulkDensity != null ? String((material as any).bulkDensity) : "");
    setVolumeUom((material as any).conversionFromUom || "CFT");
    setDialogOpen(true);
  };

  const openOpeningStockDialog = (material: PlantMaterial) => {
    setSelectedMaterialForStock(material);
    setOpeningStockDialogOpen(true);
  };

  const handleSubmit = () => {
    const bd = parseFloat(bulkDensity);
    const data = { 
      name, 
      category, 
      defaultUom,
      procurementRoute,
      bulkDensity: !isNaN(bd) && bd > 0 ? bd : null,
      conversionFromUom: !isNaN(bd) && bd > 0 ? volumeUom : undefined,
    };
    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpeningStockSubmit = () => {
    if (!stockQuantity) return;
    const materialId = selectedMaterialForStock?.id ?? editingOpeningStock?.materialId;
    if (!materialId) return;
    const data = {
      materialId,
      partyId: stockPartyId ? Number(stockPartyId) : null,
      isPlantCommon: 0,
      quantity: parseFloat(stockQuantity),
      uom: selectedMaterialForStock?.defaultUom || editingOpeningStock?.uom || "Ton",
      date: stockDate,
      tankNumber: stockTankNumber ? Number(stockTankNumber) : null,
      notes: stockNotes || undefined,
    };
    if (editingOpeningStock) {
      updateOpeningStockMutation.mutate({ id: editingOpeningStock.id, data });
    } else {
      createOpeningStockMutation.mutate(data);
    }
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || `Material #${id}`;
  const getPartyName = (id: number | null) => {
    if (id === null) return "HLC (Common)";
    return parties?.find(p => p.id === id)?.name || `Party #${id}`;
  };

  const openEditOpeningStock = (os: MaterialOpeningStock) => {
    setEditingOpeningStock(os);
    setStockPartyId(os.partyId ? String(os.partyId) : "");
    setStockQuantity(String(os.quantity));
    setStockDate(os.date);
    setStockNotes(os.notes || "");
    setStockTankNumber(os.tankNumber ? String(os.tankNumber) : "");
    setSelectedMaterialForStock(materials?.find(m => m.id === os.materialId) || null);
    setOpeningStockDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Material Master
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => materials && exportToExcel(materials)} disabled={!materials?.length} data-testid="button-export-materials">
              <Download className="w-4 h-4" /> Excel
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
            {canCreate && (
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1" data-testid="button-add-material">
                  <Plus className="w-4 h-4" /> Add Material
                </Button>
              </DialogTrigger>
            )}
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingMaterial ? "Edit Material" : "Add New Material"}</DialogTitle>
              </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="material-name">Material Name</Label>
                <Input
                  id="material-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., 20MM AGGREGATE"
                  data-testid="input-material-name"
                />
              </div>
              <div>
                <Label htmlFor="material-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-material-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aggregate">Aggregate</SelectItem>
                    <SelectItem value="Bitumen">Bitumen</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="material-uom">Default UOM</Label>
                <Select value={defaultUom} onValueChange={setDefaultUom}>
                  <SelectTrigger data-testid="select-material-uom">
                    <SelectValue placeholder="Select UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ton">Ton</SelectItem>
                    <SelectItem value="MT">MT</SelectItem>
                    <SelectItem value="Cum">Cum</SelectItem>
                    <SelectItem value="Liters">Liters</SelectItem>
                    <SelectItem value="Kgs">Kgs</SelectItem>
                    <SelectItem value="CFT">CFT</SelectItem>
                    <SelectItem value="Barrels">Barrels</SelectItem>
                    <SelectItem value="Nos">Nos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="material-procurement-route">Procurement Route</Label>
                <Select value={procurementRoute} onValueChange={setProcurementRoute}>
                  <SelectTrigger data-testid="select-material-procurement-route">
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stores">Stores / Spares / Tools / Consumables</SelectItem>
                    <SelectItem value="bulk_plant">Bulk Material</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {procurementRoute === "bulk_plant" ? "Goes directly to Plant Material Receipt after purchaser action." : "Goes through Stores handover → GRN after purchaser action."}
                </p>
              </div>

              {/* Bulk Density for volume→weight conversion */}
              <div className="rounded-md border border-dashed border-border p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Volume → Weight Conversion (optional)</p>
                <p className="text-sm text-muted-foreground">
                  Fill this only if the material is sometimes received in volume units (CFT / Cum) but tracked in weight (MT / Ton).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Volume UOM at Receipt</Label>
                    <Select value={volumeUom} onValueChange={setVolumeUom}>
                      <SelectTrigger data-testid="select-volume-uom" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CFT">CFT (cubic feet)</SelectItem>
                        <SelectItem value="Cum">CUM / m³</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Bulk Density (MT/m³)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="5"
                      value={bulkDensity}
                      onChange={e => setBulkDensity(e.target.value)}
                      placeholder="e.g. 2.1"
                      className="h-8 text-sm"
                      data-testid="input-bulk-density"
                    />
                  </div>
                </div>
                {parseFloat(bulkDensity) > 0 && (
                  <div className="text-sm rounded bg-background border px-3 py-2 space-y-0.5">
                    <p className="font-medium text-foreground">Derived conversion factor:</p>
                    {volumeUom === "CFT" ? (
                      <>
                        <p className="text-muted-foreground">1 CFT = {(parseFloat(bulkDensity) / 35.3147).toFixed(5)} Ton</p>
                        <p className="text-muted-foreground">1530 CFT = {(1530 * parseFloat(bulkDensity) / 35.3147).toFixed(2)} Ton (example)</p>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground">1 m³ = {parseFloat(bulkDensity).toFixed(3)} Ton</p>
                        <p className="text-muted-foreground">43.32 m³ = {(43.32 * parseFloat(bulkDensity)).toFixed(2)} Ton (example)</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !name.trim()} data-testid="button-save-material">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingMaterial ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !materials?.length ? (
          <p className="text-muted-foreground text-center py-6">No materials added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {materials.map((material) => (
              <div key={material.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{material.name}</p>
                  <p className="text-sm text-muted-foreground">{material.category} - {material.defaultUom}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(material as any).procurementRoute === "bulk_plant" && (
                      <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">BULK MATERIAL</span>
                    )}
                    {(material as any).bulkDensity != null && (
                      <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {(material as any).bulkDensity} MT/m³ · {(material as any).conversionFromUom || "CFT"}→Ton
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openOpeningStockDialog(material)} data-testid={`button-add-stock-${material.id}`} title="Add Opening Stock">
                    <Plus className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(material)} data-testid={`button-edit-material-${material.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(material.id)} data-testid={`button-delete-material-${material.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {openingStocks && openingStocks.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Opening Stock Entries</h3>
            <div className="space-y-2">
              {openingStocks.map((os) => (
                <div key={os.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 border" data-testid={`opening-stock-entry-${os.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{getMaterialName(os.materialId)}</p>
                    <p className="text-sm text-muted-foreground">
                      {os.quantity} {os.uom} | {getPartyName(os.partyId)} | {os.date}{os.tankNumber ? ` | Tank ${os.tankNumber}` : ""}
                      {os.notes ? ` | ${os.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => openEditOpeningStock(os)} data-testid={`button-edit-opening-stock-${os.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteOpeningStockId(os.id)} data-testid={`button-delete-opening-stock-${os.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Opening Stock Dialog */}
          <Dialog open={openingStockDialogOpen} onOpenChange={(open) => { if (!open) resetOpeningStockForm(); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingOpeningStock ? "Edit Opening Stock" : "Add Opening Stock"}</DialogTitle>
                {selectedMaterialForStock && (
                  <p className="text-sm text-muted-foreground">{selectedMaterialForStock.name}</p>
                )}
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Party/Job</Label>
                  <Select value={stockPartyId} onValueChange={setStockPartyId}>
                    <SelectTrigger data-testid="select-stock-party">
                      <SelectValue placeholder="Select party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties?.map((party) => (
                        <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="stock-quantity">Quantity ({selectedMaterialForStock?.defaultUom || editingOpeningStock?.uom || "Ton"})</Label>
                  <Input
                    id="stock-quantity"
                    type="number"
                    step="0.01"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="0.00"
                    data-testid="input-stock-quantity"
                  />
                </div>
                
                <div>
                  <Label htmlFor="stock-date">Date</Label>
                  <Input
                    id="stock-date"
                    type="date"
                    value={stockDate}
                    onChange={(e) => setStockDate(e.target.value)}
                    data-testid="input-stock-date"
                  />
                </div>
                
                <div>
                  <Label htmlFor="stock-notes">Notes (optional)</Label>
                  <Input
                    id="stock-notes"
                    value={stockNotes}
                    onChange={(e) => setStockNotes(e.target.value.toUpperCase())}
                    placeholder="Opening balance from previous period"
                    data-testid="input-stock-notes"
                  />
                </div>

                  {(() => {
                    const mat = selectedMaterialForStock ?? (editingOpeningStock ? materials?.find(m => m.id === editingOpeningStock.materialId) : null);
                    const needsTank = mat?.category === "Bitumen" || mat?.name?.toUpperCase().includes("LDO");
                    if (!needsTank) return null;
                    return (
                      <div>
                        <Label>Tank Number</Label>
                        <Select value={stockTankNumber} onValueChange={setStockTankNumber}>
                          <SelectTrigger data-testid="select-stock-tank-number">
                            <SelectValue placeholder="Select tank" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Tank 1</SelectItem>
                            <SelectItem value="2">Tank 2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                
                <Button 
                  onClick={handleOpeningStockSubmit} 
                  className="w-full" 
                  disabled={(createOpeningStockMutation.isPending || updateOpeningStockMutation.isPending) || !stockQuantity || !stockPartyId}
                  data-testid="button-save-opening-stock"
                >
                  {(createOpeningStockMutation.isPending || updateOpeningStockMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingOpeningStock ? "Update Opening Stock" : "Add Opening Stock"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        {/* Delete Opening Stock Confirmation Dialog */}
        <Dialog open={deleteOpeningStockId !== null} onOpenChange={(open) => { if (!open) setDeleteOpeningStockId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Opening Stock Entry</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Are you sure you want to delete this opening stock entry? This action cannot be undone and will affect stock balances.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteOpeningStockId(null)} data-testid="button-cancel-delete-opening-stock">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => { if (deleteOpeningStockId) deleteOpeningStockMutation.mutate(deleteOpeningStockId); }}
                disabled={deleteOpeningStockMutation.isPending}
                data-testid="button-confirm-delete-opening-stock"
              >
                {deleteOpeningStockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

type MixTemplateComponent = {
  id: number;
  templateId: number;
  materialId: number;
  percent: number | null;
  uom: string;
  moistureContent?: number | null;
  wastageFactor?: number | null;
};

export function MixTemplateMaster() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canEdit = sectionCan("master_materials", "edit");
  const canCreate = sectionCan("master_materials", "create");
  const canDelete = isAdmin;
  const canExport = sectionCan("master_materials", "view_reports");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MixTemplate | null>(null);
  const [name, setName] = useState("");
  const [mixType, setMixType] = useState("");
  const [bitumenPercent, setBitumenPercent] = useState("");
  const [ldoNorm, setLdoNorm] = useState("6");
  const [densityTPerCum, setDensityTPerCum] = useState("");
  const [binderGrade, setBinderGrade] = useState("VG-30");
  const [notes, setNotes] = useState("");
  const [aggregateProportions, setAggregateProportions] = useState<Record<number, string>>({});
  const [aggregateMoistureContent, setAggregateMoistureContent] = useState<Record<number, string>>({});
  const [aggregateWastageFactors, setAggregateWastageFactors] = useState<Record<number, string>>({});
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [newMixTypeDialogOpen, setNewMixTypeDialogOpen] = useState(false);
  const [newMixTypeName, setNewMixTypeName] = useState("");
  const nowLocal = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    };
  };
  const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false);
  const [rebuildTemplateId, setRebuildTemplateId] = useState<number | null>(null);
  const [rebuildTemplateName, setRebuildTemplateName] = useState("");
  const [rebuildFromDate, setRebuildFromDate] = useState("");
  const [rebuildFromTime, setRebuildFromTime] = useState("00:00");
  const [rebuildResult, setRebuildResult] = useState<{ fromDateTime: string; dispatches: number; ledgerRowsDeleted: number; ledgerRowsCreated: number; errors: string[] } | null>(null);
  const [postSaveAlertTemplate, setPostSaveAlertTemplate] = useState<{ id: number; name: string } | null>(null);

  const { data: templates, isLoading } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: allComponents } = useQuery<MixTemplateComponent[]>({
    queryKey: ["/api/plant-module/mix-template-components"],
  });

  const { data: mixTypes } = useQuery<MixType[]>({
    queryKey: ["/api/plant-module/mix-types"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const aggregateMaterials = materials?.filter(m => m.category === "Aggregate") || [];
  
  const createMixTypeMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/plant-module/mix-types", data);
      return response.json() as Promise<MixType>;
    },
    onSuccess: (newType: MixType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-types"] });
      setMixType(newType.name);
      setNewMixTypeDialogOpen(false);
      setNewMixTypeName("");
      toast({ title: "Mix type created successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Failed to create mix type", variant: "destructive" });
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { 
      name: string; 
      mixType: string; 
      bitumenPercent?: number; 
      binderGrade?: string;
      ldoNorm?: number;
      notes?: string;
      components?: { materialId: number; percent: number; uom: string }[];
    }) => apiRequest("POST", "/api/plant-module/mix-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Mix template created successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data, _proportionsChanged: _ }: { id: number; _proportionsChanged?: boolean; data: { 
      name?: string; 
      mixType?: string; 
      bitumenPercent?: number; 
      binderGrade?: string;
      ldoNorm?: number;
      notes?: string;
      components?: { materialId: number; percent: number; uom: string }[];
    }}) => apiRequest("PATCH", `/api/plant-module/mix-templates/${id}`, data),
    onSuccess: (_, variables) => {
      const savedId = variables.id;
      const savedName = name;
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDialogOpen(false);
      resetForm();
      if (isAdmin && variables._proportionsChanged) setPostSaveAlertTemplate({ id: savedId, name: savedName });
      toast({ title: "Mix template updated successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/mix-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDeleteConfirmId(null);
      toast({ title: "Mix template deleted successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const rebuildLedgerMutation = useMutation({
    mutationFn: ({ templateId, fromDateTime }: { templateId: number; fromDateTime: string }) =>
      apiRequest("POST", `/api/plant-module/mix-templates/${templateId}/rebuild-ledger`, { fromDateTime }).then(r => r.json()),
    onSuccess: (data: { fromDateTime: string; dispatches: number; ledgerRowsDeleted: number; ledgerRowsCreated: number; errors: string[] }) => {
      setRebuildResult(data);
    },
    onError: (error: any) => {
      toast({ title: "Rebuild failed", description: error.message, variant: "destructive" });
    },
  });

  const openRebuildDialog = (template: MixTemplate) => {
    const { date, time } = nowLocal();
    setRebuildTemplateId(template.id);
    setRebuildTemplateName(template.name);
    setRebuildFromDate(date);
    setRebuildFromTime(time);
    setRebuildResult(null);
    setRebuildDialogOpen(true);
  };

  const handleRebuild = () => {
    if (!rebuildTemplateId || !rebuildFromDate) return;
    const fromDateTime = `${rebuildFromDate}T${rebuildFromTime || "00:00"}`;
    rebuildLedgerMutation.mutate({ templateId: rebuildTemplateId, fromDateTime });
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setName("");
    setMixType("");
    setBitumenPercent("");
    setLdoNorm("6");
    setDensityTPerCum("");
    setBinderGrade("VG-30");
    setNotes("");
    setSelectedPartyId("");
    setAggregateProportions({});
    setAggregateMoistureContent({});
    setAggregateWastageFactors({});
  };

  const openEdit = (template: MixTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setMixType(template.mixType);
    setBitumenPercent(template.bitumenPercent?.toString() || "");
    setLdoNorm(template.ldoNorm?.toString() || "6");
    setDensityTPerCum((template as any).densityTPerCum?.toString() || "");
    setBinderGrade((template as any).binderGrade || "VG-30");
    setNotes(template.notes || "");
    setSelectedPartyId(template.partyId != null ? String(template.partyId) : "");
    // Load components for this template
    const templateComponents = allComponents?.filter(c => c.templateId === template.id) || [];
    const proportions: Record<number, string> = {};
    const mc: Record<number, string> = {};
    const wf: Record<number, string> = {};
    templateComponents.forEach(c => {
      proportions[c.materialId] = c.percent?.toString() || "";
      if (c.moistureContent) mc[c.materialId] = c.moistureContent.toString();
      if (c.wastageFactor) wf[c.materialId] = c.wastageFactor.toString();
    });
    setAggregateProportions(proportions);
    setAggregateMoistureContent(mc);
    setAggregateWastageFactors(wf);
    setDialogOpen(true);
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || "Unknown";

  // Calculate total percentage (aggregates + bitumen)
  const aggregateTotal = Object.values(aggregateProportions)
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const bitumenVal = parseFloat(bitumenPercent) || 0;
  const totalPercent = aggregateTotal + bitumenVal;

  const handleSubmit = () => {
    // Validate MC and WF bounds before submit
    for (const [matIdStr] of Object.entries(aggregateProportions).filter(([_, v]) => v && parseFloat(v) > 0)) {
      const matId = parseInt(matIdStr);
      const mc = parseFloat(aggregateMoistureContent[matId] || "0") || 0;
      const wf = parseFloat(aggregateWastageFactors[matId] || "0") || 0;
      const matName = getMaterialName(matId);
      if (mc < 0 || mc > 30) {
        toast({ title: `Invalid moisture content for ${matName}`, description: "Moisture content must be between 0% and 30%.", variant: "destructive" });
        return;
      }
      if (wf < 0 || wf > 20) {
        toast({ title: `Invalid wastage factor for ${matName}`, description: "Wastage factor must be between 0% and 20%.", variant: "destructive" });
        return;
      }
    }
    const components = Object.entries(aggregateProportions)
      .filter(([_, value]) => value && parseFloat(value) > 0)
      .map(([materialId, percent]) => ({
        materialId: parseInt(materialId),
        percent: parseFloat(percent),
        uom: "%",
        moistureContent: parseFloat(aggregateMoistureContent[parseInt(materialId)] || "0") || 0,
        wastageFactor: parseFloat(aggregateWastageFactors[parseInt(materialId)] || "0") || 0,
      }));

    const data = {
      name,
      mixType,
      bitumenPercent: bitumenPercent ? parseFloat(bitumenPercent) : undefined,
      binderGrade: binderGrade || undefined,
      ldoNorm: ldoNorm ? parseFloat(ldoNorm) : 6,
      densityTPerCum: densityTPerCum ? parseFloat(densityTPerCum) : undefined,
      notes,
      partyId: selectedPartyId ? parseInt(selectedPartyId) : null,
      components
    };

    if (editingTemplate) {
      // Detect whether component proportions changed for the post-save rebuild prompt
      const prevComponents = allComponents?.filter(c => c.templateId === editingTemplate.id) ?? [];
      const prevMap = new Map(prevComponents.map(c => [c.materialId, c.percent ?? 0]));
      const nextComponents = data.components ?? [];
      const proportionsChanged =
        nextComponents.some(nc => Math.abs((prevMap.get(nc.materialId) ?? -1) - nc.percent) > 0.001) ||
        prevComponents.some(pc => !nextComponents.find(nc => nc.materialId === pc.materialId));
      updateMutation.mutate({ id: editingTemplate.id, data, _proportionsChanged: proportionsChanged });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Mix Template Master
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          {canCreate && (
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-add-mix-template">
                <Plus className="w-4 h-4" /> Add Template
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Mix Template" : "Add Mix Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., BC STANDARD"
                  data-testid="input-template-name"
                />
              </div>
              <div>
                <Label htmlFor="mix-type">Mix Type</Label>
                <Select 
                  value={mixType} 
                  onValueChange={(value) => {
                    if (value === "__add_new__") {
                      setNewMixTypeDialogOpen(true);
                    } else {
                      setMixType(value);
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-mix-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {mixTypes?.map((type) => (
                      <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                    ))}
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Add New Type</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="party-assign">Assign to Party <span className="text-muted-foreground font-normal">(optional — leave blank for shared/standard)</span></Label>
                <Select
                  value={selectedPartyId === "" ? "__none__" : selectedPartyId}
                  onValueChange={(v) => setSelectedPartyId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="party-assign" data-testid="select-template-party">
                    <SelectValue placeholder="Shared / all parties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Shared / all parties</SelectItem>
                    {parties?.filter(p => p.isActive !== 0).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="binder-grade">Bitumen Grade</Label>
                  <Select value={binderGrade} onValueChange={setBinderGrade}>
                    <SelectTrigger id="binder-grade" data-testid="select-binder-grade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["VG-10", "VG-30", "VG-40", "CRMB-55", "CRMB-60", "PMB-40", "Bitumen Emulsion"].map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bitumen-percent">Bitumen %</Label>
                  <Input
                    id="bitumen-percent"
                    type="number"
                    step="0.1"
                    value={bitumenPercent}
                    onChange={(e) => setBitumenPercent(e.target.value)}
                    placeholder="e.g., 5.2"
                    data-testid="input-bitumen-percent"
                  />
                </div>
                <div>
                  <Label htmlFor="density-t-per-cum">
                    Compacted Density (T/m³)
                  </Label>
                  <Input
                    id="density-t-per-cum"
                    type="number"
                    step="0.01"
                    value={densityTPerCum}
                    onChange={(e) => setDensityTPerCum(e.target.value)}
                    placeholder={
                      /^(BC|SDBC)$/i.test(mixType.trim()) ? "e.g., 2.40" :
                      /^(DBM|BM)$/i.test(mixType.trim()) ? "e.g., 2.35" :
                      "e.g., 2.35"
                    }
                    data-testid="input-density-t-per-cum"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {/^(BC|SDBC)$/i.test(mixType.trim())
                      ? "IRC default: 2.40 for BC/SDBC"
                      : /^(DBM|BM)$/i.test(mixType.trim())
                      ? "IRC default: 2.35 for DBM/BM"
                      : "Leave blank to use IRC standard default"}
                  </p>
                </div>
                <div>
                  <Label htmlFor="ldo-norm">LDO Norm (L/ton)</Label>
                  <Input
                    id="ldo-norm"
                    type="number"
                    step="0.1"
                    value={ldoNorm}
                    onChange={(e) => setLdoNorm(e.target.value)}
                    placeholder="e.g., 6"
                    data-testid="input-ldo-norm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Aggregate Proportions</Label>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Material</th>
                        <th className="px-2 py-1.5 text-center font-medium">Mix %</th>
                        <th className="px-2 py-1.5 text-center font-medium" title="Moisture content: water in as-received aggregate">MC %</th>
                        <th className="px-2 py-1.5 text-center font-medium" title="Wastage factor: material lost during handling">WF %</th>
                        <th className="px-2 py-1.5 text-center font-medium text-muted-foreground" title="Net supply multiplier = (1 + WF/100) / (1 − MC/100)">×Adj</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregateMaterials.filter(mat => {
                        // Granular fractions (WMM/GSB) don't belong in bituminous templates.
                        const isBit = /^(BC|DBM|SDBC|BM)$/i.test(String(mixType).trim());
                        return !(isBit && /^(WMM|GSB)$/i.test(String(mat.name).trim()));
                      }).map((mat, idx) => {
                        const mc = parseFloat(aggregateMoistureContent[mat.id] || "0") || 0;
                        const wf = parseFloat(aggregateWastageFactors[mat.id] || "0") || 0;
                        const multiplier = (1 + wf / 100) / (1 - mc / 100);
                        const hasAdj = mc > 0 || wf > 0;
                        return (
                          <tr key={mat.id} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                            <td className="px-2 py-1 font-medium text-sm">{mat.name}</td>
                            <td className="px-2 py-1">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={aggregateProportions[mat.id] || ""}
                                onChange={(e) => setAggregateProportions(prev => ({ ...prev, [mat.id]: e.target.value }))}
                                placeholder="0"
                                className="h-7 text-sm text-center"
                                data-testid={`input-aggregate-${mat.id}`}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max="30"
                                value={aggregateMoistureContent[mat.id] || ""}
                                onChange={(e) => setAggregateMoistureContent(prev => ({ ...prev, [mat.id]: e.target.value }))}
                                placeholder="0"
                                className="h-7 text-sm text-center"
                                data-testid={`input-mc-${mat.id}`}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max="20"
                                value={aggregateWastageFactors[mat.id] || ""}
                                onChange={(e) => setAggregateWastageFactors(prev => ({ ...prev, [mat.id]: e.target.value }))}
                                placeholder="0"
                                className="h-7 text-sm text-center"
                                data-testid={`input-wf-${mat.id}`}
                              />
                            </td>
                            <td className="px-2 py-1 text-center">
                              <span className={`font-mono text-sm ${hasAdj ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                                {hasAdj ? `×${multiplier.toFixed(3)}` : "—"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className={`text-sm ${Math.abs(totalPercent - 100) < 0.5 ? "text-green-600" : "text-amber-600"}`}>
                  Mix total: {totalPercent.toFixed(1)}% (Bitumen: {bitumenVal}% + Aggregates: {aggregateTotal.toFixed(1)}%)
                  {Math.abs(totalPercent - 100) >= 0.5 && " — Should equal 100%"}
                </div>
                <p className="text-sm text-muted-foreground">MC = moisture content (water in as-received material). WF = wastage factor (handling losses). Both increase the required supply quantity.</p>
              </div>

              <div>
                <Label htmlFor="template-notes">Notes</Label>
                <Textarea
                  id="template-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.toUpperCase())}
                  placeholder="Additional notes..."
                  data-testid="input-template-notes"
                />
              </div>
              <Button 
                onClick={handleSubmit} 
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !name.trim()}
                data-testid="button-save-template"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this mix template?</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rebuild Ledger Dialog */}
      <Dialog open={rebuildDialogOpen} onOpenChange={(open) => { if (!open) { setRebuildDialogOpen(false); setRebuildResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              Rebuild Stock Ledger
            </DialogTitle>
          </DialogHeader>
          {rebuildResult ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 space-y-2">
                <p className="font-semibold text-green-800 dark:text-green-300">Rebuild complete for <span className="font-bold">{rebuildTemplateName}</span></p>
                <p className="text-sm text-green-600 dark:text-green-500">Cutoff: {rebuildResult.fromDateTime.replace("T", " at ")}</p>
                <div className="text-sm text-green-700 dark:text-green-400 space-y-1">
                  <p>Dispatches processed: <strong>{rebuildResult.dispatches}</strong></p>
                  <p>Ledger rows deleted: <strong>{rebuildResult.ledgerRowsDeleted}</strong></p>
                  <p>Ledger rows created: <strong>{rebuildResult.ledgerRowsCreated}</strong></p>
                </div>
                {rebuildResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Warnings ({rebuildResult.errors.length}):</p>
                    <ul className="text-sm text-amber-600 dark:text-amber-500 list-disc list-inside mt-1 space-y-0.5">
                      {rebuildResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              <Button className="w-full" onClick={() => { setRebuildDialogOpen(false); setRebuildResult(null); }} data-testid="button-rebuild-done">
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Rebuilds aggregate stock ledger entries for <strong>{rebuildTemplateName}</strong> from the chosen date and time onward using the current component proportions. Bitumen and LDO entries are not affected.
              </p>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>This permanently modifies stock ledger data. Use only after confirming the cutoff date and time.</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rebuild-from-date">Cutoff Date</Label>
                  <Input
                    id="rebuild-from-date"
                    type="date"
                    value={rebuildFromDate}
                    onChange={(e) => setRebuildFromDate(e.target.value)}
                    data-testid="input-rebuild-from-date"
                  />
                </div>
                <div>
                  <Label htmlFor="rebuild-from-time">Cutoff Time</Label>
                  <Input
                    id="rebuild-from-time"
                    type="time"
                    value={rebuildFromTime}
                    onChange={(e) => setRebuildFromTime(e.target.value)}
                    data-testid="input-rebuild-from-time"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRebuildDialogOpen(false)} data-testid="button-rebuild-cancel">Cancel</Button>
                <Button
                  variant="default"
                  className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleRebuild}
                  disabled={!rebuildFromDate || rebuildLedgerMutation.isPending}
                  data-testid="button-rebuild-confirm"
                >
                  {rebuildLedgerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Rebuild Ledger
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add New Mix Type Dialog */}
      <Dialog open={newMixTypeDialogOpen} onOpenChange={setNewMixTypeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New Mix Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-mix-type-name">Mix Type Name</Label>
              <Input
                id="new-mix-type-name"
                value={newMixTypeName}
                onChange={(e) => setNewMixTypeName(e.target.value.toUpperCase())}
                placeholder="e.g., SDBC, PMC, PMB"
                data-testid="input-new-mix-type-name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setNewMixTypeDialogOpen(false);
                setNewMixTypeName("");
              }}>Cancel</Button>
              <Button 
                onClick={() => {
                  if (newMixTypeName.trim()) {
                    createMixTypeMutation.mutate({ name: newMixTypeName.trim() });
                  }
                }}
                disabled={!newMixTypeName.trim() || createMixTypeMutation.isPending}
                data-testid="button-save-mix-type"
              >
                {createMixTypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CardContent>
        {postSaveAlertTemplate && isAdmin && (
          <div className="mb-4 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Proportions updated for <strong>{postSaveAlertTemplate.name}</strong>. Rebuild the stock ledger to recompute historical dispatch entries.
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-sm h-7 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/40"
                onClick={() => {
                  const tpl = templates?.find(t => t.id === postSaveAlertTemplate.id);
                  if (tpl) openRebuildDialog(tpl);
                  setPostSaveAlertTemplate(null);
                }}
                data-testid="button-post-save-rebuild"
              >
                <RotateCcw className="w-3 h-3" />
                Rebuild Ledger
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="w-7 h-7 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200"
                onClick={() => setPostSaveAlertTemplate(null)}
                data-testid="button-post-save-dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !templates?.length ? (
          <p className="text-muted-foreground text-center py-6">No mix templates added yet.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => {
              const templateComponents = allComponents?.filter(c => c.templateId === template.id) || [];
              return (
                <div key={template.id} className="p-3 rounded-md bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{template.name}</p>
                        {template.partyId != null
                          ? <Badge variant="secondary" className="text-sm">{parties?.find(p => p.id === template.partyId)?.name ?? `Party #${template.partyId}`}</Badge>
                          : <Badge variant="outline" className="text-sm text-muted-foreground">Shared</Badge>
                        }
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {template.mixType} — Bitumen: {template.bitumenPercent}% — LDO: {template.ldoNorm || 6} L/ton
                      </p>
                      {template.createdAt && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Created: {format(new Date(template.createdAt), "dd-MMM-yyyy HH:mm")}
                        </p>
                      )}
                      {templateComponents.length > 0 && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          <span className="font-medium">Aggregates:</span>{" "}
                          <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
                            {templateComponents.map((c) => {
                              const mc = c.moistureContent ?? 0;
                              const wf = c.wastageFactor ?? 0;
                              const hasAdj = mc > 0 || wf > 0;
                              return (
                                <span key={c.id} className="inline-flex items-center gap-1">
                                  <span>{getMaterialName(c.materialId)}: {c.percent}%</span>
                                  {hasAdj && (
                                    <span
                                      className="inline-flex items-center gap-0.5 rounded px-1 py-0 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium"
                                      title={`MC: ${mc}%  WF: ${wf}%`}
                                      data-testid={`badge-adj-${c.id}`}
                                    >
                                      {mc > 0 && <span>MC{mc}%</span>}
                                      {mc > 0 && wf > 0 && <span>·</span>}
                                      {wf > 0 && <span>WF{wf}%</span>}
                                      <span className="font-mono">×{((1 + wf / 100) / (1 - mc / 100)).toFixed(3)}</span>
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 items-center">
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-sm text-amber-700 dark:text-amber-400 hover:text-amber-900"
                            onClick={() => openRebuildDialog(template)}
                            data-testid={`button-rebuild-ledger-${template.id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Rebuild Ledger
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(template)} data-testid={`button-edit-template-${template.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(template.id)} data-testid={`button-delete-template-${template.id}`}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EquipmentMasterSection() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canEdit = sectionCan("master_equipment", "edit");
  const canCreate = sectionCan("master_equipment", "create");
  const canDelete = isAdmin;
  const canExport = sectionCan("master_equipment", "view_reports");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentMasterType | null>(null);
  const [deleteEquipmentId, setDeleteEquipmentId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [ownership, setOwnership] = useState("owned");
  const [vendorName, setVendorName] = useState("");
  const [meterType, setMeterType] = useState("hour_meter");
  const [consumptionNorm, setConsumptionNorm] = useState("");
  const [plantNameField, setPlantNameField] = useState(""); // form: assigned plant
  const [filterPlantName, setFilterPlantName] = useState("all"); // list filter
  const [showInactive, setShowInactive] = useState(false);
  // Planning Output — Standard Outputs table (one row per UNIT_MAP canonical key)
  const CANONICAL_UNITS = ["CUM", "SQM", "MT", "RM", "HECT", "KL", "LS", "NOS"];
  const [standardOutputsMap, setStandardOutputsMap] = useState<Record<string, string>>({});
  const [outputEfficiency, setOutputEfficiency] = useState("75");
  const [showPlanningOutput, setShowPlanningOutput] = useState(false);

  const { data: allPlantSettingsForEquip = [] } = useQuery<PlantSettingsWithSite[]>({
    queryKey: ["/api/plant-module/plant-settings"],
  });

  const { data: equipment, isLoading } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", showInactive ? "all" : "active"],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/equipment${showInactive ? "?includeInactive=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const filteredEquipment = useMemo(() => {
    if (!equipment) return [];
    if (filterPlantName === "all") return equipment;
    if (filterPlantName === "__shared__") return equipment.filter(e => !(e as any).plantName);
    return equipment.filter(e => (e as any).plantName === filterPlantName);
  }, [equipment, filterPlantName]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; registrationNumber?: string; ownership?: string; vendorName?: string; meterType: string; consumptionNorm?: number }) =>
      apiRequest("POST", "/api/plant-module/equipment", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      resetForm();
      toast({ title: "Equipment created successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; registrationNumber?: string; ownership?: string; vendorName?: string; meterType: string; consumptionNorm?: number }> }) =>
      apiRequest("PATCH", `/api/plant-module/equipment/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      resetForm();
      toast({ title: "Equipment updated successfully" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/equipment/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      setDeleteEquipmentId(null);
      toast({ title: "Equipment deleted successfully" });
    },
    onError: (error: any) => {
      setDeleteEquipmentId(null);
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else if (error?.status === 409 || error?.message?.includes("409")) {
        toast({
          title: "Cannot delete — usage history exists",
          description: "This equipment has existing usage records. Use the Deactivate toggle instead to hide it from active lists.",
          variant: "destructive",
        });
      } else if (error?.status === 404 || error?.message?.includes("404") || error?.message?.toLowerCase().includes("not found")) {
        queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
        toast({ title: "Not found", description: "This equipment record no longer exists.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/plant-module/equipment/${id}/toggle-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return key === "/api/plant-module/equipment";
      }});
      toast({ title: "Equipment status updated" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingEquipment(null);
    setName("");
    setRegistrationNumber("");
    setOwnership("owned");
    setVendorName("");
    setMeterType("hour_meter");
    setConsumptionNorm("");
    setPlantNameField("");
    setStandardOutputsMap({});
    setOutputEfficiency("75");
    setShowPlanningOutput(false);
  };

  const openEdit = (equip: EquipmentMasterType) => {
    setEditingEquipment(equip);
    setName(equip.name);
    setRegistrationNumber((equip as any).registrationNumber || "");
    setOwnership((equip as any).ownership || "owned");
    setVendorName((equip as any).vendorName || "");
    setMeterType(equip.meterType);
    setConsumptionNorm(equip.consumptionNorm?.toString() || "");
    setPlantNameField((equip as any).plantName || "");
    const stdOutputs = (equip as any).standardOutputs as Array<{ unit: string; outputPerHr: number }> | null | undefined;
    const map: Record<string, string> = {};
    if (Array.isArray(stdOutputs)) {
      for (const so of stdOutputs) {
        map[so.unit] = String(so.outputPerHr);
      }
    }
    setStandardOutputsMap(map);
    setOutputEfficiency((equip as any).outputEfficiency?.toString() || "75");
    setShowPlanningOutput(Array.isArray(stdOutputs) && stdOutputs.length > 0);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const stdOutputsArr = CANONICAL_UNITS
      .filter(u => standardOutputsMap[u] && parseFloat(standardOutputsMap[u]) > 0)
      .map(u => ({ unit: u, outputPerHr: parseFloat(standardOutputsMap[u]) }));
    const data = {
      name,
      registrationNumber: registrationNumber || undefined,
      ownership,
      vendorName: ownership === "hired" ? vendorName || undefined : undefined,
      meterType,
      consumptionNorm: consumptionNorm ? parseFloat(consumptionNorm) : undefined,
      plantName: plantNameField || null,
      standardOutputs: stdOutputsArr.length > 0 ? stdOutputsArr : null,
      outputEfficiency: outputEfficiency ? parseFloat(outputEfficiency) : null,
    };
    if (editingEquipment) {
      updateMutation.mutate({ id: editingEquipment.id, data });
    } else {
      createMutation.mutate(data as any);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          Equipment Master
        </CardTitle>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterPlantName} onValueChange={setFilterPlantName}>
            <SelectTrigger className="h-8 w-44 text-sm" data-testid="select-filter-plant-equipment">
              <SelectValue placeholder="All Plants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plants</SelectItem>
              <SelectItem value="__shared__">Shared / Unassigned</SelectItem>
              {allPlantSettingsForEquip.map(p => (
                <SelectItem key={p.plantName} value={p.plantName}>{p.plantName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(checked === true)}
              data-testid="checkbox-show-inactive"
            />
            <Label htmlFor="show-inactive" className="text-sm cursor-pointer">Show Inactive</Label>
          </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          {canCreate && (
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-add-equipment">
                <Plus className="w-4 h-4" /> Add Equipment
              </Button>
            </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEquipment ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="equipment-name">Equipment Name</Label>
                <Input
                  id="equipment-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., 600 KVA GENERATOR"
                  data-testid="input-equipment-name"
                />
              </div>
              <div>
                <Label htmlFor="registration-number">Registration / ID Number</Label>
                <Input
                  id="registration-number"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                  placeholder="e.g., MH12AB1234"
                  data-testid="input-registration-number"
                />
              </div>
              <div>
                <Label htmlFor="ownership">Ownership</Label>
                <Select value={ownership} onValueChange={setOwnership}>
                  <SelectTrigger data-testid="select-ownership">
                    <SelectValue placeholder="Select ownership" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Owned</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {ownership === "hired" && (
                <div>
                  <Label htmlFor="vendor-name">Vendor / Contractor Name</Label>
                  <Input
                    id="vendor-name"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value.toUpperCase())}
                    placeholder="e.g., ABC CONTRACTORS"
                    data-testid="input-vendor-name"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="meter-type">Meter Type</Label>
                <Select value={meterType} onValueChange={setMeterType}>
                  <SelectTrigger data-testid="select-meter-type">
                    <SelectValue placeholder="Select meter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour_meter">Hour Meter (hrs)</SelectItem>
                    <SelectItem value="odometer">Odometer (km)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="consumption-norm">Consumption Norm ({meterType === "hour_meter" ? "L/hr" : "L/km"})</Label>
                <Input
                  id="consumption-norm"
                  type="number"
                  step="0.1"
                  value={consumptionNorm}
                  onChange={(e) => setConsumptionNorm(e.target.value)}
                  placeholder="e.g., 50"
                  data-testid="input-consumption-norm"
                />
              </div>
              <div>
                <Label>Plant <span className="text-muted-foreground text-sm">(leave blank if shared across plants)</span></Label>
                <Select value={plantNameField || "__none__"} onValueChange={v => setPlantNameField(v === "__none__" ? "" : v)}>
                  <SelectTrigger data-testid="select-equipment-plant">
                    <SelectValue placeholder="Shared / Not assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Shared / No specific plant —</SelectItem>
                    {allPlantSettingsForEquip.map(p => (
                      <SelectItem key={p.plantName} value={p.plantName}>{p.plantName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Planning Output — Standard Outputs table (one row per UNIT_MAP key) */}
              <div className="border border-dashed border-teal-200 rounded-lg">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50/50 transition-colors rounded-lg"
                  onClick={() => setShowPlanningOutput(p => !p)}
                  data-testid="button-toggle-planning-output"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold uppercase tracking-wide text-teal-600">Standard Outputs</span>
                    <span className="text-[12px] text-muted-foreground font-normal">(for auto-duration in Work Programme)</span>
                    {CANONICAL_UNITS.filter(u => standardOutputsMap[u] && parseFloat(standardOutputsMap[u]) > 0).length > 0 && (
                      <span className="ml-1 bg-teal-100 text-teal-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                        {CANONICAL_UNITS.filter(u => standardOutputsMap[u] && parseFloat(standardOutputsMap[u]) > 0).length} unit{CANONICAL_UNITS.filter(u => standardOutputsMap[u] && parseFloat(standardOutputsMap[u]) > 0).length !== 1 ? "s" : ""} set
                      </span>
                    )}
                  </span>
                  {showPlanningOutput ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showPlanningOutput && (
                  <div className="px-3 pb-3 space-y-2">
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2 pt-1 pb-0.5">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Unit</span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Output / hr</span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold text-right">Daily (8 hrs)</span>
                    </div>
                    {/* One row per canonical unit */}
                    {CANONICAL_UNITS.map(unit => {
                      const val = standardOutputsMap[unit] || "";
                      const numVal = val ? parseFloat(val) : 0;
                      const daily = numVal > 0 ? (numVal * 8).toFixed(1) : "—";
                      return (
                        <div key={unit} className="grid grid-cols-[1fr_1.4fr_1fr] gap-2 items-center">
                          <Label className="text-sm font-semibold text-slate-600">{unit}</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            className="h-7 text-sm"
                            value={val}
                            onChange={e => setStandardOutputsMap(prev => ({ ...prev, [unit]: e.target.value }))}
                            placeholder="—"
                            data-testid={`input-std-output-${unit}`}
                          />
                          <span className={`text-xs text-right ${numVal > 0 ? "text-teal-600 font-medium" : "text-muted-foreground"}`}>
                            {daily}
                          </span>
                        </div>
                      );
                    })}
                    <div className="pt-1 border-t border-teal-100 mt-1">
                      <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">Efficiency (%) — applies to fallback theoretical output only</Label>
                      <Input
                        type="number" min="0" max="100" step="1"
                        placeholder="75"
                        value={outputEfficiency}
                        onChange={e => setOutputEfficiency(e.target.value)}
                        className="h-7 text-sm mt-1 w-24"
                        data-testid="input-output-efficiency"
                      />
                    </div>
                  </div>
                )}
              </div>

              <Button 
                onClick={handleSubmit}
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !name.trim()}
                data-testid="button-save-equipment"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingEquipment ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !equipment?.length ? (
          <p className="text-muted-foreground text-center py-6">No equipment added yet.</p>
        ) : !filteredEquipment.length && equipment?.length ? (
          <p className="text-muted-foreground text-center py-6">No equipment for the selected plant filter.</p>
        ) : (
          <div className="space-y-2">
            {filteredEquipment.map((equip) => {
              const isInactive = equip.isActive === 0;
              const equippedPlantName = (equip as any).plantName as string | null;
              return (
              <div key={equip.id} className={`flex items-center justify-between p-3 rounded-md ${isInactive ? "bg-muted/30 opacity-60" : "bg-muted/50"}`} data-testid={`row-equipment-${equip.id}`}>
                <div>
                  <p className="font-medium flex items-center gap-2 flex-wrap">
                    {equip.name}
                    {equippedPlantName ? (
                      <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" data-testid={`badge-plant-${equip.id}`}>{equippedPlantName}</span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">Shared</span>
                    )}
                    {isInactive && <Badge variant="outline" className="text-sm bg-gray-100 dark:bg-gray-800 text-gray-500">Inactive</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(equip as any).registrationNumber && <span className="font-medium">{(equip as any).registrationNumber} | </span>}
                    {(equip as any).ownership === "hired" ? (
                      <span className="text-orange-600 font-medium">Hired{(equip as any).vendorName ? ` - ${(equip as any).vendorName}` : ""} | </span>
                    ) : (
                      <span className="text-green-600 font-medium">Owned | </span>
                    )}
                    {equip.meterType === "hour_meter" ? "Hour Meter" : "Odometer"} | 
                    Norm: {equip.consumptionNorm} {equip.meterType === "hour_meter" ? "L/hr" : "L/km"}
                  </p>
                </div>
                {(canEdit || canDelete) && (
                  <div className="flex gap-1">
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleActiveMutation.mutate(equip.id)}
                          disabled={toggleActiveMutation.isPending}
                          title={isInactive ? "Activate" : "Deactivate"}
                          data-testid={`button-toggle-equipment-${equip.id}`}
                        >
                          <Power className={`w-4 h-4 ${isInactive ? "text-green-600" : "text-gray-400"}`} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(equip)} data-testid={`button-edit-equipment-${equip.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteEquipmentId(equip.id)}
                        title="Delete"
                        data-testid={`button-delete-equipment-${equip.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteEquipmentId !== null} onOpenChange={(open) => { if (!open) setDeleteEquipmentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Equipment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this equipment record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-equipment">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteEquipmentId !== null) deleteMutation.mutate(deleteEquipmentId); }}
              data-testid="button-confirm-delete-equipment"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function PersonnelMasterSection() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canEdit = sectionCan("master_personnel", "edit");
  const canCreate = sectionCan("master_personnel", "create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Personnel | null>(null);
  const [deletePersonId, setDeletePersonId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Engineer");
  const [phone, setPhone] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const { data: personnel, isLoading } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel", showInactive ? "all" : "active"],
    queryFn: async () => {
      const res = await fetch(`/api/personnel${showInactive ? "?includeInactive=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; role: string; phone?: string }) =>
      apiRequest("POST", "/api/personnel", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Personnel added" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_CREATE_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; role: string; phone?: string }) =>
      apiRequest("PATCH", `/api/personnel/${data.id}`, { name: data.name, role: data.role, phone: data.phone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Personnel updated" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/personnel/${id}/toggle-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
      toast({ title: "Status updated" });
    },
    onError: (error: any) => {
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/personnel/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
      setDeletePersonId(null);
      toast({ title: "Personnel deleted" });
    },
    onError: (error: any) => {
      setDeletePersonId(null);
      if (isForbiddenError(error)) {
        toast({ title: "Permission denied", description: NO_PERMISSION_DESCRIPTION, variant: "destructive" });
      } else if (error?.status === 409 || error?.message?.includes("409")) {
        toast({ title: "Cannot delete personnel", description: "This person has shift-log or DPR history. Use the Deactivate option instead to hide them from active lists.", variant: "destructive" });
      } else if (error?.status === 404 || error?.message?.includes("404") || error?.message?.toLowerCase().includes("not found")) {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
        toast({ title: "Not found", description: "This personnel record no longer exists.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const resetForm = () => {
    setName("");
    setRole("Engineer");
    setPhone("");
    setEditingPerson(null);
  };

  const openEdit = (person: Personnel) => {
    setEditingPerson(person);
    setName(person.name);
    setRole(person.role);
    setPhone(person.phone || "");
    setDialogOpen(true);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const data = { name: name.trim(), role, phone: phone.trim() || undefined };
    if (editingPerson) {
      updateMutation.mutate({ id: editingPerson.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Personnel Master
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-inactive-personnel"
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(checked === true)}
              data-testid="checkbox-show-inactive-personnel"
            />
            <Label htmlFor="show-inactive-personnel" className="text-sm cursor-pointer">Show Inactive</Label>
          </div>
          {canCreate && (
            <Button size="sm" onClick={openCreate} data-testid="button-add-personnel">
              <Plus className="w-4 h-4 mr-1" /> Add Personnel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : !personnel?.length ? (
          <p className="text-muted-foreground text-center py-8">No personnel added yet.</p>
        ) : (
          <div className="space-y-2">
            {personnel.map(person => (
              <div
                key={person.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${!person.isActive ? "opacity-50" : ""}`}
                data-testid={`personnel-row-${person.id}`}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium">{person.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {person.role}
                      {person.phone && ` · ${person.phone}`}
                    </div>
                  </div>
                  {!person.isActive && <Badge variant="outline" className="text-sm">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(person)} data-testid={`button-edit-personnel-${person.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleMutation.mutate(person.id)}
                        title={person.isActive ? "Deactivate" : "Activate"}
                        data-testid={`button-toggle-personnel-${person.id}`}
                      >
                        <Power className={`w-4 h-4 ${person.isActive ? "text-green-600" : "text-muted-foreground"}`} />
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletePersonId(person.id)}
                      title="Delete"
                      data-testid={`button-delete-personnel-${person.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={deletePersonId !== null} onOpenChange={(open) => { if (!open) setDeletePersonId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Personnel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this personnel record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-personnel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deletePersonId !== null) deleteMutation.mutate(deletePersonId); }}
              data-testid="button-confirm-delete-personnel"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingPerson ? "Edit Personnel" : "Add Personnel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder="Full name"
                className="uppercase"
                data-testid="input-personnel-name"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger data-testid="select-personnel-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSONNEL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value.toUpperCase())}
                placeholder="Phone number"
                className="uppercase"
                data-testid="input-personnel-phone"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
              data-testid="button-save-personnel"
            >
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
