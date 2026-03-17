import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Trash2, ExternalLink, Calculator, Calendar, Users } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MixEstimate } from "@shared/schema";

function fmt(v: number | null | undefined) {
  if (!v) return "—";
  return "₹" + Math.round(v).toLocaleString("en-IN");
}

export default function MixEstimates() {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState<number | null>(null);

  const { data: estimates = [], isLoading } = useQuery<MixEstimate[]>({
    queryKey: ["/api/mix-estimates"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/mix-estimates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mix-estimates"] });
      toast({ title: "Estimate deleted" });
      setDeleting(null);
    },
    onError: () => {
      toast({ title: "Failed to delete estimate", variant: "destructive" });
      setDeleting(null);
    },
  });

  function handleDelete(est: MixEstimate) {
    if (!confirm(`Delete estimate "${est.name}"?`)) return;
    setDeleting(est.id);
    deleteMutation.mutate(est.id);
  }

  function openInCalculator(est: MixEstimate) {
    try {
      const state = JSON.parse(est.state);
      localStorage.setItem("hlc_mix_calc_v3", JSON.stringify(state));
      localStorage.setItem("hlc_mix_calc_v3_estId", String(est.id));
      localStorage.setItem("hlc_mix_calc_v3_estName", est.name);
    } catch {
      toast({ title: "Invalid estimate data", variant: "destructive" });
      return;
    }
    window.location.href = "/mix-calculator";
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/reports">
          <Button variant="ghost" size="sm" data-testid="btn-back">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" />
            Saved Mix Estimates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bituminous mix rate estimates saved from the calculator
          </p>
        </div>
        <a href="/mix-calculator" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" data-testid="btn-open-calculator">
            <ExternalLink className="w-4 h-4 mr-1" /> Open Calculator
          </Button>
        </a>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading estimates...</div>
      ) : estimates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calculator className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No saved estimates yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use the Mix Rate Calculator and click 💾 Save to store estimates here.
            </p>
            <a href="/mix-calculator" className="mt-4 inline-block">
              <Button variant="default" className="mt-4" data-testid="btn-go-calculator">Open Calculator</Button>
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => {
            const updatedAt = est.updatedAt
              ? new Date(est.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : "";
            return (
              <Card key={est.id} className="border-l-4 border-l-primary" data-testid={`card-estimate-${est.id}`}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base text-foreground">{est.name}</h3>
                        {est.totalMt && est.totalMt > 0 ? (
                          <Badge variant="outline" className="text-xs">
                            {est.totalMt.toFixed(0)} MT
                          </Badge>
                        ) : null}
                        {est.totalAmt && est.totalAmt > 0 ? (
                          <Badge className="text-xs bg-green-600 text-white border-green-700">
                            {fmt(est.totalAmt)}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                        {est.contractorList && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {est.contractorList}
                          </span>
                        )}
                        {updatedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Saved {updatedAt}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openInCalculator(est)}
                        data-testid={`btn-load-estimate-${est.id}`}
                      >
                        Load in Calculator
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(est)}
                        disabled={deleting === est.id}
                        data-testid={`btn-delete-estimate-${est.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
