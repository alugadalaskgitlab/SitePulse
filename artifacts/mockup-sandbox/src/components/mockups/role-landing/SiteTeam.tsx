import { useState } from "react";
import {
  ClipboardList, Camera, Truck, Wrench, Users, ShoppingCart,
  ShoppingBag, BookOpen, MessageSquare, Bell, RefreshCw,
  MapPin, ArrowRight, AlertTriangle, CheckCircle2, Circle,
  AlertCircle, Plus, Home, FileText, BarChart2, User,
  ChevronRight, Target, Zap, TrendingDown, Info
} from "lucide-react";

// ─── Types & constants ────────────────────────────────────────────────────────

const USER   = { name: "Raju", role: "Site Supervisor", initials: "R" };
const SITE   = "THAKADPALLY - SIRUR";
const TODAY  = "Fri, 11 Jul 2026";
const HOUR   = 9;

function greeting() {
  return HOUR < 12 ? "Good morning" : HOUR < 17 ? "Good afternoon" : "Good evening";
}

type DprState = "not-started" | "draft" | "pending-submit" | "submitted";

// ─── Site Goal data ───────────────────────────────────────────────────────────

interface GoalRow {
  id: string;
  item: string;
  stretch: string;
  plannedTxt: string;
  completedTxt: string;
  toDoTxt: string;
  toDoType: "backlog" | "ahead" | "pending-stages" | "not-started";
}

const goalRows: GoalRow[] = [
  {
    id: "wmm",
    item: "WMM Laying",
    stretch: "Ch 0+000 to 2+500",
    plannedTxt: "2,500 CUM",
    completedTxt: "1,750 CUM",
    toDoTxt: "750 CUM backlog",
    toDoType: "backlog",
  },
  {
    id: "gsb",
    item: "GSB Compaction",
    stretch: "Ch 0+000 to 2+500",
    plannedTxt: "2,500 CUM",
    completedTxt: "2,540 CUM",
    toDoTxt: "Ahead by 40 CUM",
    toDoType: "ahead",
  },
  {
    id: "drain",
    item: "Drain Excavation",
    stretch: "Ch 1+200 to 2+000",
    plannedTxt: "800 RM",
    completedTxt: "620 RM",
    toDoTxt: "180 RM balance",
    toDoType: "backlog",
  },
  {
    id: "bc",
    item: "BC Wearing Course",
    stretch: "Ch 2+500 to 4+200",
    plannedTxt: "Scheduled today",
    completedTxt: "—",
    toDoTxt: "Start today",
    toDoType: "not-started",
  },
  {
    id: "pc02",
    item: "PC-02 Pipe Culvert",
    stretch: "Structure at Ch 1+450",
    plannedTxt: "Bedding + Pipe Laying",
    completedTxt: "Excavation done",
    toDoTxt: "Bedding, Pipe Laying",
    toDoType: "pending-stages",
  },
];

// ─── Today's Focus items ──────────────────────────────────────────────────────

interface FocusItem {
  id: string;
  icon: "warn" | "alert" | "info" | "ok";
  text: string;
}

const focusItems: FocusItem[] = [
  { id: "f1", icon: "warn",  text: "WMM backlog 750 CUM at Reach 1 — prioritise today" },
  { id: "f2", icon: "warn",  text: "Drain excavation balance 180 RM — push team to complete" },
  { id: "f3", icon: "alert", text: "PC-02 bedding and pipe laying pending — confirm material readiness" },
  { id: "f4", icon: "info",  text: "BC wearing course scheduled to start today — arrange plant coordination" },
  { id: "f5", icon: "ok",    text: "GSB is ahead by 40 CUM — no priority unless instructed" },
];

// ─── Pending checklist ────────────────────────────────────────────────────────

type CheckState = "done" | "partial" | "pending";
interface CheckItem { id: string; label: string; state: CheckState; sub?: string }

