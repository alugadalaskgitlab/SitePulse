import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ChevronLeft, Plus, Droplets, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { LdoLog } from "@shared/schema";
import { DEFAULT_LDO_NORM } from "@shared/schema";

export default function PlantLdoLogs() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [openingStock, setOpeningStock] = useState("");
  const [ldoReceived, setLdoReceived] = useState("");
  const [ldoConsumed, setLdoConsumed] = useState("");
  const [closingStock, setClosingStock] = useState("");
  const [tonsProduced, setTonsProduced] = useState("");

  const { data: logs, isLoading } = useQuery<LdoLog[]>({
    queryKey: ["/api/plant-module/ldo-logs"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/ldo-logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-logs"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "LDO log recorded successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setOpeningStock("");
    setLdoReceived("");
    setLdoConsumed("");
    setClosingStock("");
    setTonsProduced("");
  };

  const handleSubmit = () => {
    createMutation.mutate({
      date,
      openingStock: openingStock ? parseFloat(openingStock) : null,
      ldoReceived: ldoReceived ? parseFloat(ldoReceived) : null,
      ldoConsumed: ldoConsumed ? parseFloat(ldoConsumed) : null,
      closingStock: closingStock ? parseFloat(closingStock) : null,
      tonsProduced: tonsProduced ? parseFloat(tonsProduced) : null,
    });
  };

  const expectedLdo = tonsProduced ? parseFloat(tonsProduced) * DEFAULT_LDO_NORM : 0;

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
            <h1 className="text-2xl font-bold">LDO Consumption Tracking</h1>
            <p className="text-muted-foreground">Track LDO usage vs production (L/ton)</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-ldo-log">
              <Plus className="w-4 h-4" /> New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record LDO Consumption</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-ldo-date" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening Stock (L)</Label>
                  <Input type="number" step="0.1" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" data-testid="input-ldo-opening" />
                </div>
                <div>
                  <Label>LDO Received (L)</Label>
                  <Input type="number" step="0.1" value={ldoReceived} onChange={(e) => setLdoReceived(e.target.value)} placeholder="0" data-testid="input-ldo-received" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>LDO Consumed (L)</Label>
                  <Input type="number" step="0.1" value={ldoConsumed} onChange={(e) => setLdoConsumed(e.target.value)} placeholder="0" data-testid="input-ldo-consumed" />
                </div>
                <div>
                  <Label>Closing Stock (L)</Label>
                  <Input type="number" step="0.1" value={closingStock} onChange={(e) => setClosingStock(e.target.value)} placeholder="0" data-testid="input-ldo-closing" />
                </div>
              </div>

              <div>
                <Label>Tons Produced (MT)</Label>
                <Input type="number" step="0.1" value={tonsProduced} onChange={(e) => setTonsProduced(e.target.value)} placeholder="Total production for the day" data-testid="input-tons-produced" />
              </div>

              {tonsProduced && (
                <div className="p-3 bg-muted rounded-md text-sm">
                  <p>Expected LDO (@ {DEFAULT_LDO_NORM} L/ton): <strong>{expectedLdo.toFixed(1)} L</strong></p>
                  {ldoConsumed && (
                    <p>Variance: <strong className={parseFloat(ldoConsumed) > expectedLdo ? "text-destructive" : "text-green-600"}>
                      {(expectedLdo - parseFloat(ldoConsumed)).toFixed(1)} L
                    </strong></p>
                  )}
                </div>
              )}

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending} data-testid="button-save-ldo-log">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5" />
            LDO Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !logs?.length ? (
            <p className="text-muted-foreground text-center py-8">No LDO logs recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const variance = log.variance || 0;
                const isExcess = variance < 0;
                return (
                  <div key={log.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{log.date}</p>
                      <p className="text-sm text-muted-foreground">
                        Production: {log.tonsProduced?.toFixed(1)} MT | Consumed: {log.ldoConsumed?.toFixed(1)} L
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Opening: {log.openingStock} L + Received: {log.ldoReceived} L | Closing: {log.closingStock} L
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expected: {log.expectedLdo?.toFixed(1)} L (@ {DEFAULT_LDO_NORM} L/ton)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">{log.efficiency?.toFixed(2)} L/ton</p>
                      <Badge variant={isExcess ? "destructive" : "secondary"} className="gap-1 mt-1">
                        {isExcess ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(variance).toFixed(1)} L {isExcess ? "excess" : "saved"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
