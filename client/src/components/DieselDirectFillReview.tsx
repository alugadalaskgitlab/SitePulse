import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { DieselDirectFillView, DieselDirectFillChoice } from "@shared/schema";

export function directFillStatus(fills: DieselDirectFillView[] = []) {
  if (fills.some(fill => fill.conflicts.some(conflict => !conflict.choice))) return "Needs your choice";
  if (fills.some(fill => fill.conflicts.some(conflict => conflict.choice === "keep_usage"))) return "Issued through vehicle entry";
  return "Filled directly — received and issued";
}

export function DieselDirectFillReview({ fills = [], editable = false, fromUsage = false, onResolved }: {
  fills?: DieselDirectFillView[]; editable?: boolean; fromUsage?: boolean;
  onResolved?: (choice: DieselDirectFillChoice, usageId: number) => void;
}) {
  const client = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async ({ fill, conflict, choice }: { fill: DieselDirectFillView; conflict: DieselDirectFillView["conflicts"][number]; choice: DieselDirectFillChoice }) => {
      await apiRequest("POST", `/api/diesel-requirements/${fill.requirementId}/direct-fill-choice`, {
        itemId: fill.itemId, usageId: conflict.usageId, signature: conflict.signature, choice, fromUsage,
      });
    },
    onSuccess: (_data, variables) => {
      onResolved?.(variables.choice, variables.conflict.usageId);
      for (const key of ["/api/diesel-requirements", "/api/plant-module/equipment-usage", "/api/plant-module/equipment-usage/direct-fills", "/api/plant-module/stock-balances"]) {
        client.invalidateQueries({ queryKey: [key] });
      }
      toast({ title: "Diesel choice saved" });
    },
    onError: (error: Error) => toast({ title: "Diesel choice not saved", description: error.message, variant: "destructive" }),
  });
  return <div className="space-y-3">{fills.map(fill => <div className="rounded border p-3 space-y-2" key={fill.itemId}>
    <p>{fill.equipmentName}: Filled directly: {fill.appliedQuantity} L (diesel purchase #{fill.requirementId})</p>
    <p className="text-sm">{fill.date} · {fill.quantity} L purchased · {directFillStatus([fill])}</p>
    {fill.usageId != null && <p className="text-sm">Counted on vehicle entry #{fill.usageId}</p>}
    {fill.conflicts.filter(conflict => !conflict.choice).map(conflict => <div key={conflict.usageId} className="space-y-2">
      <p>This vehicle already has {conflict.quantity} L entered on {fill.date} ({conflict.source === "plant_stock" ? "store stock" : "Direct purchase"}). Is it the same diesel?</p>
      {editable && <div className="flex flex-wrap gap-2">
        {([
          ["keep_purchase", "Same diesel — keep the purchase fill"],
          ["keep_usage", "Same diesel — keep the usage entry"],
          ["different", "Different fills — keep both"],
        ] as const).map(([choice, label]) => <Button type="button" variant="outline" size="sm" disabled={mutation.isPending} key={choice} onClick={() => mutation.mutate({ fill, conflict, choice })}>{label}</Button>)}
      </div>}
    </div>)}
  </div>)}</div>;
}