const pendingItems: CheckItem[] = [
  { id: "c1", label: "Equipment closing meter pending", state: "pending",  sub: "4 equipment not recorded" },
  { id: "c2", label: "Final labour count pending",      state: "partial",  sub: "3 workers not confirmed" },
  { id: "c3", label: "Material challan photo pending",  state: "pending",  sub: "WMM challan photo missing" },
  { id: "c4", label: "Activity photos uploaded",        state: "done",     sub: "5 photos added" },
  { id: "c5", label: "Activity quantities entered",     state: "partial",  sub: "2 of 4 activities done" },
  { id: "c6", label: "DPR not submitted",               state: "pending",  sub: "Submit once all items are done" },
];

// ─── Quick actions ────────────────────────────────────────────────────────────

const quickActions = [
  { label: "Activity Photo", icon: Camera,        color: "bg-slate-600"   },
  { label: "Material Trip",  icon: Truck,         color: "bg-blue-600"    },
  { label: "Equipment Log",  icon: Wrench,        color: "bg-amber-600"   },
  { label: "Labour Log",     icon: Users,         color: "bg-teal-600"    },
  { label: "Site Purchase",  icon: ShoppingCart,  color: "bg-green-600"   },
  { label: "Raise PI",       icon: ShoppingBag,   color: "bg-purple-600"  },
  { label: "Raise IRN",      icon: BookOpen,      color: "bg-indigo-600"  },
  { label: "Site Remark",    icon: MessageSquare, color: "bg-rose-500"    },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToDoBadge({ type, text }: { type: GoalRow["toDoType"]; text: string }) {
  const styles: Record<GoalRow["toDoType"], string> = {
    backlog:        "text-red-600 bg-red-50",
    ahead:          "text-blue-600 bg-blue-50",
    "pending-stages": "text-amber-700 bg-amber-50",
    "not-started":  "text-gray-500 bg-gray-100",
  };
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md ${styles[type]}`}>
      {text}
    </span>
  );
}

function FocusRow({ item }: { item: FocusItem }) {
  const map = {
    warn:  { dot: "bg-red-400",   bg: "bg-red-50",    text: "text-red-800"   },
    alert: { dot: "bg-amber-400", bg: "bg-amber-50",  text: "text-amber-800" },
    info:  { dot: "bg-blue-400",  bg: "bg-blue-50",   text: "text-blue-800"  },
    ok:    { dot: "bg-green-400", bg: "bg-green-50",  text: "text-green-800" },
  };
  const s = map[item.icon];
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg ${s.bg}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${s.dot}`} />
      <p className={`text-sm leading-snug ${s.text}`}>{item.text}</p>
    </div>
  );
}

