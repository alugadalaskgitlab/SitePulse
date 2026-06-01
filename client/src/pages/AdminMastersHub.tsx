import {
  Users, Database, Wrench, Layers, MapPin, FlaskConical, HardHat, UserCheck,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const HUB = "/masters/hub";

export default function AdminMastersHub() {
  const { sectionVisible } = useAuth();

  return (
    <HubShell
      title="Master Data"
      subtitle="Reference data — parties, sites, materials, equipment, mix templates & personnel"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Project & Parties
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/masters/section/parties"
              icon={HardHat}
              title="Parties / Jobs"
              description="Manage contractor parties, job names & associated accounts"
              accent="blue"
              iconBg="bg-blue-50"
              enabled={sectionVisible("master_parties")}
            />
            <HubActionTile
              href="/masters/section/sites"
              icon={MapPin}
              title="Site Master"
              description="Add and manage site locations linked to parties"
              accent="emerald"
              iconBg="bg-emerald-50"
              enabled={sectionVisible("master_parties")}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Materials & Production
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/masters/section/materials"
              icon={Layers}
              title="Material Master"
              description="Define aggregate materials, bitumen, LDO & other inputs"
              accent="amber"
              iconBg="bg-amber-50"
              enabled={sectionVisible("master_materials")}
            />
            <HubActionTile
              href="/masters/section/mix-templates"
              icon={FlaskConical}
              title="Mix Templates"
              description="Configure bituminous mix designs with component proportions"
              accent="orange"
              iconBg="bg-orange-50"
              enabled={sectionVisible("master_materials")}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Equipment & Personnel
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/masters/section/equipment"
              icon={Wrench}
              title="Equipment Master"
              description="Register equipment, assign categories & manage fleet details"
              accent="slate"
              iconBg="bg-slate-50"
              enabled={sectionVisible("master_equipment")}
            />
            <HubActionTile
              href="/masters/section/personnel"
              icon={UserCheck}
              title="Personnel / Operators"
              description="Manage operator names, designations & shift assignments"
              accent="violet"
              iconBg="bg-violet-50"
              enabled={sectionVisible("master_personnel")}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Stores
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/stores/items?returnTo=${HUB}`}
              icon={Database}
              title="Store Item Catalogue"
              description="Manage store items, spare parts, tools & consumables"
              accent="teal"
              iconBg="bg-teal-50"
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
