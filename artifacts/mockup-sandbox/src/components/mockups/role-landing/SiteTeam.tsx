import { useState } from "react";
import {
  ClipboardList, Camera, Package, ShoppingCart, ChevronRight,
  CheckCircle2, Circle, AlertTriangle, AlertCircle,
  HardHat, Truck, Wrench, Plus, Bell, User, Home,
  FileText, BarChart2, MapPin, ArrowRight, Image,
  TrendingUp, TrendingDown, Minus, Clock, RefreshCw,
  Users, Fuel, MessageSquare, BookOpen, ShoppingBag,
  ChevronDown, ChevronUp, Activity, Target, Layers
} from "lucide-react";

// ─── Sample data ──────────────────────────────────────────────────────────────

const USER = { name: "Raju", role: "Site Supervisor", initials: "R" };
const SITE = "THAKADPALLY - SIRUR";
const TODAY = "Fri, 11 Jul 2026";
const HOUR = 9;

function greeting() {
  if (HOUR < 12) return "Good morning";
  if (HOUR < 17) return "Good afternoon";
  return "Good evening";
}

type PlanStatus = "Behind" | "On Track" | "Ahead" | "Not Started";

interface PlanItem {
  id: string;
  name: string;
  location: string;
  unit: string;
  plannedToDate: number;
  actualToDate: number;
  todayTarget: number;
  loggedToday: number;
  status: PlanStatus;
  type: "road" | "structure";
  note?: string;
}

const planItems: PlanItem[] = [
  {
    id: "wmm-r1",
    name: "WMM Laying",
    location: "Reach 1 · Ch. 0+000–2+500",
    unit: "CUM",
    plannedToDate: 2500,
    actualToDate: 1750,
    todayTarget: 300,
    loggedToday: 0,
    status: "Behind",
    type: "road",
  },
  {
    id: "gsb-r1",
    name: "GSB Compaction",
    location: "Reach 1 · Ch. 0+000–2+500",
    unit: "CUM",
    plannedToDate: 2500,
    actualToDate: 2540,
    todayTarget: 0,
    loggedToday: 0,
    status: "Ahead",
    type: "road",
  },
  {
    id: "drain-r1",
    name: "Drain Excavation",
    location: "Reach 1 · Ch. 1+200–2+000",
    unit: "RM",
    plannedToDate: 800,
    actualToDate: 620,
    todayTarget: 80,
    loggedToday: 40,
    status: "Behind",
    type: "road",
  },
  {
    id: "pc02",
    name: "PC-02 Pipe Culvert",
    location: "Ch. 1+450",
    unit: "Stage",
    plannedToDate: 0,
    actualToDate: 0,
    todayTarget: 0,
    loggedToday: 0,
    status: "Not Started",
    type: "structure",
    note: "Planned stage: Bedding + Pipe Laying. Actual: Excavation completed. Bedding and pipe laying pending.",
  },
  {
    id: "bc-r2",
    name: "BC Wearing Course",
    location: "Reach 2 · Ch. 2+500–4+200",
    unit: "MT",
    plannedToDate: 0,
    actualToDate: 0,
    todayTarget: 200,
    loggedToday: 0,
    status: "Not Started",
    type: "road",
    note: "Scheduled to start today.",
  },
];

type CheckState = "done" | "partial" | "pending";
interface CheckItem { id: string; label: string; state: CheckState; sublabel?: string }

const startChecklist: CheckItem[] = [
  { id: "dpr-open",   label: "Open / create today's DPR draft", state: "done",    sublabel: "Draft opened at 07:15" },
  { id: "labour",     label: "Confirm labour count",              state: "partial", sublabel: "14 confirmed, 3 not yet" },
  { id: "equip-open", label: "Record equipment opening meter",    state: "pending", sublabel: "4 equipment pending" },
  { id: "equip-avail",label: "Confirm key equipment availability", state: "done",   sublabel: "All 4 units confirmed" },
  { id: "material",   label: "Check material availability",        state: "pending", sublabel: "WMM — check stock" },
  { id: "photo",      label: "Add morning site photo",             state: "pending", sublabel: "No photo yet" },
];

