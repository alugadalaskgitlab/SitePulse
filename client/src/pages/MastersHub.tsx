import {
  Users, Package, Receipt, Settings, RefreshCw, TrendingUp, Shield,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

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
      subtitle="Parties, materials, equipment & personnel"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Master Data
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/admin/settings"
              icon={Settings}
              title="App Settings & Master Data"
              description="Manage party master, equipment master, plant config & site settings"
              accent="slate"
              iconBg="bg-slate-100"
            />
            <HubActionTile
              href="/plant/rate-cards"
              icon={Receipt}
              title="Rate Cards"
              description="Equipment, material, transport & labour rate cards for billing"
              accent="blue"
              iconBg="bg-blue-50"
            />
            <HubActionTile
              href="/stores/items"
              icon={Package}
              title="Item / Material Master"
              description="Manage store items, categories & unit of measurement"
              accent="orange"
              iconBg="bg-orange-50"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            User & Device Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/admin/users"
              icon={Users}
              title="User Management"
              description="Add users, assign roles, set permissions & manage access"
              accent="violet"
              iconBg="bg-violet-50"
            />
            <HubActionTile
              href="/admin/devices"
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
            Estimator & Tools
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/estimator-login"
              icon={TrendingUp}
              title="Estimates Manager"
              description="Bituminous mix calculator, concrete BOQ analysis & saved estimates"
              accent="teal"
              iconBg="bg-teal-50"
            />
            <HubActionTile
              href="/plant/data-sync"
              icon={RefreshCw}
              title="Data Sync & Export"
              description="Export or import selected table data for backup & transfer"
              accent="amber"
              iconBg="bg-amber-50"
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
