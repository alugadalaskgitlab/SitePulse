import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronLeft, Clock, FileCheck2, Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PermissionChange {
  id: number;
  userId: number;
  userName: string;
  sectionKey: string;
  action: "view";
  before: boolean;
  after: boolean;
  reason: string;
}

interface PermissionMigrationAuditResponse {
  completed: boolean;
  completedAt: string | null;
  changedRows: number;
  changes: PermissionChange[];
  mapping: Array<{ source: string; target: string }>;
  pageSummary: Array<{
    page: string;
    section: string;
    usersGranted: number;
    usersWithAccess: number;
  }>;
}

function PermissionValue({ allowed }: { allowed: boolean }) {
  return (
    <Badge
      variant="outline"
      className={allowed
        ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-900/20 dark:text-teal-300"
        : "text-muted-foreground"}
    >
      {allowed ? "Allowed" : "Not allowed"}
    </Badge>
  );
}

function CompletionTime({ value }: { value: string | null }) {
  if (!value) return <span>Not recorded</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="break-all">{value}</span>;
  return (
    <time dateTime={value} title={value}>
      {new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      }).format(date)}
    </time>
  );
}

export default function PermissionMigrationAudit() {
  // The parent route supplies access control. The shared query function performs
  // a credentialed GET and retains the application's existing auth handling.
  const { data, isLoading, isError, isFetching, refetch } = useQuery<PermissionMigrationAuditResponse>({
    queryKey: ["/api/admin/permission-migration-audit"],
  });

  const users = useMemo(() => {
    const grouped = new Map<number, { userId: number; userName: string; changes: PermissionChange[] }>();
    for (const change of data?.changes ?? []) {
      const user = grouped.get(change.userId);
      if (user) {
        user.changes.push(change);
      } else {
        grouped.set(change.userId, {
          userId: change.userId,
          userName: change.userName,
          changes: [change],
        });
      }
    }
    return Array.from(grouped.values());
  }, [data?.changes]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <Link
          href="/admin/hub"
          aria-label="Back to admin hub"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="button-back"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">Permission Migration Audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recorded permission changes, mappings and page access.</p>
        </div>
        <Badge variant="outline" className="hidden shrink-0 gap-1.5 sm:inline-flex">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Read-only
        </Badge>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p>This is a read-only record. Viewing this page does not run the migration or change anyone's permissions.</p>
      </div>

      {isLoading ? (
        <div className="space-y-6" role="status" aria-label="Loading permission migration audit">
          <span className="sr-only">Loading permission migration audit…</span>
          <Card>
            <CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader>
            <CardContent><Skeleton className="h-20 w-full" /></CardContent>
          </Card>
          <Card>
            <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
            </CardContent>
          </Card>
        </div>
      ) : isError ? (
        <Card role="alert" className="border-destructive/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <CardTitle className="text-lg">Audit could not be loaded</CardTitle>
            </div>
            <CardDescription>The permission history could not be retrieved. No permissions have been changed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching} data-testid="button-retry-audit">
              {isFetching ? "Retrying…" : "Retry loading audit"}
            </Button>
          </CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No audit data available</CardTitle>
            <CardDescription>No migration record was returned. This does not confirm whether the migration has run.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? "Loading…" : "Retry loading audit"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card data-testid="migration-status">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${data.completed
                  ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                  {data.completed
                    ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    : <Clock className="h-5 w-5" aria-hidden="true" />}
                </div>
                <div>
                  <CardTitle className="text-lg">{data.completed ? "Migration completed" : "Migration has not run yet"}</CardTitle>
                  <CardDescription className="mt-1">
                    {data.completed
                      ? "The recorded run is available for review below."
                      : "No completed run is recorded. Mapping and page access data are shown below when available."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 border-t pt-5 md:grid-cols-[1fr_auto] md:gap-8">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completed at</dt>
                  <dd className="mt-2 text-sm font-medium" data-testid="migration-completed-at">
                    {data.completed ? <CompletionTime value={data.completedAt} /> : "Not completed"}
                  </dd>
                </div>
                <div className="md:border-l md:pl-8">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permission rows changed</dt>
                  <dd className="mt-1 font-mono text-3xl font-semibold tabular-nums" data-testid="migration-changed-rows">
                    {data.changedRows.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Changes by user</CardTitle>
              <CardDescription>Full recorded audit: {data.changes.length.toLocaleString()} rows across {users.length.toLocaleString()} users. Before and after refer to the migration run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {users.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
                  <FileCheck2 className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">{data.completed ? "No recorded permission changes" : "No changes recorded yet"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.completed ? "The audit contains no changed permission rows." : "User-level history will appear when a migration run is recorded."}
                  </p>
                </div>
              ) : users.map(user => (
                <section key={user.userId} className="min-w-0 overflow-hidden rounded-lg border" aria-label={`Changes for ${user.userName || `user ${user.userId}`}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold">{user.userName || "Unnamed user"}</h3>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">User ID: {user.userId}</p>
                    </div>
                    <Badge variant="secondary">{user.changes.length} {user.changes.length === 1 ? "change" : "changes"}</Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row ID</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>After</TableHead>
                        <TableHead className="min-w-[220px]">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.changes.map(change => (
                        <TableRow key={change.id} data-testid={`audit-change-${change.id}`}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{change.id}</TableCell>
                          <TableCell className="font-mono text-xs">{change.sectionKey}</TableCell>
                          <TableCell className="text-sm">{change.action}</TableCell>
                          <TableCell><PermissionValue allowed={change.before} /></TableCell>
                          <TableCell><PermissionValue allowed={change.after} /></TableCell>
                          <TableCell className="whitespace-normal break-words text-sm">{change.reason || "No reason recorded"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Permission mapping</CardTitle>
              <CardDescription>Source-to-target section mappings reported by the migration.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.mapping.length === 0 ? (
                <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No permission mappings were returned.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Source</TableHead><TableHead><span className="sr-only">Maps to</span></TableHead><TableHead>Target</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.mapping.map((mapping, index) => (
                      <TableRow key={`${mapping.source}-${mapping.target}-${index}`}>
                        <TableCell className="break-all font-mono text-xs">{mapping.source}</TableCell>
                        <TableCell className="w-10"><ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></TableCell>
                        <TableCell className="break-all font-mono text-xs">{mapping.target}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ten-page access summary</CardTitle>
              <CardDescription>Users granted access by the migration and total users with access, as reported by the server. Pages with zero access remain visible.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.pageSummary.length === 0 ? (
                <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No page access summary was returned.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead className="text-right">Users granted</TableHead>
                      <TableHead className="text-right">Users with access</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pageSummary.map((page, index) => (
                      <TableRow key={`${page.page}-${page.section}-${index}`}>
                        <TableCell className="min-w-[160px] text-sm font-medium">{page.page}</TableCell>
                        <TableCell className="font-mono text-xs">{page.section}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{page.usersGranted.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono tabular-nums">{page.usersWithAccess.toLocaleString()}</span>
                          {page.usersWithAccess === 0 && <span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">No users with access</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