function PendingRow({ item, onToggle }: { item: CheckItem; onToggle: () => void }) {
  const icons = {
    done:    <CheckCircle2 className="w-4.5 h-4.5 text-green-500 flex-shrink-0 w-5 h-5" />,
    partial: <AlertCircle  className="w-4.5 h-4.5 text-amber-500 flex-shrink-0 w-5 h-5" />,
    pending: <Circle       className="w-4.5 h-4.5 text-gray-300   flex-shrink-0 w-5 h-5" />,
  };
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3 w-full text-left py-2.5 px-1 hover:bg-gray-50 rounded-lg transition-colors"
    >
      {icons[item.state]}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${item.state === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
          {item.label}
        </p>
        {item.sub && (
          <p className={`text-xs mt-0.5 ${
            item.state === "done"    ? "text-gray-300" :
            item.state === "partial" ? "text-amber-600" :
                                       "text-gray-400"
          }`}>{item.sub}</p>
        )}
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SiteTeam() {
  const [dprState, setDprState]       = useState<DprState>("draft");
  const [checks, setChecks]           = useState<CheckItem[]>(pendingItems);
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [activeTab, setActiveTab]     = useState("home");

  const toggleCheck = (id: string) =>
    setChecks(cs => cs.map(c =>
      c.id === id ? { ...c, state: c.state === "done" ? "pending" : "done" } : c
    ));

  const pendingCount = checks.filter(c => c.state !== "done").length;
  const donePct      = Math.round(((checks.length - pendingCount) / checks.length) * 100);

  const visibleGoals = showAllGoals ? goalRows : goalRows.slice(0, 3);

  const cta = {
    "not-started":    { label: "Start Today's Site Work",    status: "DPR draft not started",                            color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200", dot: "bg-orange-300" },
    "draft":          { label: "Continue Today's Site Work", status: "DPR draft opened · 40% complete",                  color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200", dot: "bg-orange-400" },
    "pending-submit": { label: "Complete Today's Site Work", status: "2 activities logged · equipment closing pending",   color: "bg-green-500 hover:bg-green-600 shadow-green-200",    dot: "bg-amber-400"  },
    "submitted":      { label: "View Today's Site Report",   status: "DPR submitted at 7:15 PM",                         color: "bg-gray-400 hover:bg-gray-500 shadow-gray-200",        dot: "bg-green-400"  },
  }[dprState];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-3">
            {/* Left: avatar + identity */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                {USER.initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 leading-tight">
                  {greeting()}, <span className="font-semibold text-gray-800">{USER.name}</span>
                </p>
                <p className="text-xs font-medium text-gray-500 leading-tight">{USER.role}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                  <span className="text-xs font-bold text-gray-900 truncate">{SITE}</span>
                </div>
              </div>
            </div>
            {/* Right: date + icons */}
            <div className="flex items-center gap-2 flex-shrink-0">
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

      {/* ── Scrollable body ── */}
      <div className="pb-24 max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 1. TODAY'S SITE GOAL — simple table, no bars           */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Card header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-orange-500" />
                Today's Site Goal
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Planned vs completed vs to be done</p>
            </div>
            <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
              2 behind
            </span>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <span>Item / Stretch</span>
            <span className="text-right w-20">Planned</span>
            <span className="text-right w-20">Completed</span>
            <span className="text-right w-28">To be done</span>
          </div>

          {/* Goal rows */}
          <div className="divide-y divide-gray-50">
            {visibleGoals.map(row => (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-3 items-start hover:bg-gray-50/60 transition-colors">
                {/* Item name + stretch */}
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{row.item}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{row.stretch}</p>
                </div>
                {/* Planned */}
                <div className="w-20 text-right">
                  <p className="text-xs text-gray-600 font-medium leading-tight">{row.plannedTxt}</p>
                </div>
                {/* Completed */}
                <div className="w-20 text-right">
                  <p className="text-xs text-gray-700 font-semibold leading-tight">{row.completedTxt}</p>
                </div>
                {/* To be done */}
                <div className="w-28 text-right">
                  <ToDoBadge type={row.toDoType} text={row.toDoTxt} />
                </div>
              </div>
            ))}
          </div>

          {/* Show all / collapse */}
          {goalRows.length > 3 && (
            <button
              onClick={() => setShowAllGoals(!showAllGoals)}
              className="w-full py-2.5 text-xs font-semibold text-orange-500 border-t border-gray-50 hover:bg-orange-50/50 transition-colors flex items-center justify-center gap-1"
            >
              {showAllGoals
                ? "Show less"
                : `View all ${goalRows.length} activities`
              }
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAllGoals ? "rotate-90" : ""}`} />
            </button>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 2. TODAY'S FOCUS — plain text / simple cards           */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" />
              Today's Focus
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">What to prioritise today</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {focusItems.map(item => (
              <FocusRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 3. TODAY'S SITE WORK — main CTA                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-orange-500" />
              Today's Site Work
            </h2>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              dprState === "submitted"       ? "bg-green-50 text-green-600" :
              dprState === "pending-submit"  ? "bg-amber-50 text-amber-600" :
              dprState === "draft"           ? "bg-orange-50 text-orange-600" :
                                               "bg-gray-100 text-gray-400"
            }`}>
              {dprState === "submitted" ? "Submitted" : dprState === "pending-submit" ? "Ready to submit" : dprState === "draft" ? "In progress" : "Not started"}
            </span>
          </div>

          {/* Flow steps hint — compact */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {["Start of Day", "Progress", "Labour", "Equipment", "Materials", "Photos", "Submit"].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  i === 0 && dprState !== "not-started" ? "bg-green-100 text-green-700" :
                  i <= 1 && dprState === "draft"        ? "bg-orange-100 text-orange-700" :
                                                          "bg-gray-100 text-gray-400"
                }`}>{step}</span>
                {i < arr.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />}
              </span>
            ))}
          </div>

          {/* Main CTA button */}
          <button
            onClick={() => {
              if (dprState === "not-started")    setDprState("draft");
              else if (dprState === "draft")     setDprState("pending-submit");
              else if (dprState === "pending-submit") setDprState("submitted");
              else setDprState("not-started");
            }}
            className={`w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${cta.color}`}
          >
            <span>{cta.label}</span>
            <ArrowRight className="w-5 h-5 ml-auto" />
          </button>

          {/* Status sub-text + pending summary */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cta.dot}`} />
              <p className="text-xs text-gray-500">{cta.status}</p>
            </div>
            {pendingCount > 0 && dprState !== "submitted" && (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">
                {pendingCount} items pending before submit
              </span>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 4. QUICK ACTIONS                                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
            {quickActions.map(a => (
              <button key={a.label} className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={`w-11 h-11 rounded-2xl ${a.color} flex items-center justify-center shadow`}>
                  <a.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] text-gray-500 text-center leading-tight font-medium">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 5. PENDING BEFORE SUBMIT                               */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${pendingCount > 0 ? "border-amber-200" : "border-green-100"}`}>

          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${pendingCount > 0 ? "text-gray-900" : "text-green-700"}`}>
              {pendingCount > 0
                ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> Pending Before Submit</>
                : <><CheckCircle2 className="w-4 h-4 text-green-500" /> Ready to Submit</>
              }
            </h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              pendingCount > 0 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
            }`}>
              {checks.length - pendingCount}/{checks.length} done
            </span>
          </div>

          {/* Thin progress strip */}
          <div className="h-1 w-full bg-gray-100">
            <div
              className={`h-full transition-all ${donePct === 100 ? "bg-green-400" : "bg-amber-400"}`}
              style={{ width: `${donePct}%` }}
            />
          </div>

          <div className="px-4 py-1 divide-y divide-gray-50">
            {checks.map(c => (
              <PendingRow key={c.id} item={c} onToggle={() => toggleCheck(c.id)} />
            ))}
          </div>

          <div className="px-4 pb-3 pt-2">
            <button
              onClick={() => pendingCount === 0 && setDprState("submitted")}
              disabled={pendingCount > 0}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                pendingCount === 0
                  ? "bg-green-500 text-white shadow-md shadow-green-200"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {pendingCount > 0 ? `${pendingCount} items pending before submit` : "Submit DPR Now"}
            </button>
          </div>
        </div>

      </div>

      {/* ── Bottom nav (4 tabs — no floating duplicate; Quick Actions are in the page body) ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50">
        <div className="max-w-2xl mx-auto flex items-center justify-around px-4 py-2 pb-safe">
          {[
            { label: "Work",     icon: Home,      tab: "home"    },
            { label: "Reports",  icon: FileText,  tab: "reports" },
            { label: "Progress", icon: BarChart2, tab: "stats"   },
            { label: "Profile",  icon: User,      tab: "profile" },
          ].map(n => (
            <button
              key={n.tab}
              onClick={() => setActiveTab(n.tab)}
              className="flex flex-col items-center gap-1 px-4 py-2 min-w-[60px]"
            >
              <n.icon className={`w-5 h-5 ${activeTab === n.tab ? "text-orange-500" : "text-gray-400"}`} />
              <span className={`text-[10px] ${activeTab === n.tab ? "text-orange-500 font-semibold" : "text-gray-400"}`}>{n.label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
