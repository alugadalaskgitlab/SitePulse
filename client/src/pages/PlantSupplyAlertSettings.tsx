import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellRing } from "lucide-react";
import { Link } from "wouter";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type Choice = { roles: string[]; userIds: number[] };
type Settings = { running_low: Choice; exhausted: Choice; borrowed: Choice };
type Options = { roles: Array<{ id: number; name: string }>; users: Array<{ id: number; fullName: string; isOwner: boolean }>; settings: Settings };

async function fetchSettings(): Promise<Options> {
  const response = await fetch("/api/plant-module/supply-alert-settings", { credentials: "include" });
  if (!response.ok) throw new Error((await response.text()) || response.statusText);
  return response.json();
}

export default function PlantSupplyAlertSettings() {
  const { isOwner } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery<Options>({
    queryKey: ["/api/plant-module/supply-alert-settings"],
    queryFn: fetchSettings,
    enabled: isOwner,
  });
  const [settings, setSettings] = useState<Settings | null>(null);
  const current = settings ?? query.data?.settings;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("Settings have not loaded.");
      return apiRequest("PUT", "/api/plant-module/supply-alert-settings", current);
    },
    onSuccess: async () => {
      setSettings(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/plant-module/supply-alert-settings"] });
      toast({ title: "Alert recipients saved" });
    },
    onError: error => toast({ title: "Could not save settings", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });

  const toggle = (key: keyof Settings, type: "roles" | "userIds", value: string | number, checked: boolean) => {
    if (!current) return;
    const existing = current[key][type] as Array<string | number>;
    const next = checked ? [...existing, value] : existing.filter(item => item !== value);
    setSettings({ ...current, [key]: { ...current[key], [type]: next } });
  };

  if (!isOwner) return <HubShell title="Plant supply alert settings" subtitle="Owner only" backHref="/plant/supply-orders" backLabel="Supply orders"><div className="p-6">Only the Owner can manage these settings.</div></HubShell>;

  return (
    <HubShell title="Plant supply alert settings" subtitle="Choose who receives plant supply alerts" backHref="/plant/supply-orders" backLabel="Supply orders">
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <BellRing className="h-6 w-6 text-teal-700" />
          <div><h1 className="text-xl font-semibold">Plant supply alert recipients</h1><p className="text-sm text-slate-600">Alerts appear in the app bell and are sent by push to the same recipients.</p></div>
        </div>
        {query.isLoading && <p className="text-sm text-slate-500">Loading recipients…</p>}
        {query.isError && <p className="text-sm text-red-700">Could not load alert settings.</p>}
        {current && ([
          { key: "running_low" as const, title: "Running low", note: "Also receives the 7:00 AM IST summary when there are open orders." },
          { key: "exhausted" as const, title: "Party stock exhausted", note: "Sent when party-scope stock reaches zero or below." },
          { key: "borrowed" as const, title: "Borrowed from HLC", note: "Owner accounts are always included, in addition to these recipients." },
        ].map(section => (
          <Card key={section.key}>
            <CardHeader><CardTitle className="text-base">{section.title}</CardTitle><p className="text-sm text-slate-500">{section.note}</p></CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div>
                <h2 className="mb-2 text-sm font-semibold">Roles</h2>
                {query.data?.roles.map(role => (
                  <label key={role.id} className="flex min-h-10 items-center gap-2 text-sm">
                    <Checkbox
                      checked={current[section.key].roles.includes(role.name)}
                      onCheckedChange={value => toggle(section.key, "roles", role.name, value === true)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold">Named users</h2>
                {query.data?.users.filter(user => !user.isOwner).map(user => (
                  <label key={user.id} className="flex min-h-10 items-center gap-2 text-sm">
                    <Checkbox
                      checked={current[section.key].userIds.includes(user.id)}
                      onCheckedChange={value => toggle(section.key, "userIds", user.id, value === true)}
                    />
                    {user.fullName}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        )))}
        <div className="flex justify-end gap-2">
          <Link href="/plant/supply-orders"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to orders</Button></Link>
          <Button disabled={!settings || saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? "Saving…" : "Save recipients"}</Button>
        </div>
      </div>
    </HubShell>
  );
}
