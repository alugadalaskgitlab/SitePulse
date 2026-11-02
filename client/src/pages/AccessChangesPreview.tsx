import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import type { AccessRuleDecision } from "@shared/accessRulesV2";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type PreviewUser = {
  id: number;
  fullName: string;
  isAdmin: boolean;
  isOwner: boolean;
  isFieldEngineer: boolean;
  changes: AccessRuleDecision[];
};

type AuditEntry = {
  from: boolean;
  to: boolean;
  actorUserId: number | null;
  actorName: string;
  at: string | null;
};

type PreviewResponse = {
  enabled: boolean;
  rules: Array<{ id: string; label: string }>;
  users: PreviewUser[];
  audit: AuditEntry[];
  canToggle: boolean;
};

const outcomeClass: Record<AccessRuleDecision["outcome"], string> = {
  GAIN: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  LOSE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  UNCHANGED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function AccessChangesPreview() {
  const { isAdmin, isOwner } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const permitted = isAdmin || isOwner;

  const previewQuery = useQuery<PreviewResponse>({
    queryKey: ["/api/admin/access-changes-preview"],
    queryFn: async () => {
      const response = await fetch("/api/admin/access-changes-preview", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load the access preview.");
      return response.json();
    },
    enabled: permitted,
    refetchInterval: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("POST", "/api/admin/access-rules-v2", { enabled });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not update access rules.");
      }
      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/access-changes-preview"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/config"] }),
      ]);
      toast({ title: "Access setting updated", description: "The change has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not update access setting", description: error.message, variant: "destructive" });
    },
  });

  if (!permitted) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">This preview is available to Administrators and Owners.</p>
      </div>
    );
  }

  const data = previewQuery.data;
  const requestToggle = (enabled: boolean) => {
    const action = enabled ? "turn ON" : "turn OFF";
    const impact = enabled
      ? "Users' current permissions will control the listed checks."
      : "The app will return to its current access behavior.";
    if (window.confirm(`Confirm ${action} access rules v2?\n\n${impact}`)) {
      toggleMutation.mutate(enabled);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-20 md:p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/settings">
          <Button variant="ghost" size="icon" aria-label="Back to Settings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Access changes preview</h1>
          <p className="text-sm text-muted-foreground">Compare behavior with the setting OFF against saved-permission rules with it ON.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div className="flex-1">
              <CardTitle>Access rules v2</CardTitle>
              <CardDescription>
                {data?.enabled ? "ON — the permission-based rules are active." : "OFF — the existing access behavior remains active."}
                {" "}Missing setting defaults to OFF. This preview does not change permissions, site access, or user flags.
              </CardDescription>
            </div>
            {data?.canToggle && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{data.enabled ? "ON" : "OFF"}</span>
                <Switch
                  checked={data.enabled}
                  disabled={toggleMutation.isPending || previewQuery.isLoading}
                  onCheckedChange={requestToggle}
                  aria-label="Turn access rules v2 on or off"
                  data-testid="switch-access-rules-v2"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {previewQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading access preview…
            </div>
          ) : previewQuery.isError ? (
            <p role="alert" className="py-4 text-sm text-destructive">
              {previewQuery.error instanceof Error ? previewQuery.error.message : "Could not load the access preview."}
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Each row compares the existing check when OFF with its result when access rules v2 is ON. Site-specific access and record ownership remain unchanged.
              </p>
              <div className="space-y-2">
                {data?.users.map((user) => {
                  const gains = user.changes.filter(row => row.outcome === "GAIN").length;
                  const losses = user.changes.filter(row => row.outcome === "LOSE").length;
                  return (
                    <details key={user.id} className="rounded-lg border bg-card">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
                        <span className="font-medium">{user.fullName}</span>
                        {user.isOwner && <Badge variant="secondary">Owner</Badge>}
                        {user.isAdmin && <Badge variant="secondary">Admin</Badge>}
                        {user.isFieldEngineer && <Badge variant="outline">Field Engineer</Badge>}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {gains} gain{gains === 1 ? "" : "s"} · {losses} loss{losses === 1 ? "" : "es"}
                        </span>
                      </summary>
                      <div className="overflow-x-auto border-t">
                        <table className="w-full min-w-[620px] text-left text-sm">
                          <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2 font-medium">Access check</th>
                              <th className="px-4 py-2 font-medium">When OFF</th>
                              <th className="px-4 py-2 font-medium">With v2 ON</th>
                              <th className="px-4 py-2 font-medium">Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {user.changes.map((change) => (
                              <tr key={change.id} className="border-t">
                                <td className="px-4 py-2">{change.label}</td>
                                <td className="px-4 py-2">{change.current ? "Allowed" : "Not allowed"}</td>
                                <td className="px-4 py-2">{change.proposed ? "Allowed" : "Not allowed"}</td>
                                <td className="px-4 py-2">
                                  <Badge className={outcomeClass[change.outcome]}>{change.outcome}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  );
                })}
                {!data?.users.length && <p className="py-4 text-sm text-muted-foreground">No active users found.</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Switch history</CardTitle>
          <CardDescription>Every actual ON/OFF transition is recorded with the Owner and timestamp.</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.audit?.length ? (
            <p className="text-sm text-muted-foreground">No switches have been recorded.</p>
          ) : (
            <ol className="space-y-2">
              {[...data.audit].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">{entry.from ? "ON" : "OFF"} → {entry.to ? "ON" : "OFF"}</Badge>
                  <span>{entry.actorName}{entry.actorUserId != null ? ` (user ${entry.actorUserId})` : ""}</span>
                  {entry.at && (
                    <time className="text-muted-foreground" dateTime={entry.at}>
                      {new Date(entry.at).toLocaleString()}
                    </time>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
