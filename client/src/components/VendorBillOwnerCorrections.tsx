import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type SiteOption = { id: number; name: string };

type VendorBillOwnerCorrectionsProps = {
  bill: {
    id: number;
    amountPaid?: number | string | null;
    billType?: string | null;
    isCancelled?: boolean | null;
    netPayableAmount?: number | string | null;
    siteId?: number | null;
    siteScopeConfirmed?: boolean | null;
    status?: string | null;
    totalAmount?: number | string | null;
  };
  sites: SiteOption[];
  isOwner: boolean;
};

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

export function VendorBillOwnerCorrections({ bill, sites, isOwner }: VendorBillOwnerCorrectionsProps) {
  const { toast } = useToast();
  const [activeCorrection, setActiveCorrection] = useState<"amount" | "site" | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [amountReason, setAmountReason] = useState("");
  const [siteChoice, setSiteChoice] = useState("");
  const [siteReason, setSiteReason] = useState("");

  const invalidateBillViews = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
    queryClient.invalidateQueries({ queryKey: [`/api/vendor-bills/${bill.id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/attention"] });
  };

  const amountMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/vendor-bills/${bill.id}/owner-correction/paid-amount`, {
      amountPaid: Number(amountDraft),
      reason: amountReason.trim(),
    }),
    onSuccess: () => {
      invalidateBillViews();
      setActiveCorrection(null);
      toast({ title: "Recorded paid amount corrected" });
    },
    onError: (error: Error) => toast({
      title: "Could not correct recorded paid amount",
      description: error.message,
      variant: "destructive",
    }),
  });

  const siteMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/vendor-bills/${bill.id}/owner-correction/site`, {
      siteId: siteChoice === "all" ? null : Number(siteChoice),
      reason: siteReason.trim(),
    }),
    onSuccess: () => {
      invalidateBillViews();
      setActiveCorrection(null);
      toast({ title: "Recorded site answer corrected" });
    },
    onError: (error: Error) => toast({
      title: "Could not correct recorded site answer",
      description: error.message,
      variant: "destructive",
    }),
  });

  if (!isOwner || bill.isCancelled === true) return null;

  const recordedAmount = bill.amountPaid != null && bill.amountPaid !== "" && Number.isFinite(Number(bill.amountPaid))
    ? Number(bill.amountPaid)
    : null;
  const netPayable = Number(bill.netPayableAmount ?? bill.totalAmount ?? 0);
  const amountValue = Number(amountDraft);
  const amountCanSave = amountDraft !== "" && Number.isFinite(amountValue) && amountValue >= 0 &&
    Number.isFinite(netPayable) && amountValue <= netPayable && amountReason.trim().length > 0;
  const currentSite = bill.siteId == null
    ? bill.siteScopeConfirmed === true ? "ALL SITES" : "No site answer recorded"
    : sites.find(site => site.id === bill.siteId)?.name || `Site #${bill.siteId}`;

  const openAmountCorrection = () => {
    setAmountDraft("");
    setAmountReason("");
    setActiveCorrection("amount");
  };
  const openSiteCorrection = () => {
    setSiteChoice("");
    setSiteReason("");
    setActiveCorrection("site");
  };
  const submitAmountCorrection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (amountCanSave) amountMutation.mutate();
  };
  const submitSiteCorrection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (siteChoice && siteReason.trim()) siteMutation.mutate();
  };

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Owner-only bill corrections" data-testid="section-vb-owner-corrections">
      <div>
        <p className="text-sm font-semibold">Recorded values</p>
        <p className="text-xs text-muted-foreground">
          Paid amount: {recordedAmount == null ? "No recorded amount" : `₹${money(recordedAmount)}`} · Site: {currentSite}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {bill.status === "paid" && recordedAmount != null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAmountCorrection}
            data-testid="button-open-vb-amount-correction"
          >
            Correct recorded amount
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openSiteCorrection}
          data-testid="button-open-vb-site-correction"
        >
          Correct site
        </Button>
      </div>

      {activeCorrection === "amount" && (
        <form className="grid gap-3 rounded-md border p-3 sm:max-w-xl" onSubmit={submitAmountCorrection} data-testid="form-vb-amount-correction">
          <div>
            <Label htmlFor={`vb-correct-amount-${bill.id}`}>New recorded paid amount (₹)</Label>
            <Input
              id={`vb-correct-amount-${bill.id}`}
              type="number"
              min="0"
              max={Number.isFinite(netPayable) ? netPayable : undefined}
              step="0.01"
              value={amountDraft}
              onChange={event => setAmountDraft(event.target.value)}
              required
              data-testid="input-vb-correction-paid-amount"
            />
          </div>
          <div>
            <Label htmlFor={`vb-correct-amount-reason-${bill.id}`}>Reason</Label>
            <Textarea
              id={`vb-correct-amount-reason-${bill.id}`}
              value={amountReason}
              onChange={event => setAmountReason(event.target.value)}
              maxLength={500}
              required
              data-testid="textarea-vb-correction-paid-reason"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setActiveCorrection(null)}>Cancel</Button>
            <Button type="submit" disabled={!amountCanSave || amountMutation.isPending} data-testid="button-save-vb-amount-correction">
              Save amount correction
            </Button>
          </div>
        </form>
      )}

      {activeCorrection === "site" && (
        <form className="grid gap-3 rounded-md border p-3 sm:max-w-xl" onSubmit={submitSiteCorrection} data-testid="form-vb-site-correction">
          <div>
            <Label htmlFor={`vb-correct-site-${bill.id}`}>Correct site answer</Label>
            <Select value={siteChoice} onValueChange={setSiteChoice}>
              <SelectTrigger id={`vb-correct-site-${bill.id}`} data-testid="select-vb-correction-site">
                <SelectValue placeholder="Choose site or ALL SITES" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL SITES</SelectItem>
                {sites.map(site => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`vb-correct-site-reason-${bill.id}`}>Reason</Label>
            <Textarea
              id={`vb-correct-site-reason-${bill.id}`}
              value={siteReason}
              onChange={event => setSiteReason(event.target.value)}
              maxLength={500}
              required
              data-testid="textarea-vb-correction-site-reason"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setActiveCorrection(null)}>Cancel</Button>
            <Button type="submit" disabled={!siteChoice || !siteReason.trim() || siteMutation.isPending} data-testid="button-save-vb-site-correction">
              Save site correction
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
