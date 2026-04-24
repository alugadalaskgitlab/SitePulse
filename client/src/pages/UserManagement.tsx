import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

type SafeUser = {
  id: number;
  email: string;
  fullName: string;
  isAdmin: boolean;
  isActive: boolean;
  canUnlockRecords: boolean;
  sessionPolicy: SessionPolicy;
  createdAt?: string;
};

export default function UserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const usersQ = useQuery<SafeUser[]>({ queryKey: ["/api/auth/users"] });

  const [createOpen, setCreateOpen] = useState(false);
  const [permsUserId, setPermsUserId] = useState<number | null>(null);
  const [pwUserId, setPwUserId] = useState<number | null>(null);

  if (!user?.isAdmin) {
    return (
      <div className="text-center py-20 text-sm text-muted-foreground">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-user-management">
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
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-user">
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
                    <th className="py-2 pr-4">Unlock?</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersQ.data ?? []).map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
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
    </div>
  );
}

function UserRow({
  user,
  onPerms,
  onResetPw,
}: {
  user: SafeUser;
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
    onError: (e: any) => {
      toast({
        title: "Couldn't update user",
        description: e?.message || "",
        variant: "destructive",
      });
    },
  });

  return (
    <tr className="border-b last:border-0" data-testid={`row-user-${user.id}`}>
      <td className="py-2 pr-4 font-medium">{user.fullName}</td>
      <td className="py-2 pr-4 text-muted-foreground">{user.email}</td>
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
          onCheckedChange={(v) => patch.mutate({ isActive: v })}
          data-testid={`switch-active-${user.id}`}
        />
      </td>
      <td className="py-2 pr-4">
        <Switch
          checked={user.canUnlockRecords}
          onCheckedChange={(v) => patch.mutate({ canUnlockRecords: v })}
          data-testid={`switch-unlock-${user.id}`}
        />
      </td>
      <td className="py-2 pr-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onPerms}
            disabled={user.isAdmin}
            data-testid={`button-perms-${user.id}`}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Permissions
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onResetPw}
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
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canUnlock, setCanUnlock] = useState(false);
  const [policy, setPolicy] = useState<SessionPolicy>("strict");

  const create = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/users", {
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        isAdmin,
        canUnlockRecords: canUnlock,
        sessionPolicy: policy,
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "User created" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users"] });
      onClose();
    },
    onError: (e: any) => {
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
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-new-email" />
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
            <Label htmlFor="canUnlock">Can unlock locked records</Label>
            <Switch id="canUnlock" checked={canUnlock} onCheckedChange={setCanUnlock} data-testid="switch-new-unlock" />
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
            disabled={!email || !fullName || password.length < 8 || create.isPending}
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
    onError: (e: any) => {
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
    onSuccess: (j: any) => {
      if (j?.matrix) setMatrix(j.matrix);
      toast({ title: "Copied permissions" });
      qc.invalidateQueries({ queryKey: ["/api/auth/users", userId, "permissions"] });
    },
    onError: (e: any) => {
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
        view_reports: value,
      },
    }));
  }

  const otherUsers = users.filter((u) => u.id !== userId && !u.isAdmin);

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Permissions — {target?.fullName} ({target?.email})
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

        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Section</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-2 py-2 text-center">
                    {ACTION_LABELS[a]}
                  </th>
                ))}
                <th className="px-2 py-2 text-center">All</th>
              </tr>
            </thead>
            <tbody>
              {SECTION_KEYS.map((s) => {
                const row = matrix[s];
                const all = row.view && row.create && row.edit && row.view_reports;
                return (
                  <tr key={s} className="border-t" data-testid={`row-perm-${s}`}>
                    <td className="px-3 py-2 font-medium">{SECTION_LABELS[s]}</td>
                    {ACTIONS.map((a) => (
                      <td key={a} className="text-center px-2 py-2">
                        <Checkbox
                          checked={row[a]}
                          onCheckedChange={() => toggleCell(s, a)}
                          data-testid={`checkbox-${s}-${a}`}
                        />
                      </td>
                    ))}
                    <td className="text-center px-2 py-2">
                      <Checkbox
                        checked={all}
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
    onError: (e: any) => {
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
