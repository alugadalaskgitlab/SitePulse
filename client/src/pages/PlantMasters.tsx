import { useParams } from "wouter";
import { Link } from "wouter";
import { ChevronLeft, HardHat, MapPin, Layers, FlaskConical, Wrench, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PartyMaster,
  SitesMasterSection,
  MaterialMaster,
  MixTemplateMaster,
  EquipmentMasterSection,
  PersonnelMasterSection,
} from "@/pages/Plant";

const SECTIONS = {
  parties: {
    title: "Parties / Jobs",
    subtitle: "Manage contractor parties, job names & associated accounts",
    Icon: HardHat,
    Component: PartyMaster,
  },
  sites: {
    title: "Site Master",
    subtitle: "Add and manage site locations linked to parties",
    Icon: MapPin,
    Component: SitesMasterSection,
  },
  materials: {
    title: "Material Master",
    subtitle: "Define aggregate materials, bitumen, LDO & other inputs",
    Icon: Layers,
    Component: MaterialMaster,
  },
  "mix-templates": {
    title: "Mix Templates",
    subtitle: "Configure bituminous mix designs with component proportions",
    Icon: FlaskConical,
    Component: MixTemplateMaster,
  },
  equipment: {
    title: "Equipment Master",
    subtitle: "Register equipment, assign categories & manage fleet details",
    Icon: Wrench,
    Component: EquipmentMasterSection,
  },
  personnel: {
    title: "Personnel / Operators",
    subtitle: "Manage operator names, designations & shift assignments",
    Icon: Users,
    Component: PersonnelMasterSection,
  },
} as const;

type SectionKey = keyof typeof SECTIONS;

export default function PlantMasters() {
  const params = useParams<{ section: string }>();
  const section = params.section as SectionKey;
  const config = SECTIONS[section];

  if (!config) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-muted-foreground">Section not found.</p>
      </div>
    );
  }

  const { title, subtitle, Icon, Component } = config;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/masters/hub">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            data-testid="button-back-masters-hub"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate">
              {title}
            </h1>
            <p className="text-sm text-slate-500 truncate hidden sm:block">{subtitle}</p>
          </div>
        </div>
      </div>

      <Component />
    </div>
  );
}
