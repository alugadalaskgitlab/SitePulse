import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, Plus, Zap, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { GeneratorLog } from "@shared/schema";

export default function PlantGeneratorLogs() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generatorName, setGeneratorName] = useState("600 KVA");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hoursRun, setHoursRun] = useState("");
  const [openingDiesel, setOpeningDiesel] = useState("");
  const [dieselIssued, setDieselIssued] = useState("");
  const [closingDiesel, setClosingDiesel] = useState("");

  const { data: logs, isLoading } = useQuery<GeneratorLog[]>({
    queryKey: ["/api/plant-module/generator-logs"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/generator-logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/generator-logs"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Generator log recorded successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setGeneratorName("600 KVA");
    setStartTime("");
    setEndTime("");
    setHoursRun("");
    setOpeningDiesel("");
    setDieselIssued("");
    setClosingDiesel("");
  };

  const calculateHours = () => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const diffMins = endMins >= startMins ? endMins - startMins : (24 * 60 - startMins) + endMins;
      return (diffMins / 60).toFixed(1);
    }
    return "";
  };

  const handleSubmit = () => {
    if (!generatorName) return;
    const calculatedHours = hoursRun || calculateHours();
    createMutation.mutate({
      date,
      generatorName,
      startTime,
      endTime,
      hoursRun: calculatedHours ? parseFloat(calculatedHours) : null,
      openingDiesel: openingDiesel ? parseFloat(openingDiesel) : null,
      dieselIssued: dieselIssued ? parseFloat(dieselIssued) : null,
      closingDiesel: closingDiesel ? parseFloat(closingDiesel) : null,
    });
  };

  const calculatedHoursDisplay = calculateHours();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/plant">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Generator Diesel Tracking</h1>
            <p className="text-muted-foreground">Track generator diesel consumption (L/hr)</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-generator-log">
              <Plus className="w-4 h-4" /> New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Generator Log</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-gen-date" />
              </div>

              <div>
                <Label>Generator</Label>
                <Select value={generatorName} onValueChange={setGeneratorName}>
                  <SelectTrigger data-testid="select-generator">
                    <SelectValue placeholder="Select generator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="600 KVA">600 KVA Generator</SelectItem>
                    <SelectItem value="40-30 KVA">40-30 KVA Generator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="input-start-time" />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} data-testid="input-end-time" />
                </div>
              </div>

              {calculatedHoursDisplay && (
                <p className="text-sm text-muted-foreground">Calculated Hours: <strong>{calculatedHoursDisplay} hrs</strong></p>
              )}

              <div>
                <Label>Hours Run (override)</Label>
                <Input type="number" step="0.1" value={hoursRun} onChange={(e) => setHoursRun(e.target.value)} placeholder="Leave blank to auto-calculate" data-testid="input-hours-run" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Opening (L)</Label>
                  <Input type="number" step="0.1" value={openingDiesel} onChange={(e) => setOpeningDiesel(e.target.value)} placeholder="0" data-testid="input-opening-diesel" />
                </div>
                <div>
                  <Label>Issued (L)</Label>
                  <Input type="number" step="0.1" value={dieselIssued} onChange={(e) => setDieselIssued(e.target.value)} placeholder="0" data-testid="input-diesel-issued-gen" />
                </div>
                <div>
                  <Label>Closing (L)</Label>
                  <Input type="number" step="0.1" value={closingDiesel} onChange={(e) => setClosingDiesel(e.target.value)} placeholder="0" data-testid="input-closing-diesel" />
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || !generatorName} data-testid="button-save-gen-log">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Generator Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !logs?.length ? (
            <p className="text-muted-foreground text-center py-8">No generator logs recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{log.generatorName}</p>
                    <p className="text-sm text-muted-foreground">
                      {log.startTime} - {log.endTime} ({log.hoursRun?.toFixed(1)} hrs)
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs mt-1">
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        Opening: {log.openingDiesel || 0} L
                      </span>
                      <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                        Issued: {log.dieselIssued || 0} L
                      </span>
                      <span className="px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                        Consumed: {log.dieselConsumed?.toFixed(1) || 0} L
                      </span>
                      <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                        Closing: {log.closingDiesel || ((log.openingDiesel || 0) + (log.dieselIssued || 0) - (log.dieselConsumed || 0)).toFixed(1)} L
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{log.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{log.efficiency?.toFixed(2)} L/hr</p>
                    <p className="text-xs text-muted-foreground">Efficiency</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
