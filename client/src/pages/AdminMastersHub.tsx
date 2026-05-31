import {
  Settings, Database, Wrench, Layers, MapPin, Users,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const HUB = "/masters/hub";

export default function AdminMastersHub() {
  const { isAdmin } = useAuth();

  return (
    <HubShell
      title="Master Data"
      subtitle="Reference data — parties, equipment, materials, mix templates & store items"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Plant & Operations Masters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/dashboard?tab=masters&returnTo=${HUB}`}
              icon={Settings}
              title="Plant Master Data"
              description="Parties, materials, equipment, mix templates, sites & personnel"
              accent="blue"
              iconBg="bg-blue-50"
            />
            <HubActionTile
              href={`/plant/rate-cards?returnTo=${HUB}`}
              icon={Layers}
              title="Rate Cards"
              description="Equipment, material, transport & labour rate cards for billing"
              accent="violet"
              iconBg="bg-violet-50"
              enabled={isAdmin}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Stores Masters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/stores/items?returnTo=${HUB}`}
              icon={Database}
              title="Store Item Catalogue"
              description="Manage store items, spare parts, tools & consumables"
              accent="amber"
              iconBg="bg-amber-50"
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
