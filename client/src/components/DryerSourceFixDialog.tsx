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

export type SessionDetail = { id: number; startTime: string | null; dryerFedFrom: DryerSource };

export type DryerSourceFixTarget =
  | { mode: "shift-log"; recordId: number; date: string; suggestedValue: DryerSource; currentValue: DryerSource }
  | { mode: "heating-session"; sessionIds: number[]; sessionDetails?: SessionDetail[]; date: string; suggestedValue: DryerSource; currentValue: DryerSource };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DryerSourceFixTarget | null;
  onFixed?: () => void;
}

const LABEL: Record<DryerSource, string> = {
  TANK_1: "Boiler tank",
  TANK_2: "Dryer tank",
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
          sessionIds: target.sessionIds,
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
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/daily-reports-index"] });
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

  const recordLabel = target.mode === "shift-log"
    ? "shift log"
    : target.sessionIds.length === 1
    ? "heating session"
    : `${target.sessionIds.length} heating sessions`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fix dryer-source mismatch</DialogTitle>
          <DialogDescription>
            Update the {recordLabel} for <strong>{target.date}</strong> to the correct dryer source.
            {target.mode === "shift-log" && <> It currently says <strong>{LABEL[target.currentValue]}</strong>.</>}
            {target.mode === "heating-session" && target.sessionIds.length > 1 && (
            <>
              {" "}All {target.sessionIds.length} conflicting sessions will be updated at once.
              {target.sessionDetails && target.sessionDetails.length > 0 && (
                <ul
                  className="mt-2 max-h-40 overflow-y-auto divide-y divide-border rounded border border-border text-sm"
                  data-testid="list-conflicting-sessions"
                >
                  {target.sessionDetails.map((s) => (
                    <li key={s.id} className="flex items-center justify-between px-2 py-1 gap-2">
                      <span className="text-muted-foreground font-mono">
                        {s.startTime ? s.startTime.slice(0, 5) : "—"}
                      </span>
                      <span className="font-medium" data-testid={`text-session-dryer-${s.id}`}>
                        {LABEL[s.dryerFedFrom]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
            {target.mode === "heating-session" && target.sessionIds.length === 1 && <> It currently says <strong>{LABEL[target.currentValue]}</strong>.</>}
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
                <SelectItem value="TANK_1">Boiler tank</SelectItem>
                <SelectItem value="TANK_2">Dryer tank</SelectItem>
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
