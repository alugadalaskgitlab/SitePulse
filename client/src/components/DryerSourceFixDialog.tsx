import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DryerSource = "TANK_1" | "TANK_2";

export type DryerSourceFixTarget =
  | { mode: "shift-log"; recordId: number; date: string; suggestedValue: DryerSource; currentValue: DryerSource }
  | { mode: "heating-session"; recordId: number; date: string; suggestedValue: DryerSource; currentValue: DryerSource };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DryerSourceFixTarget | null;
  onFixed?: () => void;
}

const LABEL: Record<DryerSource, string> = {
  TANK_1: "Tank 1",
  TANK_2: "Tank 2",
};

export default function DryerSourceFixDialog({ open, onOpenChange, target, onFixed }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<DryerSource | null>(null);

  const effectiveValue: DryerSource = selected ?? (target?.suggestedValue ?? "TANK_1");

  const mutation = useMutation({
    mutationFn: async (value: DryerSource) => {
      if (!target) throw new Error("No target");
      if (target.mode === "shift-log") {
        await apiRequest("PATCH", `/api/plant-module/shift-logs/${target.recordId}/dryer-source`, {
          dryerFedFrom: value,
        });
      } else {
        await apiRequest("PATCH", "/api/plant-module/heating-sessions/align-dryer-source", {
          sessionIds: [target.recordId],
          targetValue: value,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/daily-reports"] });
      toast({ title: "Dryer source corrected" });
      setSelected(null);
      onOpenChange(false);
      onFixed?.();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleOpenChange = (v: boolean) => {
    if (!v) setSelected(null);
    onOpenChange(v);
  };

  if (!target) return null;

  const recordLabel = target.mode === "shift-log" ? "shift log" : "heating session";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fix dryer-source mismatch</DialogTitle>
          <DialogDescription>
            Update the {recordLabel} for <strong>{target.date}</strong> to the correct dryer source.
            It currently says <strong>{LABEL[target.currentValue]}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="dryer-source-select">Dryer fed from</Label>
            <Select
              value={effectiveValue}
              onValueChange={(v) => setSelected(v as DryerSource)}
            >
              <SelectTrigger id="dryer-source-select" data-testid="select-dryer-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TANK_1">Tank 1</SelectItem>
                <SelectItem value="TANK_2">Tank 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel-dryer-fix"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate(effectiveValue)}
            disabled={mutation.isPending}
            data-testid="button-save-dryer-fix"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
