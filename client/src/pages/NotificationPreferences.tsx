import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell, BellOff, Save, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PERMISSION_GROUPS, SECTION_LABELS, type SectionKey, type PermissionMatrix } from "@shared/permissions";

function hasViewOrCreate(matrix: PermissionMatrix, key: SectionKey): boolean {
  const row = matrix[key];
  if (!row) return false;
  return row.view || row.create;
}

export default function NotificationPreferences() {
  const { permissions, isAdmin, refresh } = useAuth();
  const { toast } = useToast();

  const [notifyMap, setNotifyMap] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const key of Object.keys(permissions) as SectionKey[]) {
      initial[key] = !!permissions[key]?.notify;
    }
    setNotifyMap(initial);
    setDirty(false);
  }, [permissions]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      const res = await apiRequest("PUT", "/api/auth/me/notify-preferences", patch);
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: async () => {
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setDirty(false);
      toast({ title: "Preferences saved", description: "Your notification subscriptions have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save preferences. Please try again.", variant: "destructive" });
    },
  });

  function toggle(key: SectionKey, value: boolean) {
    setNotifyMap((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    saveMutation.mutate(notifyMap);
  }

  const visibleGroups = PERMISSION_GROUPS.filter((g) => {
    if (g.id === "legacy") return false;
    if (isAdmin) return g.sections.length > 0;
    return g.sections.some((s) => hasViewOrCreate(permissions, s));
  });

  const subscribedCount = Object.values(notifyMap).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
        <Bell className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">
            Subscribed to <span className="text-orange-600 font-semibold">{subscribedCount}</span> section{subscribedCount !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Push alerts are sent only for sections you subscribe to. You can change this at any time.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          size="sm"
          className="flex-shrink-0 gap-1.5"
          data-testid="button-save-notify-prefs"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save
        </Button>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <BellOff className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-slate-700">No accessible sections</p>
          <p className="text-xs text-slate-500">You don't have access to any sections that support notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => {
            const sections = isAdmin
              ? group.sections
              : group.sections.filter((s) => hasViewOrCreate(permissions, s));
            if (sections.length === 0) return null;

            const allOn = sections.every((s) => notifyMap[s]);
            const someOn = sections.some((s) => notifyMap[s]);

            return (
              <div key={group.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
                  <button
                    className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors"
                    onClick={() => {
                      const newVal = !allOn;
                      const patch: Record<string, boolean> = {};
                      sections.forEach((s) => { patch[s] = newVal; });
                      setNotifyMap((prev) => ({ ...prev, ...patch }));
                      setDirty(true);
                    }}
                    data-testid={`button-toggle-group-${group.id}`}
                  >
                    {allOn ? "Unsubscribe all" : someOn ? "Subscribe all" : "Subscribe all"}
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {sections.map((s) => (
                    <div key={s} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        {notifyMap[s] ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <BellOff className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                        )}
                        <span className="text-sm text-slate-700 truncate">{SECTION_LABELS[s]}</span>
                      </div>
                      <Switch
                        checked={!!notifyMap[s]}
                        onCheckedChange={(v) => toggle(s, v)}
                        data-testid={`switch-notify-${s}`}
                        aria-label={`Notify for ${SECTION_LABELS[s]}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          className="gap-2"
          data-testid="button-save-notify-prefs-bottom"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save preferences
        </Button>
      </div>
    </div>
  );
}
