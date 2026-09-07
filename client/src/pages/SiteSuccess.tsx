import { Link, useRoute } from "wouter";
import { CheckCircle, Plus, Home, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOrigin } from "@/hooks/use-origin";
import { DPR_REGISTER_PATH, resolveReturnTo, withReturnTo } from "@/lib/progressReportNav";

export default function SiteSuccess() {
  const [, params] = useRoute("/site/success/:id");
  const reportId = params?.id;
  const { appendOrigin } = useOrigin();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const backLink = resolveReturnTo(search, DPR_REGISTER_PATH);
  const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const newReportType = sp.get("type");
  // Forward returnTo into "Create New Report" so the next DPR also comes back here.
  const returnTo = sp.get("returnTo") ? backLink : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          
          <h1 className="text-2xl font-bold mb-2">Report Saved Successfully</h1>
          <p className="text-muted-foreground mb-2">
            Your site report has been submitted and saved.
          </p>
          {reportId && (
            <div className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full px-4 py-1.5 mb-6">
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">DPR Reference:</span>
              <span className="text-sm font-bold text-green-700 dark:text-green-300">#{reportId}</span>
            </div>
          )}
          
          <div className="flex flex-col gap-3">
            {reportId && (
              <Link href={withReturnTo(`/site/report/${reportId}`, backLink)}>
                <Button variant="outline" className="w-full gap-2" data-testid="button-view-report">
                  <Eye className="w-4 h-4" />
                  View Report
                </Button>
              </Link>
            )}
            <Link href={(() => {
              const base = `/site/new${newReportType ? `?type=${newReportType}` : ""}`;
              if (returnTo) return `${base}${newReportType ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
              return appendOrigin(base);
            })()}>
              <Button className="w-full gap-2" data-testid="button-create-new">
                <Plus className="w-4 h-4" />
                Create New Site Report
              </Button>
            </Link>
            <Link href={backLink}>
              <Button variant="ghost" className="w-full gap-2" data-testid="button-back-home">
                <Home className="w-4 h-4" />
                Back to DPR Register
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
