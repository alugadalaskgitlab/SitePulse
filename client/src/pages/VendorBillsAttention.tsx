import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Info, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

type AttentionKind =
  | "site"
  | "paid_amount"
  | "period"
  | "bill_date_before_period_end"
  | "negative_net";

type SiteOption = { id: number; name: string };
type BillAttentionRow = {
  billId: number;
  billNo: string;
  billDate: string;
  vendorName: string;
  net: number;
  status: string;
  amountPaid: number | string | null;
  siteId: number | null;
  siteName: string | null;
  siteScopeConfirmed: boolean | null;
  periodFrom: string | null;
  periodTo: string | null;
  kinds: AttentionKind[];
  siteSuggestion: { siteId: number; siteName: string; evidence: string[] } | null;
};

type AttentionResponse = {
  rows: BillAttentionRow[];
  summary: { bills: number; counts: Record<AttentionKind, number> };
  sites: SiteOption[];
};

const KIND_LABELS: Record<AttentionKind, string> = {
  site: "No site answer",
  paid_amount: "Paid amount missing",
  period: "Billed period incomplete",
  bill_date_before_period_end: "Bill date before period end",
  negative_net: "Negative net · review only",
};

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

function readableEvidenceDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function readableEvidence(value: string): string {
  return value.replace(
    /between (\d{4}-\d{2}-\d{2}) and (\d{4}-\d{2}-\d{2})/,
    (_match, from, to) => `between ${readableEvidenceDate(from)} and ${readableEvidenceDate(to)}`,
  );
}

