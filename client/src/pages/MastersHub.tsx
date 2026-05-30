import {
  Users, Database, RefreshCw, Shield, Settings, MapPin,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const HUB = "/admin/hub";

export default function MastersHub() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <HubShell title="Masters & Config">
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
      title="Masters & Config"
      subtitle="Reference data, user management & app administration"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Reference Data (Masters)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/dashboard?tab=masters&returnTo=${HUB}`}
              icon={Settings}
              title="Master Data"
              description="Manage parties, materials, equipment, mix templates, sites & personnel"
              accent="blue"
              iconBg="bg-blue-50"
            />
            <HubActionTile
              href={`/stores/items?returnTo=${HUB}`}
              icon={Database}
              title="Store Item Catalogue"
              description="Manage store items, spare parts, tools & consumables catalogue"
              accent="amber"
              iconBg="bg-amber-50"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            App Administration
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
            <HubActionTile
              href={`/plant/data-sync?returnTo=${HUB}`}
              icon={RefreshCw}
              title="Data Sync & Export"
              description="Export or import selected table data for backup & transfer"
              accent="amber"
              iconBg="bg-amber-50"
            />
            <HubActionTile
              href="/admin/site-backfill"
              icon={MapPin}
              title="Site Backfill"
              description="Assign sites to historical diesel requirements & purchase indents with no site set"
              accent="rose"
              iconBg="bg-rose-50"
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