const closingChecklist: CheckItem[] = [
  { id: "close-meter", label: "Equipment closing meter entry",     state: "pending", sublabel: "4 equipment pending" },
  { id: "labour-final",label: "Final labour count confirmed",      state: "partial", sublabel: "3 workers pending" },
  { id: "challan",     label: "Material challan photo attached",   state: "pending", sublabel: "WMM challan missing" },
  { id: "site-photos", label: "Site activity photos added",         state: "done",    sublabel: "5 photos uploaded" },
  { id: "qty-entry",  label: "All activity quantities entered",    state: "partial", sublabel: "2 of 4 activities done" },
  { id: "submit",      label: "DPR submitted",                     state: "pending", sublabel: "Not yet submitted" },
];

type DprState = "not-started" | "draft" | "pending-submit" | "submitted";

const quickActions = [
  { label: "Record Progress",  icon: Activity,      color: "bg-orange-500",  show: true },
  { label: "Add Photo",        icon: Camera,        color: "bg-slate-600",   show: true },
  { label: "Material Trip",    icon: Truck,         color: "bg-blue-600",    show: true },
  { label: "Equipment Log",    icon: Wrench,        color: "bg-amber-600",   show: true },
  { label: "Labour Log",       icon: Users,         color: "bg-teal-600",    show: true },
  { label: "Site Purchase",    icon: ShoppingCart,  color: "bg-green-600",   show: true },
  { label: "Raise PI",         icon: ShoppingBag,   color: "bg-purple-600",  show: true },
  { label: "Raise IRN",        icon: BookOpen,      color: "bg-indigo-600",  show: true },
  { label: "Site Remark",      icon: MessageSquare, color: "bg-rose-500",    show: true },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PlanStatus }) {
  const map: Record<PlanStatus, { bg: string; text: string; icon: React.ReactNode }> = {
    "Behind":      { bg: "bg-red-50 border-red-200",    text: "text-red-600",    icon: <TrendingDown className="w-3 h-3" /> },
    "On Track":    { bg: "bg-green-50 border-green-200", text: "text-green-700",  icon: <CheckCircle2 className="w-3 h-3" /> },
    "Ahead":       { bg: "bg-blue-50 border-blue-200",   text: "text-blue-700",   icon: <TrendingUp className="w-3 h-3" /> },
    "Not Started": { bg: "bg-gray-50 border-gray-200",   text: "text-gray-500",   icon: <Circle className="w-3 h-3" /> },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.bg} ${s.text}`}>
      {s.icon}{status}
    </span>
  );
}

function CheckRow({ item, onToggle }: { item: CheckItem; onToggle: () => void }) {
  const icons = {
    done:    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />,
    partial: <AlertCircle  className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    pending: <Circle       className="w-5 h-5 text-gray-300   flex-shrink-0" />,
  };
  return (
    <button onClick={onToggle} className="flex items-start gap-3 w-full text-left py-2.5 hover:bg-gray-50 rounded-lg px-1 transition-colors">
      {icons[item.state]}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight ${item.state === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}>{item.label}</p>
        {item.sublabel && <p className={`text-xs mt-0.5 ${item.state === "done" ? "text-gray-300" : item.state === "partial" ? "text-amber-600" : "text-gray-400"}`}>{item.sublabel}</p>}
      </div>
    </button>
  );
}

function ProgressBar({ value, max, color = "bg-orange-500" }: { value: number; max: number; color?: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PlanCard({ item, expanded, onToggle }: { item: PlanItem; expanded: boolean; onToggle: () => void }) {
  const backlog = item.plannedToDate - item.actualToDate;
  const pct = item.plannedToDate === 0 ? 0 : Math.round((item.actualToDate / item.plannedToDate) * 100);
  const barColor = item.status === "Behind" ? "bg-red-400" : item.status === "Ahead" ? "bg-blue-400" : item.status === "On Track" ? "bg-green-400" : "bg-gray-200";

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${item.status === "Behind" ? "border-red-100" : item.status === "Not Started" ? "border-gray-100" : "border-gray-100"}`}>
      {/* Card header — always visible */}
      <button onClick={onToggle} className="w-full text-left px-4 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{item.location}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge status={item.status} />
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>

        {item.type === "road" && item.plannedToDate > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Actual: <span className="font-semibold text-gray-800">{item.actualToDate.toLocaleString()} {item.unit}</span></span>
              <span className="text-gray-400">of {item.plannedToDate.toLocaleString()} planned</span>
            </div>
            <ProgressBar value={item.actualToDate} max={item.plannedToDate} color={barColor} />
          </div>
        )}

        {item.type === "structure" && item.note && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-1">{item.note}</p>
        )}

        {item.type === "road" && item.plannedToDate === 0 && item.note && (
          <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1.5 mt-1">{item.note}</p>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && item.type === "road" && item.plannedToDate > 0 && (
        <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px]">Planned to date</p>
              <p className="font-bold text-gray-800 text-sm">{item.plannedToDate.toLocaleString()} <span className="font-normal text-gray-400">{item.unit}</span></p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px]">Actual to date</p>
              <p className="font-bold text-gray-800 text-sm">{item.actualToDate.toLocaleString()} <span className="font-normal text-gray-400">{item.unit}</span></p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px]">{backlog >= 0 ? "Backlog" : "Ahead by"}</p>
              <p className={`font-bold text-sm ${backlog > 0 ? "text-red-500" : "text-blue-500"}`}>{Math.abs(backlog).toLocaleString()} <span className="font-normal text-gray-400">{item.unit}</span></p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px]">Achievement</p>
              <p className="font-bold text-gray-800 text-sm">{pct}%</p>
            </div>
            {item.todayTarget > 0 && (
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-[10px]">Today's target</p>
                <p className="font-bold text-orange-600 text-sm">{item.todayTarget.toLocaleString()} <span className="font-normal text-gray-400">{item.unit}</span></p>
              </div>
            )}
            {item.todayTarget > 0 && (
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-[10px]">Logged today</p>
                <p className={`font-bold text-sm ${item.loggedToday > 0 ? "text-green-600" : "text-gray-400"}`}>{item.loggedToday > 0 ? item.loggedToday.toLocaleString() : "—"}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-xs font-medium">
              <Activity className="w-3 h-3" /> Record Progress
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium">
              <Camera className="w-3 h-3" /> Photo
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium">
              <Wrench className="w-3 h-3" /> Equipment
            </button>
            <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium">
              <Users className="w-3 h-3" /> Labour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SiteTeam() {
  const [dprState, setDprState] = useState<DprState>("draft");
  const [startChecks, setStartChecks] = useState<CheckItem[]>(startChecklist);
  const [closeChecks, setCloseChecks] = useState<CheckItem[]>(closingChecklist);
  const [expandedPlan, setExpandedPlan] = useState<string | null>("wmm-r1");
  const [showAllActions, setShowAllActions] = useState(false);
  const [activeTab, setActiveTab] = useState("home");

  const toggleStart = (id: string) => setStartChecks(cs => cs.map(c => c.id === id
    ? { ...c, state: c.state === "done" ? "pending" : "done" }
    : c));

  const toggleClose = (id: string) => setCloseChecks(cs => cs.map(c => c.id === id
    ? { ...c, state: c.state === "done" ? "pending" : "done" }
    : c));

  const startDone  = startChecks.filter(c => c.state === "done").length;
  const closeDone  = closeChecks.filter(c => c.state === "done").length;
  const closePending = closeChecks.filter(c => c.state !== "done").length;

  const cta = {
    "not-started":    { label: "Start Today's Site Work",    sub: "No DPR opened yet · tap to begin",                       color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200" },
    "draft":          { label: "Continue Today's Site Work", sub: "DPR draft opened · 40% complete",                        color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200" },
    "pending-submit": { label: "Complete Today's Site Work", sub: "2 activities logged · equipment closing pending",         color: "bg-green-500 hover:bg-green-600 shadow-green-200"    },
    "submitted":      { label: "View Today's Site Report",   sub: "DPR submitted at 6:32 PM · read-only",                   color: "bg-gray-400 hover:bg-gray-500 shadow-gray-200"       },
  }[dprState];

  const behindCount = planItems.filter(p => p.status === "Behind").length;
  const visibleActions = showAllActions ? quickActions : quickActions.slice(0, 6);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="px-4 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                {USER.initials}
              </div>
              <div>
                <p className="text-xs text-gray-400 leading-tight">{greeting()}, <span className="font-semibold text-gray-700">{USER.name}</span> · {USER.role}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-gray-800 leading-tight">{SITE}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 hidden sm:block">{TODAY}</span>
              <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <button className="relative w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <Bell className="w-3.5 h-3.5 text-gray-500" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">2</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="pb-24 px-4 pt-4 space-y-4 max-w-2xl mx-auto">

        {/* ── 1. Today's Site Goal ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500" />
                  Today's Site Goal
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Planned vs actual, backlog and today's target</p>
              </div>
              {behindCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 border border-red-100">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="text-xs font-semibold text-red-600">{behindCount} behind</span>
                </div>
              )}
            </div>

            {/* Mini summary row */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: "On Track", count: planItems.filter(p=>p.status==="On Track").length, color: "text-green-600 bg-green-50" },
                { label: "Behind",   count: planItems.filter(p=>p.status==="Behind").length,   color: "text-red-600 bg-red-50"   },
                { label: "Ahead",    count: planItems.filter(p=>p.status==="Ahead").length,    color: "text-blue-600 bg-blue-50" },
              ].map(s => (
                <div key={s.label} className={`rounded-lg px-2 py-1.5 text-center ${s.color}`}>
                  <p className="text-lg font-black leading-none">{s.count}</p>
                  <p className="text-[10px] font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 space-y-2">
            {planItems.map(item => (
              <PlanCard
                key={item.id}
                item={item}
                expanded={expandedPlan === item.id}
                onToggle={() => setExpandedPlan(expandedPlan === item.id ? null : item.id)}
              />
            ))}
          </div>
        </div>

        {/* ── 2. Today's Site Work CTA ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-orange-500" />
              Today's Site Work
            </h2>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              dprState === "submitted"      ? "bg-green-50 text-green-600" :
              dprState === "pending-submit" ? "bg-amber-50 text-amber-600" :
              dprState === "draft"          ? "bg-orange-50 text-orange-600" :
                                              "bg-gray-50 text-gray-400"
            }`}>
              {dprState === "submitted" ? "Submitted" : dprState === "pending-submit" ? "Ready to submit" : dprState === "draft" ? "In progress" : "Not started"}
            </span>
          </div>
          <button
            onClick={() => {
              if (dprState === "not-started") setDprState("draft");
              else if (dprState === "draft") setDprState("pending-submit");
              else if (dprState === "pending-submit") setDprState("submitted");
              else setDprState("not-started");
            }}
            className={`w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-3 shadow-lg transition-all active:scale-[0.98] ${cta.color}`}
          >
            <span>{cta.label}</span>
            <ArrowRight className="w-4 h-4 ml-auto" />
          </button>
          <div className="flex items-center gap-2 px-1">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              dprState === "submitted" ? "bg-green-400" : dprState === "pending-submit" ? "bg-amber-400" : dprState === "draft" ? "bg-orange-400" : "bg-gray-300"
            }`} />
            <p className="text-xs text-gray-500">{cta.sub}</p>
          </div>
        </div>

        {/* ── 3. Start-of-day checklist ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 pt-3 pb-2 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Start-of-Day Checklist
            </h2>
            <span className="text-xs font-semibold text-gray-500">{startDone}/{startChecks.length}</span>
          </div>
          <div className="px-4 py-1">
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2 mb-1">
              <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${(startDone/startChecks.length)*100}%` }} />
            </div>
            <div className="divide-y divide-gray-50">
              {startChecks.map(c => (
                <CheckRow key={c.id} item={c} onToggle={() => toggleStart(c.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* ── 4. Quick Actions ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleActions.map(a => (
              <button key={a.label} className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={`w-11 h-11 rounded-2xl ${a.color} flex items-center justify-center shadow`}>
                  <a.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] text-gray-500 text-center leading-tight font-medium">{a.label}</span>
              </button>
            ))}
          </div>
          {quickActions.length > 6 && (
            <button
              onClick={() => setShowAllActions(!showAllActions)}
              className="w-full mt-2 py-1.5 rounded-lg text-xs text-orange-500 font-semibold flex items-center justify-center gap-1"
            >
              {showAllActions ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> +{quickActions.length - 6} more</>}
            </button>
          )}
        </div>

        {/* ── 5. Today's Activity / Structure Cards ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-900">Today's Work Focus</h2>
            <button className="text-xs text-orange-500 font-semibold flex items-center gap-0.5">
              <Plus className="w-3 h-3" /> Add Activity
            </button>
          </div>

          <div className="space-y-2">
            {planItems.filter(p => p.status === "Behind" || p.todayTarget > 0).map(item => {
              const backlog = item.plannedToDate - item.actualToDate;
              return (
                <div key={`focus-${item.id}`} className={`bg-white rounded-xl border shadow-sm p-4 ${item.status === "Behind" ? "border-red-100" : "border-orange-100"}`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className={`w-2 h-2 rounded-full ${item.status === "Behind" ? "bg-red-400" : "bg-orange-400"} flex-shrink-0`} />
                        <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      </div>
                      <p className="text-xs text-gray-400 ml-3.5">{item.location}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>

                  {item.type === "road" && item.plannedToDate > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                      {[
                        { label: "Planned",    val: `${item.plannedToDate.toLocaleString()} ${item.unit}`,   color: "text-gray-700" },
                        { label: "Actual",     val: `${item.actualToDate.toLocaleString()} ${item.unit}`,    color: "text-gray-700" },
                        { label: backlog >= 0 ? "Backlog" : "Ahead", val: `${Math.abs(backlog).toLocaleString()} ${item.unit}`, color: backlog > 0 ? "text-red-600 font-bold" : "text-blue-600 font-bold" },
                        { label: "Today logged", val: item.loggedToday > 0 ? `${item.loggedToday} ${item.unit}` : "—", color: item.loggedToday > 0 ? "text-green-600 font-bold" : "text-gray-400" },
                      ].map(f => (
                        <div key={f.label}>
                          <p className="text-gray-400 text-[10px]">{f.label}</p>
                          <p className={`font-semibold ${f.color}`}>{f.val}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.todayTarget > 0 && (
                    <div className="mb-3 bg-orange-50 rounded-lg px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-orange-400 uppercase tracking-wide">Today's Target</p>
                        <p className="text-sm font-bold text-orange-700">{item.todayTarget.toLocaleString()} {item.unit}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-orange-400 uppercase tracking-wide">Logged</p>
                        <p className={`text-sm font-bold ${item.loggedToday > 0 ? "text-green-600" : "text-gray-400"}`}>{item.loggedToday > 0 ? item.loggedToday : "0"}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold shadow-sm">
                      <Activity className="w-3 h-3" /> Record
                    </button>
                    <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                      <Camera className="w-3 h-3" /> Photo
                    </button>
                    <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                      <Wrench className="w-3 h-3" /> Equip.
                    </button>
                    <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                      <Users className="w-3 h-3" /> Labour
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 6. Pending Before Submit ── */}
        <div className={`bg-white rounded-xl border shadow-sm ${closePending > 0 ? "border-amber-200" : "border-green-100"}`}>
          <div className="px-4 pt-3 pb-2 border-b border-gray-50 flex items-center justify-between">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${closePending > 0 ? "text-gray-900" : "text-green-700"}`}>
              {closePending > 0
                ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> Pending Before Submit</>
                : <><CheckCircle2 className="w-4 h-4 text-green-500" /> Ready to Submit</>
              }
            </h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${closePending > 0 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
              {closeDone}/{closeChecks.length} done
            </span>
          </div>
          <div className="px-4 py-1">
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2 mb-1">
              <div className={`h-full rounded-full transition-all ${closeDone === closeChecks.length ? "bg-green-400" : "bg-amber-400"}`}
                style={{ width: `${(closeDone/closeChecks.length)*100}%` }} />
            </div>
            <div className="divide-y divide-gray-50">
              {closeChecks.map(c => (
                <CheckRow key={c.id} item={c} onToggle={() => toggleClose(c.id)} />
              ))}
            </div>
          </div>
          <div className="px-4 pb-3 pt-1">
            <button
              onClick={() => setDprState("pending-submit")}
              disabled={closePending > 0}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${closePending === 0 ? "bg-green-500 text-white shadow-md shadow-green-200" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
            >
              {closePending > 0 ? `${closePending} items pending before submit` : "Submit DPR Now"}
            </button>
          </div>
        </div>

      </div>

      {/* ── Bottom nav ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg flex items-center justify-around px-2 py-2 z-50 max-w-2xl mx-auto">
        {[
          { label: "Work",    icon: Home,        tab: "home"    },
          { label: "Reports", icon: FileText,     tab: "reports" },
          { label: "",        icon: Plus,         tab: "new",    primary: true },
          { label: "Progress",icon: BarChart2,    tab: "stats"   },
          { label: "Profile", icon: User,         tab: "profile" },
        ].map((n) => (
          <button
            key={n.tab}
            onClick={() => setActiveTab(n.tab)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 ${n.primary ? "" : ""}`}
          >
            {n.primary ? (
              <div className="w-12 h-12 -mt-6 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200">
                <n.icon className="w-6 h-6 text-white" />
              </div>
            ) : (
              <>
                <n.icon className={`w-5 h-5 ${activeTab === n.tab ? "text-orange-500" : "text-gray-400"}`} />
                <span className={`text-[10px] ${activeTab === n.tab ? "text-orange-500 font-semibold" : "text-gray-400"}`}>{n.label}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
