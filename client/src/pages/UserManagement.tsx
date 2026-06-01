import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  ACTIONS,
  ACTION_LABELS,
  PERMISSION_GROUPS,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  ShieldHalf,
  Bell,
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
  canManagePermissions: boolean;
  permissionManagerScope: "full" | "partial" | null;
  createdAt?: string;
};

function friendlyUserError(raw: string): string {
  if (/email_in_use|email_exists/i.test(raw)) return "That email is already used by another user.";
  if (/phone_exists/i.test(raw)) return "That phone number is already used by another user.";
  if (/at_least_one_contact_required/i.test(raw)) return "At least one of email or phone must be set for this user.";
  if (/cannot_demote_last_admin/i.test(raw)) return "There must always be at least one active admin. Promote another user to admin first.";
  return raw;
}

export default function UserManagement() {
  const { user, permissions, isAdmin, canManagePermissions, permissionManagerScope } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const userMgmt = permissions["user_management"];
  const canView = isAdmin || canManagePermissions || !!userMgmt?.view;
  const canCreate = isAdmin || !!userMgmt?.create;
  const canEdit = isAdmin || canManagePermissions || !!userMgmt?.edit;

  const usersQ = useQuery<SafeUser[]>({ queryKey: ["/api/auth/users"] });

  const subsQ = useQuery<{ userId: number; count: number }[]>({
    queryKey: ["/api/push/subscriptions"],
    enabled: canView,
  });

  const subCountByUser: Record<number, number> = {};
  for (const s of subsQ.data ?? []) subCountByUser[s.userId] = s.count;

  const [createOpen, setCreateOpen] = useState(false);
  const [permsUserId, setPermsUserId] = useState<number | null>(null);
  const [pwUserId, setPwUserId] = useState<number | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  // Partial permission managers only see non-admin users.
  const visibleUsers = (usersQ.data ?? []).filter((u) => {
    if (isAdmin) return true;
    if (canManagePermissions && permissionManagerScope === "partial") return !u.isAdmin;
    return true;
  });

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
            Create users, set permissions, and reset passwords.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-user">
            <Plus className="h-4 w-4 mr-2" /> New User
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQ.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email / Phone</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Session</th>
                    <th className="py-2 pr-4">Active</th>
                    <th className="py-2 pr-4">Notif.</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      canEdit={canEdit}
                      canManagePerms={isAdmin || canManagePermissions}
                      currentUserId={user?.id ?? 0}
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

      {createOpen && <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />}
      {permsUserId !== null && (
        <PermissionsDialog
          userId={permsUserId}
          users={usersQ.data ?? []}
          onClose={() => setPermsUserId(null)}
        />
      )}
      {pwUserId !== null && (
        <PasswordResetDialog userId={pwUserId} users={usersQ.data ?? []} onClose={() => setPwUserId(null)} />
      )}
      {editUserId !== null && (
        <EditUserDialog userId={editUserId} users={usersQ.data ?? []} onClose={() => setEditUserId(null)} />
      )}
    </div>
  );
}

