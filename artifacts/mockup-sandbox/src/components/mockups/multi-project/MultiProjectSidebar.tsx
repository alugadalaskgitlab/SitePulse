import { useState } from "react";
import { Building2, MapPin, BarChart3, ChevronDown, ChevronRight, Home, FileText, Truck, Package, Fuel, Users, Settings, Bell, ShieldCheck, ChevronsUpDown, ClipboardList, Wrench } from "lucide-react";

const projects = [
  { id: 1, code: "NH66-P3", name: "NH-66 Package 3", color: "bg-violet-500" },
  { id: 2, code: "RR-P2", name: "Ring Road Phase 2", color: "bg-amber-500" },
  { id: 3, code: "BR-SHP", name: "Shapur Bridge", color: "bg-blue-500" },
];

const roads = [
  "Km 0–12 · Uppala–Nileshwar",
  "Km 12–24 · Nileshwar–Kanhangad",
  "Km 24–31 · Kanhangad–Cheruvathur",
];

type Section = "site" | "plant" | "procurement" | null;

export function MultiProjectSidebar() {
  const [activeProject, setActiveProject] = useState(1);
  const [projectOpen, setProjectOpen] = useState(false);
  const [expanded, setExpanded] = useState<Section>("site");
  const [activeRoad, setActiveRoad] = useState(0);
  const proj = projects.find(p => p.id === activeProject)!;

  const toggle = (s: Section) => setExpanded(v => v === s ? null : s);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans flex">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-900 text-white flex flex-col h-screen sticky top-0">
        {/* Company + project switcher */}
        <div className="px-3 pt-4 pb-3 border-b border-zinc-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-amber-500 rounded text-black text-[10px] font-bold flex items-center justify-center shrink-0">HLC</div>
            <div className="text-[11px] text-zinc-300 font-medium truncate">High Lane Constructions</div>
          </div>
          {/* Project picker */}
          <button
            onClick={() => setProjectOpen(v => !v)}
            className="w-full flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-md px-2.5 py-2 transition-colors"
          >
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${proj.color}`} />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[11px] font-semibold text-white truncate">{proj.name}</div>
              <div className="text-[9px] text-zinc-400 font-mono">{proj.code}</div>
            </div>
            <ChevronsUpDown className="w-3 h-3 text-zinc-400 shrink-0" />
          </button>
          {projectOpen && (
            <div className="mt-1.5 bg-zinc-800 rounded-md overflow-hidden border border-zinc-700">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProject(p.id); setProjectOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-zinc-700 transition-colors ${p.id === activeProject ? "bg-zinc-700" : ""}`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.color}`} />
                  <div>
                    <div className="text-[11px] font-medium text-white">{p.name}</div>
                    <div className="text-[9px] text-zinc-400 font-mono">{p.code}</div>
                  </div>
                </button>
              ))}
              <div className="border-t border-zinc-700 px-2.5 py-2">
                <button className="text-[10px] text-zinc-400 hover:text-white w-full text-left">All projects →</button>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {/* Home */}
          <NavItem icon={Home} label="Dashboard" active />

          {/* Site section */}
          <SectionHeader
            icon={MapPin}
            label="Site"
            badge={`${roads.length} roads`}
            open={expanded === "site"}
            onClick={() => toggle("site")}
          />
          {expanded === "site" && (
            <div className="ml-5 space-y-0.5 mb-1">
              {roads.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setActiveRoad(i)}
                  className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded flex items-center gap-1.5 ${activeRoad === i ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${i < 2 ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="truncate">{r}</span>
                </button>
              ))}
              <div className="px-2.5 py-1">
                <div className="h-px bg-zinc-700" />
              </div>
              <NavSubItem icon={FileText} label="Daily Reports (DPR)" />
              <NavSubItem icon={Users} label="Labour" />
              <NavSubItem icon={ClipboardList} label="Materials Received" />
            </div>
          )}

          {/* Plant section */}
          <SectionHeader
            icon={Building2}
            label="Plant — HLC Main"
            badge="shared"
            open={expanded === "plant"}
            onClick={() => toggle("plant")}
          />
          {expanded === "plant" && (
            <div className="ml-5 space-y-0.5 mb-1">
              <NavSubItem icon={Truck} label="HMP Operations" />
              <NavSubItem icon={Package} label="RMC Operations" />
              <NavSubItem icon={Fuel} label="LDO / Fuel" />
              <NavSubItem icon={Wrench} label="Equipment" />
              <NavSubItem icon={BarChart3} label="Reports" />
            </div>
          )}

          {/* Procurement */}
          <SectionHeader
            icon={ClipboardList}
            label="Procurement"
            open={expanded === "procurement"}
            onClick={() => toggle("procurement")}
          />
          {expanded === "procurement" && (
            <div className="ml-5 space-y-0.5 mb-1">
              <NavSubItem icon={FileText} label="Purchase Indents" />
              <NavSubItem icon={Fuel} label="Diesel Requirements" />
              <NavSubItem icon={ClipboardList} label="Vendor Bills" />
            </div>
          )}

          <div className="pt-2">
            <NavItem icon={BarChart3} label="Management Report" />
            <NavItem icon={Bell} label="Notifications" />
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-zinc-700 space-y-0.5">
          <NavItem icon={ShieldCheck} label="Admin" />
          <NavItem icon={Settings} label="Settings" />
        </div>
      </div>

      {/* Main area — annotation */}
      <div className="flex-1 p-8 space-y-6">
        <div className="max-w-lg space-y-4">
          <h2 className="text-xl font-bold text-zinc-800">Multi-Project Navigation</h2>
          <p className="text-sm text-zinc-600">The sidebar keeps its current structure but adds a <strong>project switcher</strong> at the top. Everything below it — roads, DPRs, labour, procurement — is automatically scoped to the selected project.</p>

          <div className="space-y-3">
            {[
              { title: "Project switcher", desc: "One click to jump between NH-66 Pkg 3, Ring Road, etc. Each project remembers its last active road.", color: "bg-violet-100 text-violet-700 border-violet-200" },
              { title: "Roads list (inline)", desc: "Each road under the project is a direct nav link. Colour dot = DPR filed today (green) or missing (amber).", color: "bg-amber-100 text-amber-700 border-amber-200" },
              { title: "Plant — shared label", desc: "The plant section shows 'shared' to remind users that stock and equipment serve all active projects from one establishment.", color: "bg-blue-100 text-blue-700 border-blue-200" },
              { title: "Procurement scoped", desc: "Purchase Indents and Diesel Requirements created here are auto-tagged to the current project, so the Management Report filters them correctly.", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
            ].map(a => (
              <div key={a.title} className={`rounded-lg border px-4 py-3 ${a.color}`}>
                <div className="font-semibold text-sm mb-0.5">{a.title}</div>
                <div className="text-xs opacity-90">{a.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon: Icon, label, active }: { icon: any; label: string; active?: boolean }) {
  return (
    <button className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-[12px] font-medium transition-colors ${active ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function NavSubItem({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
      <Icon className="w-3 h-3 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function SectionHeader({ icon: Icon, label, badge, open, onClick }: { icon: any; label: string; badge?: string; open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 text-left font-semibold uppercase tracking-wide text-[9px] text-zinc-500">{label}</span>
      {badge && <span className="text-[9px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">{badge}</span>}
      {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
    </button>
  );
}
