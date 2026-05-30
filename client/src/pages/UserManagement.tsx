import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  ACTIONS,
  ACTION_LABELS,
  emptyMatrix,
  fullMatrix,
  type PermissionMatrix,
  type SectionKey,
  type Action,
  type SessionPolicy,
} from "@shared/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ShieldCheck,
  UserCog,
  KeyRound,
  Plus,
  Copy,
  Pencil,
  ArrowLeft,
  MapPin,
} from "lucide-react";

type SafeUser = {
  id: number;
  email: string | null;
  phone: string | null;
  fullName: string;
  isAdmin: boolean;
  isActive: boolean;
  notificationsEnabled: boolean;
  sessionPolicy: SessionPolicy;
  createdAt?: string;
};

// Map server-side error codes to operator-friendly toast text. Accepts
// both `email_in_use` (per the task spec) and `email_exists` (the code
// the existing PATCH route actually emits) so this stays correct even
// if the server message is renamed later.
function friendlyUserError(raw: string): string {
  if (/email_in_use|email_exists/i.test(raw)) {
    return "That email is already used by another user.";
  }
  if (/phone_exists/i.test(raw)) {
    return "That phone number is already used by another user.";
  }
  if (/at_least_one_contact_required/i.test(raw)) {
    return "At least one of email or phone must be set for this user.";
  }
  if (/cannot_demote_last_admin/i.test(raw)) {
    return "There must always be at least one active admin. Promote another user to admin first.";
  }
  return raw;
}

