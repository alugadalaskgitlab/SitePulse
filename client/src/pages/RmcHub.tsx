import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, ChevronRight, Truck, FileText, Package,
  TestTube, FlaskConical, BarChart3, Layers, AlertTriangle,
} from "lucide-react";

type RmcSummary = {
  date: string;
  totalVolumeM3: number;
  totalBatches: number;
  byGrade: { grade: string; volumeM3: number; batchesCount: number }[];
};

export default function RmcHub() {
  const { sectionVisible } = useAuth();
  const [activeTab, setActiveTab] = useState("operations");

  const canProduction = sectionVisible("plant_production");
  const canMaterials = sectionVisible("plant_materials");
  const canReports = sectionVisible("plant_daily_reports");

  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: rmcSummary, isLoading: summaryLoading } = useQuery<RmcSummary>({
    queryKey: ["/api/rmc/today-summary", todayStr],
    queryFn: async () => {
      const params = new URLSearchParams({ date: todayStr });
      const r = await fetch(`/api/rmc/today-summary?${params}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: canProduction,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: cubeTestStats, isLoading: cubeStatsLoading } = useQuery<{ failCount: number }>({
    queryKey: ["/api/rmc/cube-tests/stats", thirtyDaysAgo],
    queryFn: () => apiRequest("GET", `/api/rmc/cube-tests/stats?dateFrom=${thirtyDaysAgo}`).then(r => r.json()),
    enabled: canProduction,
    staleTime: 5 * 60 * 1000,
  });

  const cubeFailCount = cubeTestStats?.failCount ?? 0;

  const operationsTiles = [
    canProduction && {
      href: "/plant/rmc/batch-records",
      icon: Truck,
      title: "Batch Records",
      desc: "Log concrete batches and generate delivery challans",
      color: "teal",
      testId: "tile-rmc-hub-batch-records",
    },
    canProduction && {
      href: "/plant/rmc/delivery-challans",
      icon: FileText,
      title: "Delivery Challans",
      desc: "View and print DCs generated from batch records",
      color: "teal",
      testId: "tile-rmc-hub-delivery-challans",
    },
    canMaterials && {
      href: "/plant/rmc/raw-materials",
      icon: Package,
      title: "Raw Material Receipts",
      desc: "Track incoming cement, aggregates & admixtures",
      color: "teal",
      testId: "tile-rmc-hub-raw-materials",
    },
    canProduction && {
      href: "/plant/rmc/cube-tests",
      icon: TestTube,
      title: "Cube Tests QC",
      desc: "Record and track concrete cube test results",
      color: "teal",
      testId: "tile-rmc-hub-cube-tests",
    },
    canProduction && {
      href: "/plant/rmc/mix-designs",
      icon: FlaskConical,
      title: "Mix Designs",
      desc: "Manage concrete mix design templates and grades",
      color: "teal",
      testId: "tile-rmc-hub-mix-designs",
    },
  ].filter(Boolean) as {
    href: string; icon: typeof Truck; title: string; desc: string;
    color: string; testId: string;
  }[];

  const reportsTiles = [
    canReports && {
      href: "/plant/rmc/daily-report",
      icon: BarChart3,
      title: "RMC Daily Report",
      desc: "Production summary with grade-wise breakdowns",
      color: "teal",
      testId: "tile-rmc-hub-daily-report",
    },
  ].filter(Boolean) as {
    href: string; icon: typeof Truck; title: string; desc: string;
    color: string; testId: string;
  }[];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/plant/dashboard">
          <Button variant="ghost" size="icon" data-testid="button-back-rmc-hub">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">RMC Module</h1>
          <p className="text-muted-foreground mt-1">Ready-mix concrete plant operations and quality control</p>
        </div>
      </div>

      {/* Today's Summary Cards */}
      {canProduction && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="section-rmc-summary">
          {/* Total Volume */}
          <Card className="border-teal-200 dark:border-teal-800" data-testid="card-rmc-total-volume">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <Layers className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Today's Volume</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" data-testid="skeleton-rmc-volume" />
                ) : (
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 leading-tight" data-testid="text-rmc-total-volume">
                    {(rmcSummary?.totalVolumeM3 ?? 0).toFixed(2)} m³
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Total Batches */}
          <Card className="border-teal-200 dark:border-teal-800" data-testid="card-rmc-total-batches">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <Truck className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Today's Batches</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-16 mt-1" data-testid="skeleton-rmc-batches" />
                ) : (
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 leading-tight" data-testid="text-rmc-total-batches">
                    {rmcSummary?.totalBatches ?? 0}
                  </p>
                )}
                {!summaryLoading && (rmcSummary?.byGrade?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid="text-rmc-grades">
                    {rmcSummary!.byGrade.map(g => g.grade).join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cube Test Failures */}
          <Card className="border-teal-200 dark:border-teal-800" data-testid="card-rmc-cube-failures">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <TestTube className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cube Failures (30d)</p>
                {cubeStatsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" data-testid="skeleton-rmc-cube-failures" />
                ) : (
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 leading-tight" data-testid="text-rmc-cube-fail-count">
                      {cubeFailCount}
                    </p>
                    {cubeFailCount > 0 && (
                      <Badge variant="destructive" className="gap-1 text-xs" data-testid="badge-rmc-cube-failures">
                        <AlertTriangle className="w-3 h-3" />
                        {cubeFailCount} {cubeFailCount === 1 ? "failure" : "failures"}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grade Breakdown */}
      {canProduction && !summaryLoading && (rmcSummary?.byGrade?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="section-rmc-grade-breakdown">
          <span className="text-xs text-muted-foreground self-center font-medium">Grade breakdown:</span>
          {rmcSummary!.byGrade.map((g) => (
            <Badge
              key={g.grade}
              variant="outline"
              className="border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 gap-1"
              data-testid={`badge-grade-${g.grade}`}
            >
              <span className="font-semibold">{g.grade}</span>
              <span className="text-muted-foreground">— {g.volumeM3.toFixed(1)} m³ / {g.batchesCount} batch{g.batchesCount !== 1 ? "es" : ""}</span>
            </Badge>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="operations" className="gap-2" data-testid="tab-rmc-operations">
            <Truck className="w-4 h-4" />
            <span className="hidden sm:inline">Operations</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2" data-testid="tab-rmc-reports">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-6">
          {operationsTiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No operations sections available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {operationsTiles.map((tile) => (
                <Link href={tile.href} key={tile.testId}>
                  <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid={tile.testId}>
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                        <tile.icon className="w-7 h-7 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{tile.title}</h3>
                        <p className="text-sm text-muted-foreground">{tile.desc}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          {reportsTiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No report sections available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reportsTiles.map((tile) => (
                <Link href={tile.href} key={tile.testId}>
                  <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid={tile.testId}>
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                        <tile.icon className="w-7 h-7 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{tile.title}</h3>
                        <p className="text-sm text-muted-foreground">{tile.desc}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
