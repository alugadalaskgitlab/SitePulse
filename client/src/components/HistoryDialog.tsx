import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, History } from "lucide-react";

type AuditLog = {
  id: number;
  module: string;
  transactionId: number;
  action: string;
  userId: number;
  userName: string;
  userRole: string;
  oldValues: unknown;
  newValues: unknown;
  reason: string | null;
  stockImpact: string | null;
  createdAt: string;
};

interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: string;
  transactionId: number | null;
  recordLabel?: string;
}

const ACTION_LABEL: Record<string, string> = {
  create: "Created",
  update: "Edited",
  delete: "Deleted",
  cancel: "Cancelled",
  approve: "Approved",
  reject: "Rejected",
  reopen: "Reopened",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "secondary",
  update: "outline",
  delete: "destructive",
  cancel: "destructive",
  approve: "default",
  reject: "destructive",
  reopen: "outline",
};

function valueFromAudit(values: unknown, field: string): unknown {
  if (!values || typeof values !== "object" || Array.isArray(values)) return undefined;
  return (values as Record<string, unknown>)[field];
}

function displayAuditValue(value: unknown): string {
  if (value == null || value === "") return "Blank";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export default function HistoryDialog({ open, onOpenChange, module, transactionId, recordLabel }: HistoryDialogProps) {
  const query = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", { module, transactionId }],
    queryFn: async () => {
      const res = await fetch(`/api/audit-logs?module=${encodeURIComponent(module)}&transactionId=${transactionId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: open && !!transactionId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </DialogTitle>
          <DialogDescription>
            {recordLabel ? `Audit trail for ${recordLabel}` : "Full audit trail for this record"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2" data-testid="list-audit-history">
          {query.isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading history...
            </div>
          )}
          {query.isError && (
            <p className="text-sm text-destructive py-4">Failed to load history.</p>
          )}
          {query.data && query.data.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No audit history recorded yet for this record.</p>
          )}
          {query.data?.map((entry) => {
            const oldMaterialSource = valueFromAudit(entry.oldValues, "materialSourceSupplier");
            const newMaterialSource = valueFromAudit(entry.newValues, "materialSourceSupplier");
            const hasMaterialSourceChange = oldMaterialSource !== undefined || newMaterialSource !== undefined;
            return (
              <div
                key={entry.id}
                className="rounded-md border border-border p-3 text-sm space-y-1"
                data-testid={`row-audit-${entry.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={ACTION_VARIANT[entry.action] ?? "outline"} data-testid={`badge-action-${entry.id}`}>
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  by <span className="font-medium text-foreground">{entry.userName}</span>{" "}
                  <span className="capitalize">({entry.userRole})</span>
                </p>
                {entry.reason && (
                  <p className="text-muted-foreground">
                    Reason: <span className="text-foreground">{entry.reason}</span>
                  </p>
                )}
                {hasMaterialSourceChange && (
                  <div className="mt-2 rounded bg-muted/50 px-2 py-1.5" data-testid={`audit-material-source-change-${entry.id}`}>
                    <p className="text-xs font-medium text-foreground">Material Source / Supplier</p>
                    <p className="text-xs text-muted-foreground">
                      Old: <span className="text-foreground">{displayAuditValue(oldMaterialSource)}</span>
                      {" → "}
                      New: <span className="text-foreground">{displayAuditValue(newMaterialSource)}</span>
                    </p>
                  </div>
                )}
                {entry.stockImpact && (
                  <p className="text-amber-600 dark:text-amber-500">
                    Stock impact: {entry.stockImpact}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
