import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HubShell } from "@/components/HubShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  TallyExportReadinessReport,
  TallyMappingCoverage,
  TallyReadinessBill,
} from "@shared/tallyExportReadiness";

async function loadReadiness(): Promise<TallyExportReadinessReport> {
  const response = await fetch("/api/vendor-bills/tally-readiness", { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || "Tally Export Readiness could not be loaded.");
  }
  return response.json();
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

  return (
    <HubShell
      title="Tally Export Readiness"
      subtitle="Check explicit Tally mappings and bill blockers before cutover."
      backHref="/finance/vendor-bills"
      backLabel="Vendor Bills"
    >
      <div className="mx-auto max-w-7xl space-y-5 p-4">
        <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          Read-only report. No export or bill changes are available on this page.
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
                  Part of this work falls before the cutover. The owner must decide whether each bill goes to Tally.
                  These bills are not counted as ready or blocked.
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
                  These bills cannot be placed until their billing periods are recorded. The bill date is not used as a fallback.
                  These candidates are not counted as ready or blocked.
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
