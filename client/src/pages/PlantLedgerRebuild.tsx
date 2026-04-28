import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, RotateCcw, Loader2, ShieldAlert, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import type { MixTemplate } from "@shared/schema";

type RebuildResult = {
  fromDateTime: string;
  dispatches: number;
  ledgerRowsDeleted: number;
  ledgerRowsCreated: number;
  errors: string[];
};

export default function PlantLedgerRebuild() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const { isAdmin } = useAuth();
  const backLink = getPlantBackLink({ defaultTab: "stock" });

  const [templateId, setTemplateId] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [result, setResult] = useState<RebuildResult | null>(null);

  const { data: templates } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const rebuildMutation = useMutation({
    mutationFn: async ({ tid, fromDateTime }: { tid: number; fromDateTime: string }) => {
      const res = await apiRequest("POST", `/api/plant-module/mix-templates/${tid}/rebuild-ledger`, { fromDateTime });
      return res.json() as Promise<RebuildResult>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error: any) => {
      toast({ title: "Rebuild failed", description: error.message, variant: "destructive" });
    },
  });

  const handleRebuild = () => {
    if (!templateId || !fromDate) return;
    const fromDateTime = `${fromDate}T${fromTime || "00:00"}`;
    rebuildMutation.mutate({ tid: Number(templateId), fromDateTime });
  };

  const handleReset = () => {
    setResult(null);
    setTemplateId("");
    setFromDate("");
    setFromTime("00:00");
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center p-8">
        <ShieldAlert className="w-12 h-12 text-destructive" />
        <div>
          <h2 className="text-xl font-semibold">Admin Access Required</h2>
          <p className="text-muted-foreground mt-1">Only administrators can use this tool.</p>
        </div>
        <Link href={backLink}>
          <Button variant="outline" data-testid="button-back-no-access">Back to Stock</Button>
        </Link>
      </div>
    );
  }

  const selectedTemplate = templates?.find(t => t.id === Number(templateId));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-amber-600" />
            Rebuild Dispatch Ledger
          </h1>
          <p className="text-muted-foreground">Rewrite aggregate stock ledger entries for a mix template from a date and time cutoff</p>
        </div>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Rebuild Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 space-y-2">
              <p className="font-semibold text-green-800 dark:text-green-300">
                {selectedTemplate?.name || `Template #${templateId}`}
              </p>
              <p className="text-sm text-muted-foreground">
                Cutoff: {result.fromDateTime.replace("T", " at ")}
              </p>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <div className="text-center p-3 rounded bg-background border">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{result.dispatches}</p>
                  <p className="text-xs text-muted-foreground mt-1">Dispatches<br/>processed</p>
                </div>
                <div className="text-center p-3 rounded bg-background border">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{result.ledgerRowsDeleted}</p>
                  <p className="text-xs text-muted-foreground mt-1">Rows<br/>deleted</p>
                </div>
                <div className="text-center p-3 rounded bg-background border">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{result.ledgerRowsCreated}</p>
                  <p className="text-xs text-muted-foreground mt-1">Rows<br/>created</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-3 p-3 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {result.errors.length} warning{result.errors.length !== 1 ? "s" : ""}
                  </p>
                  <ul className="text-xs text-amber-600 dark:text-amber-500 list-disc list-inside mt-1 space-y-0.5">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} data-testid="button-rebuild-again">
                Rebuild Another
              </Button>
              <Link href={backLink}>
                <Button variant="default" data-testid="button-go-to-stock">
                  View Stock Ledger
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Configure Rebuild</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300 flex gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Before proceeding:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>This deletes existing aggregate ledger rows for the selected template's dispatches at or after the cutoff.</li>
                  <li>New rows are created using the <strong>current</strong> component proportions.</li>
                  <li>Bitumen and LDO ledger entries are <strong>not</strong> affected.</li>
                  <li>Stock balances are automatically recomputed after the rebuild.</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="template-select">Mix Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="template-select" data-testid="select-rebuild-template">
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} — {t.mixType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="from-date">Cutoff Date</Label>
                  <Input
                    id="from-date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    data-testid="input-rebuild-from-date"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Dispatches on or after this date will be rebuilt</p>
                </div>
                <div>
                  <Label htmlFor="from-time">Cutoff Time</Label>
                  <Input
                    id="from-time"
                    type="time"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    data-testid="input-rebuild-from-time"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Only dispatches at or after this time on the cutoff date</p>
                </div>
              </div>

              {templateId && fromDate && (
                <div className="rounded-md bg-muted/50 border p-3 text-sm">
                  <p className="font-medium">{selectedTemplate?.name}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Will rebuild all dispatches from <strong>{fromDate}</strong> at <strong>{fromTime}</strong> onward.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Link href={backLink}>
                <Button variant="outline" data-testid="button-cancel">Cancel</Button>
              </Link>
              <Button
                className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleRebuild}
                disabled={!templateId || !fromDate || rebuildMutation.isPending}
                data-testid="button-rebuild-submit"
              >
                {rebuildMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Rebuild Ledger
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