function UserRow({
  user,
  canEdit,
  canManagePerms,
  currentUserId,
  deviceCount,
  onEdit,
  onPerms,
  onResetPw,
}: {
  user: SafeUser;
  canEdit: boolean;
  canManagePerms: boolean;
  currentUserId: number;
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/auth/users"] }); },
    onError: (e: Error | { message?: string }) => {
      toast({ title: "Couldn't update user", description: friendlyUserError(e?.message || ""), variant: "destructive" });
    },
  });

  return (
    <tr className="border-b last:border-0" data-testid={`row-user-${user.id}`}>
      <td className="py-2 pr-4 font-medium">{user.fullName}</td>
      <td className="py-2 pr-4 text-muted-foreground text-xs">
        {user.email ?? <span className="italic">{user.phone ?? "—"}</span>}
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {user.isAdmin ? (
            <Badge variant="default">Admin</Badge>
          ) : (
            <Badge variant="secondary">User</Badge>
          )}
          {user.canManagePermissions && !user.isAdmin && (
            <Badge variant="outline" className="text-xs gap-1">
              <ShieldHalf className="h-3 w-3" />
              PM {user.permissionManagerScope === "full" ? "(full)" : "(partial)"}
            </Badge>
          )}
        </div>
      </td>
      <td className="py-2 pr-4">
        <Select value={user.sessionPolicy} onValueChange={(v) => patch.mutate({ sessionPolicy: v as SessionPolicy })}>
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
          <span className="text-xs text-muted-foreground" data-testid={`badge-devices-${user.id}`}>
            {deviceCount > 0 ? `${deviceCount}d` : "0d"}
          </span>
        </div>
      </td>
      <td className="py-2 pr-4">
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={!canEdit} data-testid={`button-edit-${user.id}`}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onPerms}
            disabled={user.isAdmin || !canManagePerms}
            data-testid={`button-perms-${user.id}`}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Permissions
          </Button>
          <Button size="sm" variant="outline" onClick={onResetPw} disabled={!canEdit} data-testid={`button-pw-${user.id}`}>
            <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset PW
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      toast({ title: "Couldn't create user", description: e?.message || "", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
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
            <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters.</p>
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
              <SelectTrigger data-testid="select-new-policy"><SelectValue /></SelectTrigger>
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

function EditUserDialog({ userId, users, onClose }: { userId: number; users: SafeUser[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser, refresh, isAdmin } = useAuth();
  const target = users.find((u) => u.id === userId);

  const [fullName, setFullName] = useState(target?.fullName ?? "");
  const [email, setEmail] = useState(target?.email ?? "");
  const [phone, setPhone] = useState(target?.phone ?? "");
  const [isAdminVal, setIsAdminVal] = useState(target?.isAdmin ?? false);
  const [notifEnabled, setNotifEnabled] = useState(target?.notificationsEnabled ?? false);
  const [policy, setPolicy] = useState<SessionPolicy>(target?.sessionPolicy ?? "strict");
  const [canMgmtPerms, setCanMgmtPerms] = useState(target?.canManagePermissions ?? false);
  const [permScope, setPermScope] = useState<"full" | "partial">(target?.permissionManagerScope ?? "partial");

  function buildPatch(): Record<string, unknown> {
    if (!target) return {};
    const patch: Record<string, unknown> = {};
    const trimmedName = fullName.trim();
    if (trimmedName && trimmedName !== target.fullName) patch.fullName = trimmedName;
    const trimmedEmail = email.trim();
    const targetEmail = target.email ?? "";
    if (trimmedEmail.toLowerCase() !== targetEmail.toLowerCase()) patch.email = trimmedEmail || null;
    const trimmedPhone = phone.trim();
    const targetPhone = target.phone ?? "";
    if (trimmedPhone !== targetPhone) patch.phone = trimmedPhone || null;
    if (isAdminVal !== target.isAdmin) patch.isAdmin = isAdminVal;
    if (notifEnabled !== target.notificationsEnabled) patch.notificationsEnabled = notifEnabled;
    if (policy !== target.sessionPolicy) patch.sessionPolicy = policy;
    if (canMgmtPerms !== target.canManagePermissions) patch.canManagePermissions = canMgmtPerms;
    if (canMgmtPerms && permScope !== target.permissionManagerScope) patch.permissionManagerScope = permScope;
    return patch;
  }

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/auth/users/${userId}`, buildPatch());
      return r.json();
    },
    onSuccess: async () => {
      toast({ title: "User updated" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users"] });
      if (currentUser?.id === userId) await refresh();
      onClose();
    },
    onError: (e: Error | { message?: string }) => {
      toast({ title: "Save failed", description: friendlyUserError(e?.message || ""), variant: "destructive" });
    },
  });

  if (!target) return null;
  const dirty = Object.keys(buildPatch()).length > 0;
  const hasContact = !!email.trim() || !!phone.trim();

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit user — {target.fullName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} data-testid="input-edit-fullname" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-edit-email" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" data-testid="input-edit-phone" />
            <p className="text-xs text-muted-foreground mt-1">At least one of email or phone is required for sign-in.</p>
          </div>
          {isAdmin && (
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-isAdmin">Admin</Label>
              <Switch id="edit-isAdmin" checked={isAdminVal} onCheckedChange={setIsAdminVal} data-testid="switch-edit-admin" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-notif">Push notifications</Label>
            <Switch id="edit-notif" checked={notifEnabled} onCheckedChange={setNotifEnabled} data-testid="switch-edit-notif" />
          </div>
          <div>
            <Label>Session policy</Label>
            <Select value={policy} onValueChange={(v) => setPolicy(v as SessionPolicy)}>
              <SelectTrigger data-testid="select-edit-policy"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict — 5 min idle, tab close ends session</SelectItem>
                <SelectItem value="sticky">Sticky — 30 days max, tab close ends session</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="border rounded p-3 space-y-2.5 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="edit-can-mgmt-perms" className="text-sm font-medium">Permission Manager</Label>
                  <p className="text-xs text-muted-foreground">Can edit other users' permissions without being admin</p>
                </div>
                <Switch
                  id="edit-can-mgmt-perms"
                  checked={canMgmtPerms}
                  onCheckedChange={setCanMgmtPerms}
                  data-testid="switch-edit-can-manage-perms"
                />
              </div>
              {canMgmtPerms && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Scope</Label>
                  <Select value={permScope} onValueChange={(v) => setPermScope(v as "full" | "partial")}>
                    <SelectTrigger className="h-8" data-testid="select-edit-perm-scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="partial">Partial — only non-admin users, capped to own permissions</SelectItem>
                      <SelectItem value="full">Full — any user (same as admin for permissions)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-edit-cancel">Cancel</Button>
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

function PermissionsDialog({ userId, users, onClose }: { userId: number; users: SafeUser[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin: currentIsAdmin, canManagePermissions, permissionManagerScope, permissions: myPerms } = useAuth();
  const target = users.find((u) => u.id === userId);

  const permsQ = useQuery<{ matrix: PermissionMatrix; isAdmin: boolean }>({
    queryKey: ["/api/auth/users", userId, "permissions"],
  });

  const [matrix, setMatrix] = useState<PermissionMatrix>(emptyMatrix());
  useEffect(() => {
    if (permsQ.data?.matrix) setMatrix(permsQ.data.matrix);
  }, [permsQ.data?.matrix]);

  const isPartialManager = !currentIsAdmin && canManagePermissions && permissionManagerScope === "partial";

  // For partial managers, a permission checkbox is only enabled if the manager themselves has that permission.
  function canGrantAction(section: SectionKey, action: Action): boolean {
    if (!isPartialManager) return true;
    return !!myPerms[section]?.[action];
  }

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PUT", `/api/auth/users/${userId}/permissions`, matrix);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Permissions saved" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users", userId, "permissions"] });
      onClose();
    },
    onError: (e: Error | { message?: string }) => {
      toast({ title: "Save failed", description: e?.message || "", variant: "destructive" });
    },
  });

  const copy = useMutation({
    mutationFn: async (fromUserId: number) => {
      const r = await apiRequest("POST", `/api/auth/users/${userId}/copy-permissions`, { fromUserId });
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
    if (!canGrantAction(section, action)) return;
    setMatrix((prev) => ({
      ...prev,
      [section]: { ...prev[section], [action]: !prev[section][action] },
    }));
  }

  function setAllForSection(section: SectionKey, value: boolean) {
    setMatrix((prev) => ({
      ...prev,
      [section]: {
        view: value && canGrantAction(section, "view"),
        create: value && canGrantAction(section, "create"),
        edit: value && canGrantAction(section, "edit"),
        delete: value && canGrantAction(section, "delete"),
        view_reports: value && canGrantAction(section, "view_reports"),
        export: value && canGrantAction(section, "export"),
        approve: value && canGrantAction(section, "approve"),
        notify: prev[section].notify, // "All" never toggles Notify — must be opted-in explicitly
      },
    }));
  }

  function setAllForGroup(sections: SectionKey[], value: boolean) {
    setMatrix((prev) => {
      const next = { ...prev };
      for (const s of sections) {
        next[s] = {
          view: value && canGrantAction(s, "view"),
          create: value && canGrantAction(s, "create"),
          edit: value && canGrantAction(s, "edit"),
          delete: value && canGrantAction(s, "delete"),
          view_reports: value && canGrantAction(s, "view_reports"),
          export: value && canGrantAction(s, "export"),
          approve: value && canGrantAction(s, "approve"),
          notify: prev[s].notify, // preserve — "Grant all" for group never toggles Notify
        };
      }
      return next;
    });
  }

  const otherUsers = users.filter((u) => u.id !== userId && !u.isAdmin);

  // Skip the legacy group unless admin is viewing.
  const visibleGroups = PERMISSION_GROUPS.filter((g) => g.id !== "legacy" || currentIsAdmin);
  // Notify is excluded from the "All" checkbox — it must be opted-in per section.
  const NON_NOTIFY_ACTIONS = ACTIONS.filter((a) => a !== "notify");

  function PermMatrix({ sections }: { sections: SectionKey[] }) {
    return (
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 min-w-[180px] font-medium">Section</th>
              {ACTIONS.map((a) => (
                <th
                  key={a}
                  className={`px-2 py-2 text-center whitespace-nowrap font-medium min-w-[52px]${a === "notify" ? " border-l border-border" : ""}`}
                  title={a === "notify" ? "Push notification — user receives an alert when this section fires an event" : undefined}
                >
                  {a === "notify" ? <Bell className="h-3.5 w-3.5 mx-auto" /> : ACTION_LABELS[a]}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium min-w-[44px]">All</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const row = matrix[s];
              // "All" checkbox only covers non-notify actions — Notify must be opted-in explicitly.
              const allGrantable = NON_NOTIFY_ACTIONS.filter((a) => canGrantAction(s, a));
              const allChecked = allGrantable.length > 0 && allGrantable.every((a) => row[a]);
              return (
                <tr key={s} className="border-t hover:bg-muted/30" data-testid={`row-perm-${s}`}>
                  <td className="px-3 py-1.5 font-medium text-xs leading-tight">{SECTION_LABELS[s]}</td>
                  {ACTIONS.map((a) => {
                    const grantable = canGrantAction(s, a);
                    return (
                      <td
                        key={a}
                        className={`text-center px-2 py-1.5${a === "notify" ? " border-l border-border" : ""}`}
                      >
                        <Checkbox
                          checked={!!row[a]}
                          disabled={!grantable}
                          onCheckedChange={() => toggleCell(s, a)}
                          data-testid={`checkbox-${s}-${a}`}
                          className={!grantable ? "opacity-30" : ""}
                        />
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-1.5">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => setAllForSection(s, !!v)}
                      data-testid={`checkbox-${s}-all`}
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

  if (permsQ.isLoading) {
    return (
      <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-5xl">
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Permissions — {target?.fullName ?? "User"}
            {isPartialManager && (
              <span className="text-xs font-normal text-muted-foreground ml-2">(Partial manager — can only grant permissions you have)</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          {!isPartialManager && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMatrix(fullMatrix())} data-testid="button-perms-all">
                Grant all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMatrix(emptyMatrix())} data-testid="button-perms-none">
                Revoke all
              </Button>
            </>
          )}
          {otherUsers.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <Select onValueChange={(v) => copy.mutate(Number(v))}>
                <SelectTrigger className="w-52 h-8" data-testid="select-copy-from">
                  <SelectValue placeholder="Copy from another user…" />
                </SelectTrigger>
                <SelectContent>
                  {otherUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1 pr-1">
          <Accordion type="multiple" defaultValue={visibleGroups.filter((g) => g.id !== "legacy").map((g) => g.id)}>
            {visibleGroups.map((group) => {
              const allGrantableInGroup = group.sections.flatMap((s) =>
                NON_NOTIFY_ACTIONS.filter((a) => canGrantAction(s, a)).map((a) => ({ s, a }))
              );
              const allChecked = allGrantableInGroup.length > 0 && allGrantableInGroup.every(({ s, a }) => matrix[s][a]);
              return (
                <AccordionItem key={group.id} value={group.id}>
                  <AccordionTrigger className="py-2 px-1 hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 mr-3">
                      <span className="text-sm font-semibold">{group.label}</span>
                      <span className="text-xs text-muted-foreground">({group.sections.length} sections)</span>
                      <label
                        className="flex items-center gap-1.5 ml-auto cursor-pointer normal-case font-normal text-xs tracking-normal"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(v) => setAllForGroup(group.sections, !!v)}
                          data-testid={`checkbox-group-${group.id}-all`}
                        />
                        Grant all
                      </label>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-0 pb-3">
                    {group.sections.length > 0 ? (
                      <PermMatrix sections={group.sections} />
                    ) : (
                      <p className="text-xs text-muted-foreground px-2 py-2 italic">No sections in this group.</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}

            <AccordionItem value="site-access">
              <AccordionTrigger className="py-2 px-1 hover:no-underline">
                <span className="text-sm font-semibold">Site Access</span>
              </AccordionTrigger>
              <AccordionContent className="pt-0 pb-3">
                <SiteAccessTab userId={userId} isAdmin={permsQ.data?.isAdmin ?? false} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter className="pt-3 border-t mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-perms">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SiteAccessTab({ userId, isAdmin }: { userId: number; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const sitesQ = useQuery<{ id: number; name: string; isActive: number }[]>({ queryKey: ["/api/sites"] });
  const accessQ = useQuery<{ siteIds: number[]; allSites: boolean }>({ queryKey: ["/api/auth/users", userId, "site-access"] });

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
          onCheckedChange={(v) => { setAllSites(v); if (v) setSelectedIds(new Set()); }}
          data-testid="switch-all-sites"
        />
        <label htmlFor="all-sites-toggle" className="text-sm font-medium cursor-pointer">
          All sites (no restrictions)
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
              <label key={site.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm" data-testid={`row-site-access-${site.id}`}>
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

function PasswordResetDialog({ userId, users, onClose }: { userId: number; users: SafeUser[]; onClose: () => void }) {
  const target = users.find((u) => u.id === userId);
  const { toast } = useToast();
  const [pw, setPw] = useState("");

  const reset = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/auth/users/${userId}/password`, { newPassword: pw });
      return r.json();
    },
    onSuccess: () => { toast({ title: "Password reset" }); onClose(); },
    onError: (e: Error | { message?: string }) => {
      toast({ title: "Reset failed", description: e?.message || "", variant: "destructive" });
    },
  });

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password — {target?.fullName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>New password</Label>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-reset-pw" />
          <p className="text-xs text-muted-foreground">Minimum 8 characters. Share with the user; they cannot change it themselves.</p>
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
