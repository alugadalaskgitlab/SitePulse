import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { EntryScope, FeatureTicks } from "@shared/featureAccess";

type Role = { id: number; name: string; scopeDefault: EntryScope; ticks: FeatureTicks };
type Person = { id: number; fullName: string; isActive: boolean };
type Site = { id: number; name: string; isActive: number };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function CreatePersonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isOwner } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [siteMode, setSiteMode] = useState<"all" | "selected">("selected");
  const [siteIds, setSiteIds] = useState<number[]>([]);
  const [reportsToUserId, setReportsToUserId] = useState("");
  const [entryScope, setEntryScope] = useState<EntryScope>("own");
  const [entryScopeTouched, setEntryScopeTouched] = useState(false);
  const [isOwnerNew, setIsOwnerNew] = useState(false);

  const rolesQuery = useQuery<{ roles: Role[] }>({
    queryKey: ["/api/access-control/roles"],
    queryFn: () => getJson("/api/access-control/roles"),
    enabled: open,
  });
  const sitesQuery = useQuery<Site[]>({
    queryKey: ["/api/sites"],
    queryFn: () => getJson("/api/sites"),
    enabled: open,
  });
  const peopleQuery = useQuery<Person[]>({
    queryKey: ["/api/auth/users"],
    queryFn: () => getJson("/api/auth/users"),
    enabled: open,
  });
  const activeSites = (sitesQuery.data ?? []).filter(site => site.isActive !== 0);
  const activePeople = (peopleQuery.data ?? []).filter(person => person.isActive);
  const create = useMutation({
    mutationFn: async () => {
      if (!email.trim() && !phone.trim()) throw new Error("Enter an email address or phone number.");
      if (!fullName.trim()) throw new Error("Enter the person's name.");
      if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
      if (!isOwnerNew && roleIds.length === 0) throw new Error("Assign at least one role.");
      if (!isOwnerNew && siteMode === "selected" && siteIds.length === 0) throw new Error("Choose at least one site.");
      const response = await apiRequest("POST", "/api/auth/users", {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        isOwner: isOwner && isOwnerNew,
        roleIds,
        entryScope,
        reportsToUserId: reportsToUserId ? Number(reportsToUserId) : null,
        siteAccess: siteMode === "all"
          ? { mode: "all" }
          : { mode: "selected", siteIds },
      });
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({ title: "Person created" });
      onClose();
    },
    onError: (error: Error) => toast({ title: "Could not create person", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1"><Label>Full name</Label><Input data-testid="input-person-name" value={fullName} onChange={event => setFullName(event.target.value)} /></label>
          <label className="grid gap-1"><Label>Email</Label><Input data-testid="input-person-email" type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label className="grid gap-1"><Label>Phone</Label><Input data-testid="input-person-phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
          <label className="grid gap-1"><Label>Initial password</Label><Input data-testid="input-person-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="grid gap-1"><Label>Reports to</Label>
            <Select value={reportsToUserId || "none"} onValueChange={value => setReportsToUserId(value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="none">No reporting line</SelectItem>
                {activePeople.map(person => <SelectItem key={person.id} value={String(person.id)}>{person.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1"><Label>Whose entries</Label>
            <Select value={entryScope} onValueChange={value => {
              setEntryScope(value as EntryScope);
              setEntryScopeTouched(true);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="own">Own</SelectItem><SelectItem value="team">Team</SelectItem><SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        {isOwner && (
          <label className="flex items-center justify-between rounded border p-3">
            <span className="font-medium">Owner</span>
            <Switch checked={isOwnerNew} onCheckedChange={setIsOwnerNew} />
          </label>
        )}

        {!isOwnerNew && (
          <section className="space-y-2">
            <h3 className="font-medium">Roles</h3>
            {rolesQuery.isError ? <p role="alert" className="text-sm text-destructive">Roles could not be loaded.</p> : null}
            {!rolesQuery.isLoading && !rolesQuery.isError && (rolesQuery.data?.roles ?? []).length === 0
              ? <p className="text-sm text-muted-foreground">No roles are set up yet.</p>
              : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(rolesQuery.data?.roles ?? []).map(role => (
                <label key={role.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <Checkbox data-testid={`checkbox-person-role-${role.id}`} checked={roleIds.includes(role.id)} onCheckedChange={checked => {
                    setRoleIds(current => checked ? [...current, role.id] : current.filter(id => id !== role.id));
                    if (checked && !entryScopeTouched && roleIds.length === 0) setEntryScope(role.scopeDefault);
                  }} />
                  {role.name}
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="font-medium">Sites</h3>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={siteMode === "selected"} onChange={() => setSiteMode("selected")} />Selected sites</label>
            <label className="flex items-center gap-2"><input type="radio" checked={siteMode === "all"} onChange={() => setSiteMode("all")} />All sites</label>
          </div>
          {siteMode === "selected" && (
            <div className="grid max-h-40 gap-2 overflow-y-auto rounded border p-3 sm:grid-cols-2">
              {activeSites.map(site => <label key={site.id} className="flex items-center gap-2 text-sm">
                <Checkbox data-testid={`checkbox-person-site-${site.id}`} checked={siteIds.includes(site.id)} onCheckedChange={checked => {
                  setSiteIds(current => checked ? [...current, site.id] : current.filter(id => id !== site.id));
                }} />{site.name}
              </label>)}
              {!sitesQuery.isLoading && activeSites.length === 0 && <p className="text-sm text-muted-foreground">No active sites found.</p>}
            </div>
          )}
        </section>
        {create.error instanceof Error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || rolesQuery.isLoading || rolesQuery.isError || (!isOwnerNew && roleIds.length === 0) || sitesQuery.isLoading}>
            {create.isPending ? "Creating…" : "Create person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
