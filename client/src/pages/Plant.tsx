import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { ChevronLeft, Plus, Factory, ChevronRight, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface PlantReport {
  id: number;
  date: string;
  siteName: string;
  createdAt: string;
}

export default function Plant() {
  const { data: reports, isLoading } = useQuery<PlantReport[]>({
    queryKey: ['/api/plant'],
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Plant Module</h1>
            <p className="text-muted-foreground mt-1">Manage plant production and material logs</p>
          </div>
        </div>
        <Link href="/plant/new">
          <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25" data-testid="button-new-plant-report">
            <Plus className="w-4 h-4" /> New Plant Report
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Plant Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{reports?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Plants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {reports ? new Set(reports.map(r => r.siteName)).size : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reports List */}
      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            Plant Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !reports?.length ? (
            <div className="p-12 text-center">
              <Factory className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No plant reports yet.</p>
              <p className="text-sm text-muted-foreground/70">Create your first plant report to get started.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link href={`/plant/${report.id}`}>
                    <div className="flex items-center justify-between p-4 hover-elevate cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-semibold">
                          <Factory className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{report.siteName}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(report.date), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
