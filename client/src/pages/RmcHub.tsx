import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, ChevronRight, Truck, FileText, Package,
  TestTube, FlaskConical, BarChart3,
} from "lucide-react";

export default function RmcHub() {
  const { sectionVisible } = useAuth();
  const [activeTab, setActiveTab] = useState("operations");

  const canProduction = sectionVisible("plant_production");
  const canMaterials = sectionVisible("plant_materials");
  const canReports = sectionVisible("plant_daily_reports");

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