function BillAttentionCard({ row, sites }: { row: BillAttentionRow; sites: SiteOption[] }) {
  const { toast } = useToast();
  const [siteChoice, setSiteChoice] = useState("");
  const [periodFrom, setPeriodFrom] = useState(row.periodFrom || "");
  const [periodTo, setPeriodTo] = useState(row.periodTo || "");
  const [paidAmount, setPaidAmount] = useState("");

  const onCorrected = (title: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/attention"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
    toast({ title });
  };
  const onError = (error: Error) => {
    toast({ title: "Correction was not saved", description: error.message, variant: "destructive" });
  };

  const siteMutation = useMutation({
    mutationFn: (siteId: number | null) =>
      apiRequest("PATCH", `/api/vendor-bills/${row.billId}/attention/site`, { siteId }),
    onSuccess: () => onCorrected("Site answer recorded"),
    onError,
  });
  const periodMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/vendor-bills/${row.billId}/attention/period`, { periodFrom, periodTo }),
    onSuccess: () => onCorrected("Billed period corrected"),
    onError,
  });
  const paidAmountMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/vendor-bills/${row.billId}/attention/paid-amount`, {
      amountPaid: Number(paidAmount),
    }),
    onSuccess: () => onCorrected("Paid amount recorded; bill status unchanged"),
    onError,
  });

  const saveManualSite = () => {
    if (!siteChoice) return;
    siteMutation.mutate(siteChoice === "all" ? null : Number(siteChoice));
  };
  const useSuggestion = () => {
    if (row.siteSuggestion) siteMutation.mutate(row.siteSuggestion.siteId);
  };

  return (
    <Card data-testid={`attention-bill-${row.billId}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Bill {row.billNo}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.vendorName} · {row.billDate}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{money(Number(row.net || 0))}</p>
            <Badge variant="outline" className="mt-1 uppercase">{row.status}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="Attention items">
          {row.kinds.map(kind => (
            <Badge key={kind} variant={kind === "negative_net" ? "destructive" : "secondary"}>
              {KIND_LABELS[kind]}
            </Badge>
          ))}
        </div>

        {row.kinds.includes("site") && (
          <section className="space-y-3 rounded-md border p-3" aria-label="Correct site answer">
            <div>
              <h3 className="text-sm font-semibold">Site answer</h3>
              <p className="text-xs text-muted-foreground">
                Choose one site or explicitly confirm ALL SITES. This changes only the site answer.
              </p>
            </div>
            {row.siteSuggestion && (
              <div className="rounded bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950/30 dark:text-blue-100">
                <p className="font-medium"><Info className="mr-1 inline h-4 w-4" /> Suggested site: {row.siteSuggestion.siteName}</p>
                {row.siteSuggestion.evidence.map((evidence, index) => (
                  <p key={index} className="mt-1 text-xs">{readableEvidence(evidence)}</p>
                ))}
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={useSuggestion}
                  disabled={siteMutation.isPending}
                  data-testid={`button-accept-site-suggestion-${row.billId}`}
                >
                  {siteMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  USE SUGGESTED SITE
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-48 flex-1">
                <Label htmlFor={`attention-site-${row.billId}`}>Choose site</Label>
                <Select value={siteChoice} onValueChange={setSiteChoice}>
                  <SelectTrigger id={`attention-site-${row.billId}`} data-testid={`select-attention-site-${row.billId}`}>
                    <SelectValue placeholder="SELECT SITE OR ALL SITES" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL SITES</SelectItem>
                    {sites.map(site => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={saveManualSite}
                disabled={!siteChoice || siteMutation.isPending}
                data-testid={`button-save-attention-site-${row.billId}`}
              >
                {siteMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} SAVE SITE
              </Button>
            </div>
          </section>
        )}

        {row.kinds.some(kind => kind === "period" || kind === "bill_date_before_period_end") && (
          <section className="space-y-3 rounded-md border p-3" aria-label="Correct billed period">
            <div>
              <h3 className="text-sm font-semibold">Billed period</h3>
              <p className="text-xs text-muted-foreground">
                Set the actual period. Amounts, status, payment records and frozen snapshots are not changed.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <Label htmlFor={`attention-period-from-${row.billId}`}>From</Label>
                <Input
                  id={`attention-period-from-${row.billId}`}
                  type="date"
                  value={periodFrom}
                  onChange={event => setPeriodFrom(event.target.value)}
                  data-testid={`input-attention-period-from-${row.billId}`}
                />
              </div>
              <div>
                <Label htmlFor={`attention-period-to-${row.billId}`}>To</Label>
                <Input
                  id={`attention-period-to-${row.billId}`}
                  type="date"
                  value={periodTo}
                  onChange={event => setPeriodTo(event.target.value)}
                  data-testid={`input-attention-period-to-${row.billId}`}
                />
              </div>
              <Button
                onClick={() => periodMutation.mutate()}
                disabled={!periodFrom || !periodTo || periodFrom > periodTo || periodMutation.isPending}
                data-testid={`button-save-attention-period-${row.billId}`}
              >
                {periodMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} SAVE PERIOD
              </Button>
            </div>
          </section>
        )}

        {row.kinds.includes("paid_amount") && !row.kinds.includes("negative_net") && (
          <section className="space-y-3 rounded-md border p-3" aria-label="Record paid amount">
            <div>
              <h3 className="text-sm font-semibold">Paid amount</h3>
              <p className="text-xs text-muted-foreground">
                Enter the amount actually paid. Zero is valid when that is the recorded amount. Status remains PAID.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="sm:w-64">
                <Label htmlFor={`attention-paid-${row.billId}`}>Amount paid (₹)</Label>
                <Input
                  id={`attention-paid-${row.billId}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={event => setPaidAmount(event.target.value)}
                  data-testid={`input-attention-paid-${row.billId}`}
                />
              </div>
              <Button
                onClick={() => paidAmountMutation.mutate()}
                disabled={paidAmount === "" || !Number.isFinite(Number(paidAmount)) || Number(paidAmount) < 0 || paidAmountMutation.isPending}
                data-testid={`button-save-attention-paid-${row.billId}`}
              >
                {paidAmountMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} RECORD AMOUNT
              </Button>
            </div>
          </section>
        )}

        {row.kinds.includes("paid_amount") && row.kinds.includes("negative_net") && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            The paid amount is missing, but this bill has a negative net. Review it outside this page; no amount correction is available here.
          </p>
        )}

        {row.kinds.includes("negative_net") && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Negative net is shown for review only. This page does not offer an amount correction.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function VendorBillsAttention() {
  const { isAdmin, user } = useAuth();
  const [filter, setFilter] = useState<AttentionKind | "all">("all");
  const authorized = isAdmin || !!user?.isOwner;
  const attentionQuery = useQuery<AttentionResponse>({
    queryKey: ["/api/vendor-bills/attention"],
    queryFn: async () => {
      const response = await fetch("/api/vendor-bills/attention", { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Could not load vendor bill attention list.");
      }
      return response.json();
    },
    enabled: authorized,
    retry: false,
  });

  if (!authorized) {
    return (
      <main className="mx-auto max-w-4xl p-4">
        <Card><CardContent className="py-8 text-center">Administrator or Owner access is required.</CardContent></Card>
      </main>
    );
  }

  const data = attentionQuery.data;
  const visibleRows = (data?.rows || []).filter(row => filter === "all" || row.kinds.includes(filter));

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/finance/vendor-bills">
            <Button variant="ghost" size="icon" aria-label="Back to Vendor Bills">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">BILLS NEEDING ATTENTION</h1>
            <p className="text-sm text-muted-foreground">Review and correct one bill at a time. No automatic changes are made.</p>
          </div>
        </div>
        <Link href="/finance/vendor-bills">
          <Button variant="outline">VENDOR BILLS</Button>
        </Link>
      </header>

      {attentionQuery.isError && (
        <Card>
          <CardContent className="space-y-3 py-5" role="alert">
            <p>{(attentionQuery.error as Error).message}</p>
            <Button variant="outline" onClick={() => attentionQuery.refetch()}>RETRY</Button>
          </CardContent>
        </Card>
      )}

      {attentionQuery.isLoading ? (
        <Card><CardContent className="py-8 text-center">Loading bill attention items…</CardContent></Card>
      ) : data && (
        <>
          <section aria-label="Attention summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card><CardContent className="py-4">
              <p className="text-xs uppercase text-muted-foreground">Bills needing attention</p>
              <p className="mt-1 text-2xl font-bold">{data.summary.bills}</p>
            </CardContent></Card>
            {(Object.keys(KIND_LABELS) as AttentionKind[]).map(kind => (
              <Card key={kind}><CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">{KIND_LABELS[kind]}</p>
                <p className="mt-1 text-2xl font-bold">{data.summary.counts[kind] || 0}</p>
              </CardContent></Card>
            ))}
          </section>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:max-w-sm">
              <Label htmlFor="vendor-bill-attention-filter">Filter by attention item</Label>
              <Select value={filter} onValueChange={value => setFilter(value as AttentionKind | "all")}>
                <SelectTrigger id="vendor-bill-attention-filter" data-testid="select-vendor-bill-attention-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds ({data.summary.bills})</SelectItem>
                  {(Object.keys(KIND_LABELS) as AttentionKind[]).map(kind => (
                    <SelectItem key={kind} value={kind}>
                      {KIND_LABELS[kind]} ({data.summary.counts[kind] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground" role="status">
              Showing {visibleRows.length} of {data.summary.bills} bills
            </p>
          </div>

          {visibleRows.length ? (
            <div className="space-y-3">
              {visibleRows.map(row => <BillAttentionCard key={row.billId} row={row} sites={data.sites} />)}
            </div>
          ) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              {data.summary.bills === 0 ? "No bills need attention." : "No bills match this filter."}
            </CardContent></Card>
          )}
        </>
      )}
    </main>
  );
}
