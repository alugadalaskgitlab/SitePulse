import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HubShell } from "@/components/HubShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  TallyExportReadinessReport,
  TallyBillCategory,
  TallyComponentKey,
  TallyMappingCoverage,
  TallyReadinessBill,
} from "@shared/tallyExportReadiness";
import type { TallyVoucherPreview } from "@shared/tallyVoucher";

type TallyReadinessPageData = TallyExportReadinessReport & {
  canConfirmMappings?: boolean;
  canExportXml?: boolean;
};

type ExportPreviewResponse = {
  vouchers: TallyVoucherPreview[];
  blocked: Array<{ billId: number; billNo: string; reasons: string[] }>;
  fileOnly: true;
  companyName: string;
};

async function loadReadiness(): Promise<TallyReadinessPageData> {
  const response = await fetch("/api/vendor-bills/tally-readiness", { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || "Tally Export Readiness could not be loaded.");
  }
  return response.json();
}

async function readJsonError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body.message || fallback;
}

function textInputClass() {
  return "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";
}

function PostingMappingsCard({
  config,
  canConfirm,
  onSave,
  saving,
}: {
  config: TallyExportReadinessReport["config"];
  canConfirm: boolean;
  onSave: (config: TallyExportReadinessReport["config"]) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);

  const updateCategoryMapping = (
    category: TallyBillCategory,
    field: "voucherType" | "expenseLedger",
    value: string,
  ) => setDraft(current => ({
    ...current,
    voucherMappings: {
      ...current.voucherMappings,
      [category]: {
        ...current.voucherMappings[category],
        [field]: field === "expenseLedger" ? value || null : value,
        confirmed: false,
      },
    },
  }));

  const updateComponentMapping = (component: TallyComponentKey, value: string) =>
    setDraft(current => ({
      ...current,
      componentLedgerMappings: {
        ...current.componentLedgerMappings,
        [component]: { ledgerName: value || null, confirmed: false },
      },
    }));

  const labels: Record<TallyBillCategory, string> = {
    material: "Material",
    equipment: "Equipment hire",
    transport: "Transport",
    labour: "Labour",
  };
  const componentLabels: Record<TallyComponentKey, string> = {
    gst: "GST",
    tds: "TDS",
    advanceAdjustment: "Advance adjustment",
    dieselRecovery: "HSD / diesel recovery",
    breakdownDeduction: "Breakdown deduction",
    operatorUnavailable: "Operator / driver unavailable",
    otherDebit: "Other debit",
    otherCredit: "Other credit",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Voucher and component mappings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Suggested names are not treated as confirmed. The Owner must verify each voucher type and ledger name against HLC Tally.
          Any missing or unconfirmed mapping blocks the affected voucher.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {(["material", "equipment", "transport", "labour"] as const).map(category => {
            const mapping = draft.voucherMappings[category];
            return (
              <div key={category} className="space-y-3 rounded-md border p-3">
                <h3 className="font-medium">{labels[category]}</h3>
                <label className="block text-sm">
                  Tally voucher type
                  <input
                    aria-label={`${labels[category]} voucher type`}
                    className={textInputClass()}
                    value={mapping.voucherType}
                    disabled={!canConfirm}
                    onChange={event => updateCategoryMapping(category, "voucherType", event.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Expense ledger
                  <input
                    aria-label={`${labels[category]} expense ledger`}
                    className={textInputClass()}
                    value={mapping.expenseLedger ?? ""}
                    disabled={!canConfirm}
                    onChange={event => updateCategoryMapping(category, "expenseLedger", event.target.value)}
                  />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={mapping.confirmed}
                    disabled={!canConfirm}
                    onChange={event => setDraft(current => ({
                      ...current,
                      voucherMappings: {
                        ...current.voucherMappings,
                        [category]: { ...current.voucherMappings[category], confirmed: event.target.checked },
                      },
                    }))}
                  />
                  <span>I verified this voucher type and expense ledger in HLC Tally.</span>
                </label>
              </div>
            );
          })}
          <div className="space-y-3 rounded-md border p-3">
            <h3 className="font-medium">All / combined bill</h3>
            <label className="block text-sm">
              Tally voucher type
              <input
                aria-label="Combined bill voucher type"
                className={textInputClass()}
                value={draft.voucherMappings.all.voucherType}
                disabled={!canConfirm}
                onChange={event => setDraft(current => ({
                  ...current,
                  voucherMappings: {
                    ...current.voucherMappings,
                    all: { ...current.voucherMappings.all, voucherType: event.target.value, confirmed: false },
                  },
                }))}
              />
            </label>
            <p className="text-xs text-muted-foreground">Combined bills use each saved item’s category expense ledger.</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={draft.voucherMappings.all.confirmed}
                disabled={!canConfirm}
                onChange={event => setDraft(current => ({
                  ...current,
                  voucherMappings: {
                    ...current.voucherMappings,
                    all: { ...current.voucherMappings.all, confirmed: event.target.checked },
                  },
                }))}
              />
              <span>I verified this voucher type in HLC Tally.</span>
            </label>
          </div>
        </div>

        <div>
          <h3 className="mb-3 font-medium">Separate component ledgers</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {([
              "gst",
              "tds",
              "advanceAdjustment",
              "dieselRecovery",
              "breakdownDeduction",
              "operatorUnavailable",
              "otherDebit",
              "otherCredit",
            ] as const).map(component => {
              const mapping = draft.componentLedgerMappings[component];
              return (
                <div key={component} className="space-y-2 rounded-md border p-3">
                  <label className="block text-sm">
                    {componentLabels[component]} ledger
                    <input
                      aria-label={`${componentLabels[component]} ledger`}
                      className={textInputClass()}
                      value={mapping.ledgerName ?? ""}
                      disabled={!canConfirm}
                      onChange={event => updateComponentMapping(component, event.target.value)}
                    />
                  </label>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={mapping.confirmed}
                      disabled={!canConfirm}
                      onChange={event => setDraft(current => ({
                        ...current,
                        componentLedgerMappings: {
                          ...current.componentLedgerMappings,
                          [component]: {
                            ...current.componentLedgerMappings[component],
                            confirmed: event.target.checked,
                          },
                        },
                      }))}
                    />
                    <span>Verified against HLC Tally</span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {canConfirm ? (
          <Button onClick={() => onSave(draft)} disabled={saving}>
            {saving ? "Saving mappings…" : "Save confirmed mappings"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Only the Owner can edit and confirm these posting mappings.</p>
        )}
      </CardContent>
    </Card>
  );
}

function BillLink({ bill }: { bill: TallyReadinessBill }) {
  return (
    <Link href={bill.href} className="font-medium text-primary underline-offset-4 hover:underline">
      {bill.billNo} · {bill.billDate || "Date unavailable"} · {bill.vendorName}
    </Link>
  );
}

function WorkPeriod({ bill }: { bill: TallyReadinessBill }) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Work period: {bill.periodFrom || "not recorded"} to {bill.periodTo || "not recorded"}
    </p>
  );
}

function CoverageCard({ title, coverage }: { title: string; coverage: TallyMappingCoverage }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <strong>{coverage.mapped} of {coverage.total}</strong> mapped
          <span className="text-muted-foreground"> · {coverage.unmapped.length} unmapped</span>
        </p>
        {coverage.unmapped.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm" aria-label={`Unmapped ${title.toLowerCase()}`}>
            {coverage.unmapped.map(record => (
              <li key={record.id}>
                {record.name}{record.detail ? ` (${record.detail})` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">All listed records have a Tally name.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CountCard({ label, count, detail }: { label: string; count: number; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function VendorTallyReadiness() {
  const readiness = useQuery({
    queryKey: ["/api/vendor-bills/tally-readiness"],
    queryFn: loadReadiness,
  });
  const [selectedBillIds, setSelectedBillIds] = useState<number[]>([]);
  const [exportPreview, setExportPreview] = useState<ExportPreviewResponse | null>(null);
  const [confirmedBillIds, setConfirmedBillIds] = useState<number[]>([]);
  const [actionMessage, setActionMessage] = useState("");

  const saveMappings = useMutation({
    mutationFn: async (config: TallyExportReadinessReport["config"]) => {
      const response = await fetch("/api/vendor-bills/tally-posting-mappings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherMappings: config.voucherMappings,
          componentLedgerMappings: config.componentLedgerMappings,
        }),
      });
      if (!response.ok) throw new Error(await readJsonError(response, "Tally mappings could not be saved."));
    },
    onSuccess: async () => {
      setActionMessage("Confirmed Tally mappings saved.");
      setSelectedBillIds([]);
      setExportPreview(null);
      setConfirmedBillIds([]);
      await readiness.refetch();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (billIds: number[]): Promise<ExportPreviewResponse> => {
      const response = await fetch("/api/vendor-bills/tally-export-preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billIds }),
      });
      if (!response.ok) throw new Error(await readJsonError(response, "The selected bills could not be previewed."));
      return response.json();
    },
    onSuccess: result => {
      setExportPreview(result);
      setConfirmedBillIds([]);
      setActionMessage("");
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (billIds: number[]) => {
      const response = await fetch("/api/vendor-bills/tally-export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billIds,
          confirmedNotAlreadyInTallyBillIds: billIds,
        }),
      });
      if (!response.ok) throw new Error(await readJsonError(response, "The Tally XML file could not be generated."));
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "HLC-Tally-vouchers.xml";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    },
    onSuccess: () => {
      setActionMessage("Tally XML file downloaded. No bill, payment, status, or frozen snapshot data was changed.");
      setSelectedBillIds([]);
      setConfirmedBillIds([]);
      setExportPreview(null);
    },
  });

  const toggleBillSelection = (billId: number, checked: boolean) => {
    setSelectedBillIds(current => checked
      ? Array.from(new Set([...current, billId]))
      : current.filter(id => id !== billId));
    setExportPreview(null);
    setConfirmedBillIds([]);
    setActionMessage("");
  };

  const toggleBillConfirmation = (billId: number, checked: boolean) =>
    setConfirmedBillIds(current => checked
      ? Array.from(new Set([...current, billId]))
      : current.filter(id => id !== billId));

  return (
    <HubShell
      title="Tally Export Readiness"
      subtitle="Check explicit Tally mappings and bill blockers before cutover."
      backHref="/finance/vendor-bills"
      backLabel="Vendor Bills"
    >
      <div className="mx-auto max-w-7xl space-y-5 p-4">
        <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          XML is generated as a downloadable file only. This page never connects to Tally or changes bill, payment, status, or frozen snapshot data.
          Pre-cutover bills are excluded from this export.
        </p>

        {readiness.isPending && <p role="status">Loading Tally readiness…</p>}
        {readiness.isError && (
          <div role="alert" className="rounded-md border border-destructive/40 p-4">
            <p className="font-medium">Tally Export Readiness is unavailable.</p>
            <p className="mt-1 text-sm text-muted-foreground">{readiness.error.message}</p>
            <Button className="mt-3" variant="outline" onClick={() => readiness.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {readiness.data && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tally setup</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p><span className="text-muted-foreground">Company</span><br /><strong>{readiness.data.config.companyName}</strong></p>
                <p><span className="text-muted-foreground">Cutover date</span><br /><strong>{readiness.data.config.cutoverDate}</strong></p>
                <p><span className="text-muted-foreground">Project category</span><br /><strong>{readiness.data.config.projectCategory}</strong></p>
                <p><span className="text-muted-foreground">Resource category</span><br /><strong>{readiness.data.config.resourceCategory}</strong></p>
              </CardContent>
            </Card>

            <PostingMappingsCard
              config={readiness.data.config}
              canConfirm={!!readiness.data.canConfirmMappings}
              saving={saveMappings.isPending}
              onSave={config => saveMappings.mutate(config)}
            />
            {saveMappings.isError && <p role="alert" className="text-sm text-destructive">{saveMappings.error.message}</p>}

            <section aria-labelledby="tally-bill-readiness-heading" className="space-y-3">
              <h2 id="tally-bill-readiness-heading" className="text-lg font-semibold">Bill readiness</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <CountCard label="Candidates" count={readiness.data.candidates.total} detail="Approved or paid, excluding cancelled and deleted bills" />
                <CountCard label="Post-cutover" count={readiness.data.candidates.postCutover} detail="Work period starts on or after cutover" />
                <CountCard label="Pre-cutover" count={readiness.data.candidates.preCutover} detail="Work period ended before cutover; already belongs to Tally" />
                <CountCard label="Straddles cutover" count={readiness.data.candidates.straddlesCutover} detail="Part of the work period falls before cutover" />
                <CountCard label="Period not recorded" count={readiness.data.candidates.periodNotRecorded} detail="Bill date is not used as a fallback" />
                <CountCard label="Ready" count={readiness.data.candidates.ready} detail="Post-cutover candidates with no blockers" />
                <CountCard label="Blocked" count={readiness.data.candidates.blocked} detail="Post-cutover candidates with one or more blockers" />
              </div>
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview eligible bills and download XML</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Preview checks saved line items, accounting components, cost centres, and debit/credit balance.
                  Only approved or paid post-cutover bills with confirmed mappings can proceed.
                </p>
                {!readiness.data.canExportXml && (
                  <p className="text-sm text-muted-foreground">XML preview and download are limited to Owner/Admin.</p>
                )}
                {readiness.data.readyBills.length === 0 ? (
                  <p className="text-sm">There are no bills currently ready for Tally preview.</p>
                ) : (
                  <ul className="space-y-2">
                    {readiness.data.readyBills.map(bill => (
                      <li key={bill.id} className="rounded-md border p-3">
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedBillIds.includes(bill.id)}
                            disabled={!readiness.data?.canExportXml || previewMutation.isPending || downloadMutation.isPending}
                            onChange={event => toggleBillSelection(bill.id, event.target.checked)}
                          />
                          <span>
                            <BillLink bill={bill} />
                            <WorkPeriod bill={bill} />
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    disabled={!readiness.data.canExportXml || selectedBillIds.length === 0 || previewMutation.isPending}
                    onClick={() => previewMutation.mutate(selectedBillIds)}
                  >
                    {previewMutation.isPending ? "Building preview…" : "Preview selected bills"}
                  </Button>
                  {actionMessage && <p role="status" className="text-sm">{actionMessage}</p>}
                  {previewMutation.isError && <p role="alert" className="text-sm text-destructive">{previewMutation.error.message}</p>}
                </div>
              </CardContent>
            </Card>

            {exportPreview && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Voucher preview — {exportPreview.companyName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Inspection only. No XML file is created until you confirm each bill below and select Download XML.
                  </p>
                  {exportPreview.vouchers.map(voucher => (
                    <div key={voucher.billId} className="space-y-3 rounded-md border p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {voucher.billNo} · {voucher.billDate} · {voucher.vendorName}
                          </p>
                          <p className="text-sm text-muted-foreground">Voucher type: {voucher.voucherType}</p>
                        </div>
                        <div className="text-sm tabular-nums">
                          <p>Debit: {voucher.debits.toFixed(2)}</p>
                          <p>Credit: {voucher.credits.toFixed(2)}</p>
                          <p>Net payable: {voucher.netPayable.toFixed(2)}</p>
                        </div>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {voucher.entries.map((entry, index) => (
                          <li key={`${voucher.billId}-${entry.ledgerName}-${index}`} className="rounded bg-muted/30 p-2">
                            <strong>{entry.side.toUpperCase()}</strong> · {entry.ledgerName} · {entry.amount.toFixed(2)}
                            {entry.categoryAllocations.length > 0 && (
                              <ul className="mt-1 space-y-1 pl-3 text-xs text-muted-foreground">
                                {entry.categoryAllocations.map(allocation => (
                                  <li key={`${allocation.category}-${allocation.costCentre}`}>
                                    {allocation.category}: {allocation.costCentre} · {allocation.amount.toFixed(2)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                      <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={confirmedBillIds.includes(voucher.billId)}
                          disabled={!readiness.data.canExportXml || downloadMutation.isPending}
                          onChange={event => toggleBillConfirmation(voucher.billId, event.target.checked)}
                        />
                        <span>
                          I verified bill {voucher.billNo} is not already in Tally. Include it in the XML file.
                        </span>
                      </label>
                    </div>
                  ))}

                  {exportPreview.blocked.length > 0 && (
                    <div className="rounded-md border border-destructive/40 p-3">
                      <h3 className="font-medium">Blocked from XML</h3>
                      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-destructive">
                        {exportPreview.blocked.map(bill => (
                          <li key={bill.billId}>
                            {bill.billNo}
                            <ul className="list-disc pl-5">
                              {bill.reasons.map((reason, index) => <li key={`${bill.billId}-${index}`}>{reason}</li>)}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      disabled={
                        !readiness.data.canExportXml ||
                        confirmedBillIds.length === 0 ||
                        downloadMutation.isPending ||
                        confirmedBillIds.some(id => !exportPreview.vouchers.some(voucher => voucher.billId === id))
                      }
                      onClick={() => downloadMutation.mutate(confirmedBillIds)}
                    >
                      {downloadMutation.isPending ? "Generating XML…" : "Download confirmed XML"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={downloadMutation.isPending}
                      onClick={() => {
                        setExportPreview(null);
                        setConfirmedBillIds([]);
                      }}
                    >
                      Clear preview
                    </Button>
                    {downloadMutation.isError && <p role="alert" className="text-sm text-destructive">{downloadMutation.error.message}</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            <section aria-labelledby="tally-mapping-heading" className="space-y-3">
              <h2 id="tally-mapping-heading" className="text-lg font-semibold">Master mapping coverage</h2>
              <div className="grid gap-3 lg:grid-cols-3">
                <CoverageCard title="Vendors" coverage={readiness.data.coverage.vendors} />
                <CoverageCard title="Sites" coverage={readiness.data.coverage.sites} />
                <CoverageCard title="Hired machines" coverage={readiness.data.coverage.hiredMachines} />
              </div>
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Blocked post-cutover bills</CardTitle>
              </CardHeader>
              <CardContent>
                {readiness.data.blockedBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No blocked post-cutover candidate bills.</p>
                ) : (
                  <ul className="space-y-4">
                    {readiness.data.blockedBills.map(bill => (
                      <li key={bill.id} className="rounded-md border p-3">
                        <BillLink bill={bill} />
                          <WorkPeriod bill={bill} />
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                          {bill.reasons.map((reason, index) => <li key={`${bill.id}-${index}`}>{reason}</li>)}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pre-cutover bills — already belong to Tally</CardTitle>
              </CardHeader>
              <CardContent>
                {readiness.data.preCutoverBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pre-cutover candidate bills.</p>
                ) : (
                  <ul className="space-y-2">
                    {readiness.data.preCutoverBills.map(bill => (
                      <li key={bill.id}>
                        <BillLink bill={bill} />
                        <WorkPeriod bill={bill} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Straddles the cutover — owner decision needed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Part of this work falls before the cutover. This is a review item, not a bill error.
                  The owner must decide whether each bill goes to Tally. These bills are not counted as ready or blocked.
                </p>
                {readiness.data.straddlingBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No candidate bills straddle the cutover.</p>
                ) : (
                  <ul className="space-y-2">
                    {readiness.data.straddlingBills.map(bill => (
                      <li key={bill.id}>
                        <BillLink bill={bill} />
                        <WorkPeriod bill={bill} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Period not recorded</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  These are review items, not bill errors. The bills cannot be placed until their billing periods are recorded.
                  The bill date is not used as a fallback. These candidates are not counted as ready or blocked.
                </p>
                {readiness.data.periodNotRecordedBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No candidate bills have a missing or invalid billing period.</p>
                ) : (
                  <ul className="space-y-2">
                    {readiness.data.periodNotRecordedBills.map(bill => (
                      <li key={bill.id}>
                        <BillLink bill={bill} />
                        <WorkPeriod bill={bill} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </HubShell>
  );
}