export default function UserManagement() {
  const { user, permissions } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Matrix-based gates. Admin users implicitly have every permission.
  const userMgmt = permissions["user_management"];
  const canView = !!user?.isAdmin || !!userMgmt?.view;
  const canCreate = !!user?.isAdmin || !!userMgmt?.create;
  const canEdit = !!user?.isAdmin || !!userMgmt?.edit;

  const usersQ = useQuery<SafeUser[]>({ queryKey: ["/api/auth/users"] });

  const subsQ = useQuery<{ userId: number; count: number }[]>({
    queryKey: ["/api/push/subscriptions"],
    enabled: canView,
  });

  const subCountByUser = useMemo<Record<number, number>>(() => {
    const counts: Record<number, number> = {};
    for (const s of subsQ.data ?? []) {
      counts[s.userId] = s.count;
    }
    return counts;
  }, [subsQ.data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [permsUserId, setPermsUserId] = useState<number | null>(null);
  const [pwUserId, setPwUserId] = useState<number | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  if (!canView) {
    return (
      <div className="text-center py-20 text-sm text-muted-foreground" data-testid="text-no-permission">
        You do not have permission to view user management.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-user-management">
      <Link
        href={new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("returnTo") || "/admin/hub"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="link-back-home"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6" /> User Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Create users, set permissions, and reset passwords. Only an admin
            can change accounts; users cannot reset their own passwords.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={!canCreate}
          data-testid="button-create-user"
        >
          <Plus className="h-4 w-4 mr-2" /> New User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Session</th>
                    <th className="py-2 pr-4">Active</th>
                    <th className="py-2 pr-4">Notif.</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersQ.data ?? []).map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      canEdit={canEdit}
                      deviceCount={subCountByUser[u.id] ?? 0}
                      onEdit={() => setEditUserId(u.id)}
                      onPerms={() => setPermsUserId(u.id)}
                      onResetPw={() => setPwUserId(u.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateUserDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {permsUserId !== null && (
        <PermissionsDialog
          userId={permsUserId}
          users={usersQ.data ?? []}
          onClose={() => setPermsUserId(null)}
        />
      )}
      {pwUserId !== null && (
        <PasswordResetDialog
          userId={pwUserId}
          users={usersQ.data ?? []}
          onClose={() => setPwUserId(null)}
        />
      )}
      {editUserId !== null && (
        <EditUserDialog
          userId={editUserId}
          users={usersQ.data ?? []}
          onClose={() => setEditUserId(null)}
        />
      )}
    </div>
  );
}

function UserRow({
  user,
  canEdit,
  deviceCount,
  onEdit,
  onPerms,
  onResetPw,
}: {
  user: SafeUser;
  canEdit: boolean;
  deviceCount: number;
  onEdit: () => void;
  onPerms: () => void;
  onResetPw: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const patch = useMutation({
    mutationFn: async (body: Partial<SafeUser>) => {
      const r = await apiRequest("PATCH", `/api/auth/users/${user.id}`, body);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/users"] });
    },
    onError: (e: Error | { message?: string }) => {
      toast({
        title: "Couldn't update user",
        description: friendlyUserError(e?.message || ""),
        variant: "destructive",
      });
    },
  });

  return (
    <tr className="border-b last:border-0" data-testid={`row-user-${user.id}`}>
      <td className="py-2 pr-4 font-medium">{user.fullName}</td>
      <td className="py-2 pr-4 text-muted-foreground">
        {user.email ?? <span className="text-xs italic">{user.phone ?? "—"}</span>}
      </td>
      <td className="py-2 pr-4">
        {user.isAdmin ? (
          <Badge variant="default">Admin</Badge>
        ) : (
          <Badge variant="secondary">User</Badge>
        )}
      </td>
      <td className="py-2 pr-4">
        <Select
          value={user.sessionPolicy}
          onValueChange={(v) => patch.mutate({ sessionPolicy: v as SessionPolicy })}
        >
          <SelectTrigger className="w-28 h-8" data-testid={`select-session-${user.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strict">Strict (5m)</SelectItem>
            <SelectItem value="sticky">Sticky (30d)</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-4">
        <Switch
          checked={user.isActive}
          disabled={!canEdit}
          onCheckedChange={(v) => patch.mutate({ isActive: v })}
          data-testid={`switch-active-${user.id}`}
        />
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={user.notificationsEnabled}
            disabled={!canEdit}
            onCheckedChange={(v) => patch.mutate({ notificationsEnabled: v })}
            data-testid={`switch-notif-${user.id}`}
          />
          {deviceCount > 0 ? (
            <span
              className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
              data-testid={`badge-devices-${user.id}`}
            >
              {deviceCount} device{deviceCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground" data-testid={`badge-devices-${user.id}`}>0 devices</span>
          )}
        </div>
      </td>
      <td className="py-2 pr-4">
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={!canEdit}
            data-testid={`button-edit-${user.id}`}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onPerms}
            disabled={user.isAdmin || !canEdit}
            data-testid={`button-perms-${user.id}`}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Permissions
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onResetPw}
            disabled={!canEdit}
            data-testid={`button-pw-${user.id}`}
          >
            <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset PW
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CreateUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [policy, setPolicy] = useState<SessionPolicy>("strict");

  const create = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/users", {
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        fullName: fullName.trim(),
        password,
        isAdmin,
        notificationsEnabled,
        sessionPolicy: policy,
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "User created" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users"] });
      onClose();
    },
    onError: (e: Error | { message?: string }) => {
      toast({
        title: "Couldn't create user",
        description: e?.message || "",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} data-testid="input-new-fullname" />
          </div>
          <div>
            <Label>Email <span className="text-muted-foreground font-normal">(optional if phone provided)</span></Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-new-email" />
          </div>
          <div>
            <Label>Phone <span className="text-muted-foreground font-normal">(optional if email provided)</span></Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" data-testid="input-new-phone" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-new-password" />
            <p className="text-xs text-muted-foreground mt-1">
              Minimum 8 characters. Share this with the user; only an admin can
              reset it later.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isAdmin">Admin</Label>
            <Switch id="isAdmin" checked={isAdmin} onCheckedChange={setIsAdmin} data-testid="switch-new-admin" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="notifEnabled">Push notifications</Label>
            <Switch id="notifEnabled" checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} data-testid="switch-new-notif" />
          </div>
          <div>
            <Label>Session policy</Label>
            <Select value={policy} onValueChange={(v) => setPolicy(v as SessionPolicy)}>
              <SelectTrigger data-testid="select-new-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict — 5 min idle, tab close ends session</SelectItem>
                <SelectItem value="sticky">Sticky — 30 days max, tab close ends session</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={(!email.trim() && !phone.trim()) || !fullName.trim() || password.length < 8 || create.isPending}
            data-testid="button-create-user-confirm"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  userId,
  users,
  onClose,
}: {
  userId: number;
  users: SafeUser[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser, refresh } = useAuth();
  const target = users.find((u) => u.id === userId);

  const [fullName, setFullName] = useState(target?.fullName ?? "");
  const [email, setEmail] = useState(target?.email ?? "");
  const [phone, setPhone] = useState(target?.phone ?? "");
  const [isAdmin, setIsAdmin] = useState(target?.isAdmin ?? false);
  const [notifEnabled, setNotifEnabled] = useState(target?.notificationsEnabled ?? false);
  const [policy, setPolicy] = useState<SessionPolicy>(target?.sessionPolicy ?? "strict");

  // Build a partial patch with only changed fields so the server
  // doesn't accidentally clobber unrelated values, and so the
  // last-admin guard only fires when the operator actually toggled
  // admin/active.
  function buildPatch(): Partial<SafeUser> {
    if (!target) return {};
    const patch: Partial<SafeUser> = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    if (trimmedName && trimmedName !== target.fullName) patch.fullName = trimmedName;
    // email: send null to clear, or new value if changed
    const targetEmail = target.email ?? "";
    if (trimmedEmail.toLowerCase() !== targetEmail.toLowerCase()) {
      patch.email = trimmedEmail || null;
    }
    // phone: send null to clear, or new value if changed
    const targetPhone = target.phone ?? "";
    if (trimmedPhone !== targetPhone) {
      patch.phone = trimmedPhone || null;
    }
    if (isAdmin !== target.isAdmin) patch.isAdmin = isAdmin;
    if (notifEnabled !== target.notificationsEnabled) patch.notificationsEnabled = notifEnabled;
    if (policy !== target.sessionPolicy) patch.sessionPolicy = policy;
    return patch;
  }

  const save = useMutation({
    mutationFn: async () => {
      const patch = buildPatch();
      const r = await apiRequest("PATCH", `/api/auth/users/${userId}`, patch);
      return r.json();
    },
    onSuccess: async () => {
      toast({ title: "User updated" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users"] });
      // If the operator just edited their own row (e.g. switched the
      // admin's email from a personal address to an official one),
      // refresh the auth context so the header / Home greeting reflects
      // the new value.
      if (currentUser?.id === userId) {
        await refresh();
      }
      onClose();
    },
    onError: (e: Error | { message?: string }) => {
      toast({ title: "Save failed", description: friendlyUserError(e?.message || ""), variant: "destructive" });
    },
  });

  if (!target) {
    return null;
  }

  const dirty = Object.keys(buildPatch()).length > 0;
  // At least one of email/phone must remain set after the edit.
  const hasContact = !!email.trim() || !!phone.trim();

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user — {target.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              data-testid="input-edit-fullname"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-edit-email"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              data-testid="input-edit-phone"
            />
            <p className="text-xs text-muted-foreground mt-1">
              At least one of email or phone is required for sign-in.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-isAdmin">Admin</Label>
            <Switch
              id="edit-isAdmin"
              checked={isAdmin}
              onCheckedChange={setIsAdmin}
              data-testid="switch-edit-admin"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-notif">Push notifications</Label>
            <Switch
              id="edit-notif"
              checked={notifEnabled}
              onCheckedChange={setNotifEnabled}
              data-testid="switch-edit-notif"
            />
          </div>
          <div>
            <Label>Session policy</Label>
            <Select value={policy} onValueChange={(v) => setPolicy(v as SessionPolicy)}>
              <SelectTrigger data-testid="select-edit-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict — 5 min idle, tab close ends session</SelectItem>
                <SelectItem value="sticky">Sticky — 30 days max, tab close ends session</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-edit-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || !fullName.trim() || !hasContact || save.isPending}
            data-testid="button-edit-save"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({
  userId,
  users,
  onClose,
}: {
  userId: number;
  users: SafeUser[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const target = users.find((u) => u.id === userId);

  const permsQ = useQuery<{ matrix: PermissionMatrix; isAdmin: boolean }>({
    queryKey: ["/api/auth/users", userId, "permissions"],
  });

  const [matrix, setMatrix] = useState<PermissionMatrix>(emptyMatrix());
  useEffect(() => {
    if (permsQ.data?.matrix) setMatrix(permsQ.data.matrix);
  }, [permsQ.data?.matrix]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "PUT",
        `/api/auth/users/${userId}/permissions`,
        matrix,
      );
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Permissions saved" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users", userId, "permissions"] });
      onClose();
    },
    onError: (e: Error | { message?: string }) => {
      toast({
        title: "Save failed",
        description: e?.message || "",
        variant: "destructive",
      });
    },
  });

  const copy = useMutation({
    mutationFn: async (fromUserId: number) => {
      const r = await apiRequest(
        "POST",
        `/api/auth/users/${userId}/copy-permissions`,
        { fromUserId },
      );
      return r.json();
    },
    onSuccess: (j: { matrix: PermissionMatrix }) => {
      if (j?.matrix) setMatrix(j.matrix);
      toast({ title: "Copied permissions" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users", userId, "permissions"] });
    },
    onError: (e: Error | { message?: string }) => {
      toast({ title: "Copy failed", description: e?.message || "", variant: "destructive" });
    },
  });

  function toggleCell(section: SectionKey, action: Action) {
    setMatrix((prev) => ({
      ...prev,
      [section]: { ...prev[section], [action]: !prev[section][action] },
    }));
  }
  function setAllForSection(section: SectionKey, value: boolean) {
    setMatrix((prev) => ({
      ...prev,
      [section]: {
        view: value,
        create: value,
        edit: value,
        delete: value,
        view_reports: value,
        export: value,
      },
    }));
  }
  function setAllForSubGroup(sections: SectionKey[], value: boolean) {
    setMatrix((prev) => {
      const next = { ...prev };
      for (const s of sections) {
        next[s] = { view: value, create: value, edit: value, delete: value, view_reports: value, export: value };
      }
      return next;
    });
  }

  const otherUsers = users.filter((u) => u.id !== userId && !u.isAdmin);

  const TAB_GROUPS: { id: string; label: string; sections: SectionKey[] }[] = [
    {
      id: "site",
      label: "Site",
      sections: ["dashboard", "site_dprs", "site_materials", "site_procurement", "site_diesel"],
    },
    {
      id: "plant",
      label: "Plant",
      sections: [],
    },
    {
      id: "finance",
      label: "Finance",
      sections: ["vendor_bills", "reports"],
    },
    {
      id: "stores",
      label: "Stores",
      sections: ["stores_inventory"],
    },
    {
      id: "masters",
      label: "Masters",
      sections: ["admin_settings"],
    },
    {
      id: "admin",
      label: "Admin",
      sections: ["user_management", "device_approval"],
    },
    {
      id: "plant-cards",
      label: "Plant Cards",
      sections: ["hmp_operations", "rmc_operations", "reports_analysis", "estimates_manager", "app_management"],
    },
    {
      id: "site-access",
      label: "Site Access",
      sections: [],
    },
  ];

  function PermMatrix({ sections, labelOverrides, rowKeySuffix }: { sections: SectionKey[]; labelOverrides?: Partial<Record<SectionKey, string>>; rowKeySuffix?: string }) {
    return (
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 min-w-[160px]">Section</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-2 py-2 text-center whitespace-nowrap text-xs">
                  {ACTION_LABELS[a]}
                </th>
              ))}
              <th className="px-2 py-2 text-center text-xs">All</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const row = matrix[s];
              const all = ACTIONS.every((a) => row[a]);
              const rowKey = rowKeySuffix ? `${s}-${rowKeySuffix}` : s;
              return (
                <tr key={rowKey} className="border-t" data-testid={`row-perm-${rowKey}`}>
                  <td className="px-3 py-2 font-medium text-xs">{labelOverrides?.[s] ?? SECTION_LABELS[s]}</td>
                  {ACTIONS.map((a) => (
                    <td key={a} className="text-center px-2 py-2">
                      <Checkbox
                        checked={row[a]}
                        onCheckedChange={() => toggleCell(s, a)}
                        data-testid={`checkbox-${rowKey}-${a}`}
                      />
                    </td>
                  ))}
                  <td className="text-center px-2 py-2">
                    <Checkbox
                      checked={all}
                      onCheckedChange={(v) => setAllForSection(s, !!v)}
                      data-testid={`checkbox-${rowKey}-all`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Permissions — {target?.fullName} ({target?.email ?? target?.phone ?? "—"})
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={() => setMatrix(fullMatrix())} data-testid="button-perms-all">
            Grant all
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMatrix(emptyMatrix())} data-testid="button-perms-none">
            Revoke all
          </Button>
          {otherUsers.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <Select onValueChange={(v) => copy.mutate(Number(v))}>
                <SelectTrigger className="w-56" data-testid="select-copy-from">
                  <SelectValue placeholder="Copy from another user…" />
                </SelectTrigger>
                <SelectContent>
                  {otherUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Tabs defaultValue="site">
          <TabsList className="mb-2">
            {TAB_GROUPS.map((g) => (
              <TabsTrigger key={g.id} value={g.id} data-testid={`tab-perms-${g.id}`}>
                {g.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TAB_GROUPS.map((g) => (
            <TabsContent key={g.id} value={g.id} className="max-h-[50vh] overflow-y-auto">
              {g.id === "plant" ? (
                <div className="space-y-5">
                  {(
                    [
                      {
                        label: "Operations",
                        sections: ["plant_shift_logs", "plant_heating", "plant_equipment", "plant_production", "plant_materials", "site_procurement", "site_diesel"] as SectionKey[],
                      },
                      {
                        label: "Management",
                        sections: ["plant_stock", "plant_variance", "plant_audit", "plant_diesel_proc", "plant_bitumen", "plant_ldo"] as SectionKey[],
                      },
                      {
                        label: "Reports",
                        sections: ["plant_daily_reports", "plant_heating"] as SectionKey[],
                        labelOverrides: { plant_heating: "Heating Trends" } as Partial<Record<SectionKey, string>>,
                        rowKeySuffix: "reports",
                      },
                      {
                        label: "Masters",
                        sections: ["master_parties", "master_materials", "master_equipment", "master_personnel"] as SectionKey[],
                      },
                    ] as { label: string; sections: SectionKey[]; labelOverrides?: Partial<Record<SectionKey, string>>; rowKeySuffix?: string; note?: string }[]
                  ).map((sub) => {
                    const subGroupAll = sub.sections.length > 0 && sub.sections.every((s) => ACTIONS.every((a) => matrix[s][a]));
                    return (
                    <div key={sub.label}>
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 border-b mb-2">
                        <span>{sub.label}</span>
                        <label className="flex items-center gap-1.5 cursor-pointer normal-case font-normal text-xs tracking-normal">
                          <Checkbox
                            checked={subGroupAll}
                            onCheckedChange={(v) => setAllForSubGroup(sub.sections, !!v)}
                            data-testid={`checkbox-subgroup-${sub.label.toLowerCase()}-all`}
                          />
                          Grant all
                        </label>
                      </div>
                      {sub.sections.length > 0 && (
                        <PermMatrix
                          sections={sub.sections}
                          labelOverrides={sub.labelOverrides}
                          rowKeySuffix={sub.rowKeySuffix}
                        />
                      )}
                      {sub.note && (
                        <p className="text-xs text-muted-foreground mt-2 px-1 italic">{sub.note}</p>
                      )}
                    </div>
                  ); })}
                </div>
              ) : g.id === "stores" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 border-b">
                    <span>Stores &amp; Inventory</span>
                    <label className="flex items-center gap-1.5 cursor-pointer normal-case font-normal text-xs tracking-normal">
                      <Checkbox
                        checked={g.sections.length > 0 && g.sections.every((s) => ACTIONS.every((a) => matrix[s][a]))}
                        onCheckedChange={(v) => setAllForSubGroup(g.sections, !!v)}
                        data-testid="checkbox-tab-stores-all"
                      />
                      Grant all
                    </label>
                  </div>
                  <div className="flex items-center gap-2 px-1 pb-1">
                    <span className="text-xs text-muted-foreground">Quick presets:</span>
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2" data-testid="button-stores-preset-engineer"
                      onClick={() => setMatrix(prev => ({ ...prev, stores_inventory: { view: true, create: false, edit: false, delete: false, view_reports: false, export: false } }))}>
                      Engineer (view only)
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2" data-testid="button-stores-preset-manager"
                      onClick={() => setMatrix(prev => ({ ...prev, stores_inventory: { view: true, create: true, edit: true, delete: false, view_reports: true, export: true } }))}>
                      Manager (create &amp; edit)
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2" data-testid="button-stores-preset-admin"
                      onClick={() => setAllForSection("stores_inventory", true)}>
                      Admin (full)
                    </Button>
                  </div>
                  <PermMatrix sections={g.sections} />
                </div>
              ) : g.id === "site-access" ? (
                <SiteAccessTab userId={userId} isAdmin={permsQ.data?.isAdmin ?? false} />
              ) : (
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 border-b mb-2">
                    <span>{g.label}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer normal-case font-normal text-xs tracking-normal">
                      <Checkbox
                        checked={g.sections.length > 0 && g.sections.every((s) => ACTIONS.every((a) => matrix[s][a]))}
                        onCheckedChange={(v) => setAllForSubGroup(g.sections, !!v)}
                        data-testid={`checkbox-tab-${g.id}-all`}
                      />
                      Grant all
                    </label>
                  </div>
                  <PermMatrix sections={g.sections} />
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-perms">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SiteAccessTab({ userId, isAdmin }: { userId: number; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const sitesQ = useQuery<{ id: number; name: string; isActive: number }[]>({
    queryKey: ["/api/sites"],
  });

  const accessQ = useQuery<{ siteIds: number[]; allSites: boolean }>({
    queryKey: ["/api/auth/users", userId, "site-access"],
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [allSites, setAllSites] = useState(true);

  useEffect(() => {
    if (accessQ.data) {
      setAllSites(accessQ.data.allSites);
      setSelectedIds(new Set(accessQ.data.siteIds));
    }
  }, [accessQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const siteIds = allSites ? [] : Array.from(selectedIds);
      const r = await apiRequest("PUT", `/api/auth/users/${userId}/site-access`, { siteIds });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Site access saved" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users", userId, "site-access"] });
    },
    onError: (e: Error | { message?: string }) => {
      toast({ title: "Save failed", description: (e as Error)?.message ?? "", variant: "destructive" });
    },
  });

  const activeSites = (sitesQ.data ?? []).filter((s) => s.isActive !== 0);

  if (accessQ.isLoading || sitesQ.isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This user is an Admin — they always see all sites regardless of site access settings.
        </div>
      )}
      <div className="flex items-center gap-3 px-1">
        <Switch
          id="all-sites-toggle"
          checked={allSites}
          onCheckedChange={(v) => {
            setAllSites(v);
            if (v) setSelectedIds(new Set());
          }}
          data-testid="switch-all-sites"
        />
        <label htmlFor="all-sites-toggle" className="text-sm font-medium cursor-pointer">
          All sites (Admin behaviour — no restrictions)
        </label>
      </div>
      {!allSites && (
        <div className="border rounded overflow-hidden">
          <div className="bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> Permitted sites
          </div>
          <div className="max-h-56 overflow-y-auto divide-y">
            {activeSites.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">No active sites found.</p>
            )}
            {activeSites.map((site) => (
              <label
                key={site.id}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm"
                data-testid={`row-site-access-${site.id}`}
              >
                <Checkbox
                  checked={selectedIds.has(site.id)}
                  onCheckedChange={(v) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(site.id); else next.delete(site.id);
                      return next;
                    });
                  }}
                  data-testid={`checkbox-site-${site.id}`}
                />
                {site.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-site-access">
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save Site Access
        </Button>
      </div>
    </div>
  );
}

function PasswordResetDialog({
  userId,
  users,
  onClose,
}: {
  userId: number;
  users: SafeUser[];
  onClose: () => void;
}) {
  const target = users.find((u) => u.id === userId);
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const reset = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/auth/users/${userId}/password`,
        { newPassword: pw },
      );
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset" });
      onClose();
    },
    onError: (e: Error | { message?: string }) => {
      toast({
        title: "Reset failed",
        description: e?.message || "",
        variant: "destructive",
      });
    },
  });
  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password — {target?.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>New password</Label>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-reset-pw" />
          <p className="text-xs text-muted-foreground">
            Minimum 8 characters. Share with the user; they cannot change it
            themselves.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => reset.mutate()} disabled={pw.length < 8 || reset.isPending} data-testid="button-confirm-reset-pw">
            {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
