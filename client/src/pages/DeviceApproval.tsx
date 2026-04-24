import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, ShieldX, ShieldCheck } from "lucide-react";

type DeviceRow = {
  id: number;
  userId: number;
  userEmail: string | null;
  userName: string | null;
  deviceLabel: string;
  userAgent: string | null;
  ipAddress: string | null;
  status: "pending" | "approved" | "revoked";
  requestedAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
};

export default function DeviceApproval() {
  const { user, permissions } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "revoked">("pending");

  // Matrix-based gates (admin gets every permission implicitly).
  const devMgmt = permissions["device_approval"];
  const canView = !!user?.isAdmin || !!devMgmt?.view;
  const canEdit = !!user?.isAdmin || !!devMgmt?.edit;

  const devicesQ = useQuery<DeviceRow[]>({
    queryKey: ["/api/auth/devices", tab],
    queryFn: async () => {
      const r = await fetch(`/api/auth/devices?status=${tab}`, { credentials: "include" });
      if (!r.ok) throw new Error(`devices: ${r.status}`);
      return r.json();
    },
    refetchInterval: tab === "pending" ? 8000 : false,
  });

  const approve = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/auth/devices/${id}/approve`, {});
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Device approved" });
      qc.invalidateQueries({ queryKey: ["/api/auth/devices"] });
    },
    onError: (e: Error | { message?: string }) =>
      toast({ title: "Approve failed", description: e?.message || "", variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/auth/devices/${id}/revoke`, {});
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Device revoked" });
      qc.invalidateQueries({ queryKey: ["/api/auth/devices"] });
    },
    onError: (e: Error | { message?: string }) =>
      toast({ title: "Revoke failed", description: e?.message || "", variant: "destructive" }),
  });

  const rows = devicesQ.data ?? [];

  // Gate AFTER hooks to obey the rules of hooks. Renders an empty page
  // for users without device_approval.view; admins always pass.
  if (!canView) {
    return (
      <div className="text-center py-20 text-sm text-muted-foreground" data-testid="text-no-permission">
        You do not have permission to manage device approvals.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-device-approval">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smartphone className="h-6 w-6" /> Device Approval
        </h1>
        <p className="text-sm text-muted-foreground">
          Each browser/phone is a device. New devices wait here until you
          approve them. Revoked devices can be re-approved later.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "approved" | "revoked")}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
          <TabsTrigger value="revoked" data-testid="tab-revoked">Revoked</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">{tab} devices</CardTitle>
            </CardHeader>
            <CardContent>
              {devicesQ.isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No {tab} devices.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr className="text-left">
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">Device</th>
                        <th className="py-2 pr-4">IP</th>
                        <th className="py-2 pr-4">Requested</th>
                        <th className="py-2 pr-4">Last seen</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => (
                        <tr key={d.id} className="border-b last:border-0" data-testid={`row-device-${d.id}`}>
                          <td className="py-2 pr-4">
                            <div className="font-medium">{d.userName || "(unknown)"}</div>
                            <div className="text-muted-foreground text-xs">{d.userEmail}</div>
                          </td>
                          <td className="py-2 pr-4">
                            <div className="font-medium">{d.deviceLabel}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                              {d.userAgent}
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{d.ipAddress || "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{fmt(d.requestedAt)}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{fmt(d.lastSeenAt)}</td>
                          <td className="py-2 pr-4">
                            <StatusBadge status={d.status} />
                          </td>
                          <td className="py-2 pr-4 space-x-2">
                            {d.status !== "approved" && (
                              <Button
                                size="sm"
                                onClick={() => approve.mutate(d.id)}
                                disabled={!canEdit || approve.isPending}
                                data-testid={`button-approve-${d.id}`}
                              >
                                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                            )}
                            {d.status !== "revoked" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => revoke.mutate(d.id)}
                                disabled={!canEdit || revoke.isPending}
                                data-testid={`button-revoke-${d.id}`}
                              >
                                <ShieldX className="h-3.5 w-3.5 mr-1" /> Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: DeviceRow["status"] }) {
  if (status === "approved") return <Badge variant="default">Approved</Badge>;
  if (status === "pending") return <Badge variant="secondary">Pending</Badge>;
  return <Badge variant="destructive">Revoked</Badge>;
}

function fmt(s: string | null) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString();
  } catch {
    return s;
  }
}
