import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const OUTCOMES = [
  ["active_arranged", "Active / Arranged"],
  ["executed", "Executed"],
  ["partially_executed", "Partially Executed"],
  ["not_executed", "Not Executed"],
  ["cancelled", "Cancelled"],
  ["suspended", "Suspended"],
  ["early_closed", "Early Closed"],
  ["rescheduled", "Rescheduled"],
] as const;

const REASONS = [
  "rain", "site_not_ready", "client_instruction", "equipment_breakdown",
  "vendor_unavailable", "material_unavailable", "work_completed_early",
  "change_in_programme", "other",
] as const;

type OutcomeEvent = {
  id: number;
  eventDate: string;
  outcome: string;
  reason?: string | null;
  reasonOther?: string | null;
  rescheduledDate?: string | null;
  actualQuantity?: number | null;
  actualUom?: string | null;
};

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const statusTone = (value: string) => {
  if (value === "executed") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (value === "partially_executed") return "bg-amber-100 text-amber-800 border-amber-300";
  if (value === "cancelled" || value === "not_executed") return "bg-rose-100 text-rose-800 border-rose-300";
  if (value === "suspended") return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** PM/Admin/Owner arrangement-status writer. Every save appends one bar event. */
export function ArrangementOutcomeControl({
  projectId, programmeBarId, defaultUom,
}: {
  projectId: number;
  programmeBarId: number;
  defaultUom?: string | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["/api/dpr/programme-bar-outcomes", projectId, programmeBarId];
  const [outcome, setOutcome] = useState("active_arranged");
  const [eventDate, setEventDate] = useState(today);
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  const [rescheduledDate, setRescheduledDate] = useState("");
  const [actualQuantity, setActualQuantity] = useState("");
  const [actualUom, setActualUom] = useState(defaultUom ?? "");
  const [overrideAcceptedQty, setOverrideAcceptedQty] = useState(false);
  const [remarks, setRemarks] = useState("");
  const requiresReason = outcome !== "active_arranged" && outcome !== "executed";
  const needsAcceptedQty = overrideAcceptedQty;

  const { data } = useQuery<{ latestOutcome: OutcomeEvent | null; outcomeHistory: OutcomeEvent[] }>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/dpr/programme-bar-outcomes?projectId=${projectId}&programmeBarId=${programmeBarId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load arrangement status history");
      return response.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (requiresReason && !reason) throw new Error("Select a reason.");
      if (reason === "other" && !reasonOther.trim()) throw new Error("Enter the other reason.");
      if (outcome === "rescheduled" && !rescheduledDate) throw new Error("Select the rescheduled date.");
      if (needsAcceptedQty && (actualQuantity === "" || !Number.isFinite(Number(actualQuantity)) || Number(actualQuantity) < 0 || !actualUom.trim())) {
        throw new Error("Accepted quantity and UOM are required when Override is used.");
      }
      if (needsAcceptedQty && !reason) {
        throw new Error("Select a reason when an accepted quantity override is used.");
      }
      const response = await fetch("/api/dpr/programme-bar-outcomes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programmeBarId, eventDate, outcome,
          reason: (requiresReason || needsAcceptedQty) ? reason : null,
          reasonOther: (requiresReason || needsAcceptedQty) && reason === "other" ? reasonOther.trim() : null,
          rescheduledDate: outcome === "rescheduled" ? rescheduledDate : null,
          actualQuantity: needsAcceptedQty ? Number(actualQuantity) : null,
          actualUom: needsAcceptedQty ? actualUom.trim() : null,
          remarks: remarks.trim() || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? `Could not record status (${response.status})`);
      return body;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["/api/dpr/programme-bars", projectId] }),
      ]);
      setReason(""); setReasonOther(""); setRescheduledDate(""); setActualQuantity(""); setRemarks("");
      setOverrideAcceptedQty(false);
      toast({ title: "Arrangement status recorded", description: "The immutable history has been preserved." });
    },
    onError: (error: Error) => toast({ title: "Could not record arrangement status", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3 space-y-2" data-testid={`arrangement-status-control-${programmeBarId}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-teal-900">Status control</p>
        <span className="text-[11px] text-teal-800">Current:{" "}
          <span className={`inline-flex rounded border px-1.5 py-0.5 font-semibold ${statusTone(data?.latestOutcome?.outcome ?? "active_arranged")}`}>
            {label(data?.latestOutcome?.outcome ?? "active_arranged")}
          </span>
          <span className="ml-1">{data?.latestOutcome ? `· ${data.latestOutcome.eventDate}` : ""}</span>
        </span>
      </div>
      <p className="text-[11px] text-teal-800/80">DPR execution remains the source of truth. Use an accepted quantity only to document an explicit management override.</p>
      <div className="grid grid-cols-2 gap-2">
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger data-testid={`select-arrangement-status-${programmeBarId}`}><SelectValue /></SelectTrigger>
          <SelectContent>{OUTCOMES.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" aria-label="Status date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
        {(requiresReason || needsAcceptedQty) && (
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger data-testid={`select-arrangement-reason-${programmeBarId}`}><SelectValue placeholder={needsAcceptedQty ? "Override reason *" : "Reason *"} /></SelectTrigger>
            <SelectContent>{REASONS.map(value => <SelectItem key={value} value={value}>{label(value)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {reason === "other" && <Input value={reasonOther} onChange={e => setReasonOther(e.target.value)} placeholder="Other reason *" />}
        {outcome === "rescheduled" && <Input type="date" aria-label="Rescheduled date" value={rescheduledDate} onChange={e => setRescheduledDate(e.target.value)} />}
        {needsAcceptedQty && (<>
          <Input type="number" min="0" value={actualQuantity} onChange={e => setActualQuantity(e.target.value)} placeholder="Accepted qty *" data-testid={`input-accepted-qty-${programmeBarId}`} />
          <Input value={actualUom} onChange={e => setActualUom(e.target.value)} placeholder="Accepted UOM *" data-testid={`input-accepted-uom-${programmeBarId}`} />
        </>)}
        <button type="button" className={`col-span-2 inline-flex h-7 items-center justify-center rounded border text-[11px] font-medium transition-colors ${needsAcceptedQty ? "border-amber-400 bg-amber-100 text-amber-900" : "border-teal-200 bg-white/70 text-teal-800 hover:bg-white"}`} onClick={() => setOverrideAcceptedQty(v => !v)} data-testid={`button-toggle-accepted-qty-${programmeBarId}`}>
          {needsAcceptedQty ? "Override enabled · remove accepted quantity" : "Override / accepted quantity"}
        </button>
        <Textarea className="col-span-2 min-h-16" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Remarks (optional)" />
        <Button className="col-span-2" disabled={mutation.isPending || !eventDate} onClick={() => mutation.mutate()} data-testid={`button-record-arrangement-status-${programmeBarId}`}>
          {mutation.isPending ? "Recording…" : "Record status change"}
        </Button>
      </div>
      {!!data?.outcomeHistory.length && (
        <details className="text-[11px]" data-testid={`arrangement-status-history-${programmeBarId}`}>
          <summary className="cursor-pointer font-medium">Immutable history ({data.outcomeHistory.length})</summary>
          {data.outcomeHistory.map(event => (
            <div key={event.id}>{event.eventDate}: {label(event.outcome)}{event.reason ? ` — ${label(event.reason)}` : ""}{event.reasonOther ? ` (${event.reasonOther})` : ""}{event.actualQuantity != null ? ` · status-event override ${event.actualQuantity} ${event.actualUom ?? ""} (not payable)` : ""}</div>
          ))}
        </details>
      )}
    </div>
  );
}