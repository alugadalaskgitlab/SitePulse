import {
  Users, RefreshCw, Shield, MapPin, Lock, CalendarCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const HUB = "/admin/hub";

export default function MastersHub() {
  const { isAdmin } = useAuth();

  const { data: unassigned } = useQuery<{
    dieselRequirements: unknown[];
    purchaseIndents: unknown[];
  }>({
    queryKey: ["/api/admin/site-backfill/unassigned"],
    enabled: isAdmin,
  });

  const dieselCount = unassigned?.dieselRequirements?.length ?? 0;
  const indentCount = unassigned?.purchaseIndents?.length ?? 0;
  const backfillBadge = (dieselCount > 0 || indentCount > 0)
    ? `${dieselCount} diesel / ${indentCount} indent unassigned`
    : undefined;

  if (!isAdmin) {
    return (
      <HubShell title="Settings">
        <div className="p-6 flex items-center justify-center min-h-64">
          <div className="text-center">
            <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Admin access required</p>
            <p className="text-sm text-slate-400 mt-1">Contact an administrator for access.</p>
          </div>
        </div>
      </HubShell>
    );
  }

  return (
    <HubShell
      title="Settings"
      subtitle="User management, access control & app administration"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Site Operations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/site/requirements?returnTo=/admin/hub"
              icon={CalendarCheck}
              title="Site Requirements Queue"
              description="Review tomorrow's plans & immediate requirements — approve, arrange, update allocation status and respond to site needs"
              accent="teal"
              iconBg="bg-teal-50"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Access & Users
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/admin/users?returnTo=${HUB}`}
              icon={Users}
              title="User Management"
              description="Add users, assign roles, set permissions & manage access"
              accent="violet"
              iconBg="bg-violet-50"
            />
            <HubActionTile
              href={`/admin/devices?returnTo=${HUB}`}
              icon={Shield}
              title="Device Approvals"
              description="Review & approve new device login requests"
              accent="emerald"
              iconBg="bg-emerald-50"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Data & System
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/data-sync?returnTo=${HUB}`}
              icon={RefreshCw}
              title="Data Sync & Export"
              description="Export or import selected table data for backup & transfer"
              accent="amber"
              iconBg="bg-amber-50"
            />
            <HubActionTile
              href={`/admin/settings?returnTo=${HUB}`}
              icon={Lock}
              title="System Settings"
              description="Admin & manager PIN management, LDO tank defaults"
              accent="slate"
              iconBg="bg-slate-50"
            />
            <HubActionTile
              href="/admin/site-backfill"
              icon={MapPin}
              title="Site Backfill"
              description="Assign sites to historical diesel requirements & purchase indents with no site set"
              accent="rose"
              iconBg="bg-rose-50"
              badge={backfillBadge}
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
