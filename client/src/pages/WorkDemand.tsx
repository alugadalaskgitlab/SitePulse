import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ChevronRight, FileSpreadsheet, BookOpen, Loader2,
  Package, Wrench, Users, CalendarDays,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateBomDemand,
  monthLabel,
  fmtQty,
  type BomDemand,
  type BomInputItem,
  type BomInputBar,
} from "@shared/planningEngine";
import type { BoqProject } from "@shared/schema";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-teal-600" />
      <h2 className="text-sm font-bold text-slate-700">{title}</h2>
      {badge != null && (
        <Badge variant="outline" className="text-[10px] text-teal-700 border-teal-200 bg-teal-50">
          {badge} items
        </Badge>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}

// ─── Materials Demand Table ─────────────────────────────────────────────────────

function MaterialsTable({
  demand,
  project,
}: {
  demand: BomDemand;
  project: BoqProject;
}) {
  const mats = demand.materials;
  if (!mats.length) return <EmptyState label="No material demand calculated. Configure material recipes on BOQ items first." />;

  const totalMonths = project.totalMonths ?? 12;
  const allMonths = useMemo(() => {
    const ms = new Set<number>();
    for (const row of mats) for (const m of Object.keys(row.monthlyQty)) ms.add(Number(m));
    return [...ms].sort((a, b) => a - b);
  }, [mats]);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="text-xs border-collapse" style={{ minWidth: 260 + allMonths.length * 72 + 100 }}>
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-10 min-w-[200px]" style={{ background: "#0F5F64" }}>Material</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[70px]">Unit</th>
            {allMonths.map((m) => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[72px]">
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[90px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {mats.map((row) => (
            <tr key={row.materialName} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white z-10">{row.materialName}</td>
              <td className="px-2 py-2 text-right text-muted-foreground">{row.uom}</td>
              {allMonths.map((m) => {
                const val = row.monthlyQty[m] ?? 0;
                return (
                  <td
                    key={m}
                    className={`px-2 py-2 text-right font-mono ${val > 0 ? "text-teal-700 font-semibold bg-teal-50/50" : "text-slate-300"}`}
                  >
                    {val > 0 ? fmtQty(val, 1) : "—"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-semibold font-mono text-teal-800">
                {fmtQty(row.totalQty, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Equipment Demand Table ─────────────────────────────────────────────────────

function EquipmentTable({
  demand,
  project,
}: {
  demand: BomDemand;
  project: BoqProject;
}) {
  const equip = demand.equipment;
  if (!equip.length) return <EmptyState label="No equipment demand. Configure equipment recipes on BOQ items first." />;

  const allMonths = useMemo(() => {
    const ms = new Set<number>();
    for (const row of equip) for (const m of Object.keys(row.monthlyHours)) ms.add(Number(m));
    return [...ms].sort((a, b) => a - b);
  }, [equip]);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="text-xs border-collapse" style={{ minWidth: 260 + allMonths.length * 72 + 100 }}>
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-10 min-w-[200px]" style={{ background: "#0F5F64" }}>Equipment</th>
            <th className="px-2 py-2 font-semibold text-white text-right min-w-[50px]">Count</th>
            {allMonths.map((m) => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[72px]">
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[100px]">Total (hrs)</th>
          </tr>
        </thead>
        <tbody>
          {equip.map((row) => (
            <tr key={row.equipmentName} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white z-10">
                {row.equipmentName}
                {row.count > 1 && (
                  <span className="ml-1 text-[10px] text-teal-600 font-mono">×{row.count}</span>
                )}
              </td>
              <td className="px-2 py-2 text-right text-muted-foreground">{row.count}</td>
              {allMonths.map((m) => {
                const val = row.monthlyHours[m] ?? 0;
                return (
                  <td
                    key={m}
                    className={`px-2 py-2 text-right font-mono ${val > 0 ? "text-blue-700 font-semibold bg-blue-50/50" : "text-slate-300"}`}
                  >
                    {val > 0 ? fmtQty(val, 1) : "—"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-semibold font-mono text-blue-800">
                {fmtQty(row.totalHours, 1)} hrs
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Labour Demand Table ────────────────────────────────────────────────────────

function LabourTable({
  demand,
  project,
}: {
  demand: BomDemand;
  project: BoqProject;
}) {
  const lab = demand.labour;
  if (!lab.length) return <EmptyState label="No labour demand. Configure labour recipes on BOQ items first." />;

  const allMonths = useMemo(() => {
    const ms = new Set<number>();
    for (const row of lab) for (const m of Object.keys(row.monthlyDays)) ms.add(Number(m));
    return [...ms].sort((a, b) => a - b);
  }, [lab]);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="text-xs border-collapse" style={{ minWidth: 260 + allMonths.length * 72 + 100 }}>
        <thead>
          <tr style={{ background: "#0F5F64" }}>
            <th className="text-left px-3 py-2 font-semibold text-white sticky left-0 z-10 min-w-[200px]" style={{ background: "#0F5F64" }}>Labour Category</th>
            {allMonths.map((m) => (
              <th key={m} className="px-2 py-2 font-semibold text-white text-right whitespace-nowrap min-w-[72px]">
                {monthLabel(m, project.startDate)}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-white text-right min-w-[100px]">Total (days)</th>
          </tr>
        </thead>
        <tbody>
          {lab.map((row) => (
            <tr key={row.designation} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white z-10">{row.designation}</td>
              {allMonths.map((m) => {
                const val = row.monthlyDays[m] ?? 0;
                return (
                  <td
                    key={m}
                    className={`px-2 py-2 text-right font-mono ${val > 0 ? "text-purple-700 font-semibold bg-purple-50/50" : "text-slate-300"}`}
                  >
                    {val > 0 ? fmtQty(val, 1) : "—"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-semibold font-mono text-purple-800">
                {fmtQty(row.totalDays, 1)} days
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkDemand() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const [activeTab, setActiveTab] = useState("materials");

  const { data: project } = useQuery<BoqProject>({
    queryKey: ["/api/boq/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const { data: bomData, isLoading } = useQuery<{ items: BomInputItem[]; bars: BomInputBar[]; roadLengthKm: number }>({
    queryKey: ["/api/boq/projects", projectId, "bom"],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${projectId}/bom`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch BOM data");
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const demand = useMemo((): BomDemand | null => {
    if (!bomData || !project) return null;
    const { items, bars } = bomData;
    if (!items.length || !bars.length) return null;
    return calculateBomDemand(items, bars, project.totalMonths ?? 12);
  }, [bomData, project]);

  return (
    <div className="space-y-4">
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
          <a className="hover:text-slate-700 transition-colors truncate max-w-[160px]">
            {project?.name ?? "…"}
          </a>
        </Link>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <Link href={`/work-program/${projectId}/programme`}>
          <a className="hover:text-slate-700 transition-colors flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            Work Programme
          </a>
        </Link>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <span className="text-slate-700 font-medium flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          BOM &amp; Demand
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">BOM &amp; Resource Demand</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project?.name}
            {project?.roadLengthKm ? ` · ${project.roadLengthKm} km` : ""}
            {project?.totalMonths ? ` · ${project.totalMonths} months` : ""}
          </p>
        </div>
        <Link href={`/work-program/${projectId}/programme`}>
          <a>
            <Button variant="outline" size="sm" data-testid="button-back-programme">
              ← Work Programme
            </Button>
          </a>
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Computing demand…
        </div>
      )}

      {!isLoading && !demand && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground space-y-2">
            <BookOpen className="w-10 h-10 text-slate-200 mx-auto" />
            <p className="text-sm font-medium">No data to compute BOM</p>
            <p className="text-xs">
              {!bomData?.bars?.length
                ? "Add stretches to the Work Programme first."
                : "Configure equipment, labour, and material recipes on BOQ items to see demand."}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && demand && project && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-teal-100 bg-teal-50/30">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Package className="w-5 h-5 text-teal-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Materials</p>
                  <p className="text-lg font-bold text-teal-800">{demand.materials.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-100 bg-blue-50/30">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Wrench className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Equipment types</p>
                  <p className="text-lg font-bold text-blue-800">{demand.equipment.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-purple-100 bg-purple-50/30">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Users className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Labour categories</p>
                  <p className="text-lg font-bold text-purple-800">{demand.labour.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="materials" className="flex items-center gap-1.5" data-testid="tab-materials">
                <Package className="w-3.5 h-3.5" /> Materials
                {demand.materials.length > 0 && (
                  <span className="ml-1 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold px-1.5 py-0.5">
                    {demand.materials.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="equipment" className="flex items-center gap-1.5" data-testid="tab-equipment">
                <Wrench className="w-3.5 h-3.5" /> Equipment
                {demand.equipment.length > 0 && (
                  <span className="ml-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5">
                    {demand.equipment.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="labour" className="flex items-center gap-1.5" data-testid="tab-labour">
                <Users className="w-3.5 h-3.5" /> Labour
                {demand.labour.length > 0 && (
                  <span className="ml-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5">
                    {demand.labour.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="materials" className="mt-3">
              <SectionHeader icon={Package} title="Material Demand by Month" badge={demand.materials.length} />
              <MaterialsTable demand={demand} project={project} />
            </TabsContent>

            <TabsContent value="equipment" className="mt-3">
              <SectionHeader icon={Wrench} title="Equipment Hours by Month" badge={demand.equipment.length} />
              <EquipmentTable demand={demand} project={project} />
            </TabsContent>

            <TabsContent value="labour" className="mt-3">
              <SectionHeader icon={Users} title="Labour Days by Month" badge={demand.labour.length} />
              <LabourTable demand={demand} project={project} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
