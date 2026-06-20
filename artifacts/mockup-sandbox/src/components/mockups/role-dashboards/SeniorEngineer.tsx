import React from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSignature,
  Map,
  Search,
  Bell,
  MoreVertical,
  BarChart3,
  TrendingUp,
  Truck,
  Wrench,
  Construction
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Progress } from "../../ui/progress";
import { Button } from "../../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";

// Mock Data
const dprStreak = [
  { date: "10 Oct", status: "completed" },
  { date: "11 Oct", status: "completed" },
  { date: "12 Oct", status: "completed" },
  { date: "13 Oct", status: "completed" },
  { date: "14 Oct", status: "delayed" },
  { date: "15 Oct", status: "completed" },
  { date: "16 Oct", status: "pending" },
];

const workProgramme = [
  { stretch: "CH 12+000 to 14+500", activity: "DBM Laying", planned: 80, actual: 75, status: "on-track" },
  { stretch: "CH 14+500 to 18+000", activity: "GSB 1st Layer", planned: 100, actual: 100, status: "completed" },
  { stretch: "CH 18+000 to 20+500", activity: "Embankment", planned: 60, actual: 45, status: "lagging" },
  { stretch: "Major Bridge @ 22+100", activity: "Pier Cap", planned: 40, actual: 42, status: "ahead" },
];

const boqItems = [
  { code: "3.1", desc: "Excavation in Soil", unit: "cum", planned: 45000, actual: 41200, percent: 91 },
  { code: "4.1", desc: "Granular Sub Base", unit: "cum", planned: 12000, actual: 10500, percent: 87 },
  { code: "5.1", desc: "Wet Mix Macadam", unit: "cum", planned: 8500, actual: 8200, percent: 96 },
  { code: "6.1", desc: "Dense Bituminous Macadam", unit: "MT", planned: 15000, actual: 16100, percent: 107 },
  { code: "7.1", desc: "Bituminous Concrete", unit: "MT", planned: 5000, actual: 2100, percent: 42 },
];

const materialRecon = [
  { item: "Aggregates (10mm, 20mm)", receipts: 12500, consumption: 11800, unit: "MT" },
  { item: "Bitumen (VG-30)", receipts: 850, consumption: 820, unit: "MT" },
  { item: "Cement (OPC 43)", receipts: 1200, consumption: 1150, unit: "MT" },
  { item: "Diesel (HSD)", receipts: 45000, consumption: 42000, unit: "Ltr" },
];

const pendingFlags = [
  { id: "QA-492", type: "quality", title: "DBM Core Density Low", loc: "CH 13+200", severity: "high", time: "2 hrs ago" },
  { id: "AP-112", type: "approval", title: "Mix Design Rev 3 - WMM", loc: "Plant Area", severity: "medium", time: "5 hrs ago" },
  { id: "QA-491", type: "quality", title: "Surface Irregularity", loc: "CH 18+500", severity: "low", time: "1 day ago" },
  { id: "AP-111", type: "approval", title: "Sub-contractor Bill #4", loc: "Site Office", severity: "medium", time: "1 day ago" },
];

export function SeniorEngineer() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-2 rounded-md">
              <Construction className="text-white h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 leading-tight">SitePulse</h1>
              <p className="text-xs text-slate-500 font-medium">NH-44 Expansion Project</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search chainage, tasks..." 
                className="pl-9 pr-4 py-2 bg-slate-100 border-transparent rounded-md text-sm focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-200 transition-all outline-none w-64"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="relative text-slate-500 hover:text-slate-700">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-rose-500 rounded-full border-2 border-white"></span>
              </Button>
              <div className="h-8 w-px bg-slate-200"></div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-900 leading-none">Rahul Sharma</p>
                  <p className="text-xs text-slate-500">Sr. Project Engineer</p>
                </div>
                <Avatar className="h-9 w-9 border border-slate-200">
                  <AvatarFallback className="bg-slate-100 text-slate-700 font-medium">RS</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Project Oversight</h2>
            <p className="text-sm text-slate-500 mt-1">Reviewing progress and quality across all active fronts.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="bg-white">
              <CalendarCheck className="mr-2 h-4 w-4 text-slate-500" />
              Week of Oct 10 - 16
            </Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800">
              <FileSignature className="mr-2 h-4 w-4" />
              Sign Off DPR
            </Button>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500">7-Day DPR Streak</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">85%</h3>
                </div>
                <div className="p-2 bg-emerald-50 rounded-md">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <div className="flex gap-1.5 h-8 items-end">
                {dprStreak.map((day, i) => (
                  <div key={i} className="flex-1 group relative">
                    <div 
                      className={`w-full rounded-sm transition-all ${
                        day.status === 'completed' ? 'bg-emerald-500 h-full' : 
                        day.status === 'delayed' ? 'bg-amber-400 h-3/4' : 'bg-slate-200 h-1/2'
                      }`}
                    ></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">1 delayed submission this week</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">Equipment Utilisation</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">78.4%</h3>
                </div>
                <div className="p-2 bg-blue-50 rounded-md">
                  <Wrench className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-600">Actual: 1,450 hrs</span>
                  <span className="text-slate-400">Target: 1,850 hrs</span>
                </div>
                <Progress value={78.4} className="h-2 bg-slate-100" indicatorClassName="bg-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">MTD Production (WMM)</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">8,200 <span className="text-sm text-slate-500 font-normal">cum</span></h3>
                </div>
                <div className="p-2 bg-slate-100 rounded-md">
                  <BarChart3 className="h-5 w-5 text-slate-700" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-600">Pace: Good</span>
                  <span className="text-emerald-600">+4% vs plan</span>
                </div>
                <Progress value={96} className="h-2 bg-slate-100" indicatorClassName="bg-emerald-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm bg-slate-900 text-white">
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-400">Quality Index</p>
                  <h3 className="text-2xl font-bold text-white mt-1">94.2</h3>
                </div>
                <div className="p-2 bg-slate-800 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-400">Flags this week</span>
                <span className="font-bold text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> 3 Open
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Work Programme Progress */}
          <Card className="lg:col-span-2 border-slate-200 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                  <Map className="h-4 w-4 text-slate-500" /> 
                  Active Stretches (Work Programme)
                </CardTitle>
                <CardDescription className="mt-1">Chainage progress vs planned schedule</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-slate-500 h-8 text-xs">View Gantt</Button>
            </CardHeader>
            <CardContent className="space-y-5">
              {workProgramme.map((stretch, i) => (
                <div key={i} className="group">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{stretch.stretch}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{stretch.activity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{stretch.actual}% <span className="text-slate-400 text-xs font-normal">/ {stretch.planned}% planned</span></p>
                      <Badge variant="outline" className={`mt-1 text-[10px] uppercase tracking-wider ${
                        stretch.status === 'completed' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' :
                        stretch.status === 'on-track' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                        stretch.status === 'ahead' ? 'text-indigo-600 border-indigo-200 bg-indigo-50' :
                        'text-rose-600 border-rose-200 bg-rose-50'
                      }`}>
                        {stretch.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    {/* Planned marker */}
                    <div className="absolute top-0 bottom-0 border-r-2 border-slate-400 z-10" style={{ width: `${stretch.planned}%` }}></div>
                    {/* Actual progress */}
                    <div className={`absolute top-0 bottom-0 left-0 transition-all ${
                        stretch.status === 'lagging' ? 'bg-rose-500' : 'bg-slate-800'
                      }`} style={{ width: `${stretch.actual}%` }}></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Pending Approvals / Quality Flags */}
          <Card className="border-slate-200 shadow-sm flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">Action Required</CardTitle>
              <CardDescription>Quality flags & pending approvals</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              <div className="divide-y divide-slate-100">
                {pendingFlags.map((flag, i) => (
                  <div key={i} className="p-4 hover:bg-slate-50 transition-colors flex gap-3 items-start cursor-pointer">
                    <div className={`p-2 rounded-full mt-0.5 ${
                      flag.type === 'quality' ? 'bg-rose-100' : 'bg-amber-100'
                    }`}>
                      {flag.type === 'quality' ? 
                        <AlertTriangle className="h-4 w-4 text-rose-600" /> : 
                        <FileSignature className="h-4 w-4 text-amber-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-semibold text-slate-900 truncate">{flag.title}</p>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">{flag.time}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-slate-500">{flag.loc}</p>
                        <Badge variant="secondary" className="text-[10px] py-0 h-4">
                          {flag.id}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 rounded-b-lg">
              <Button variant="ghost" className="w-full text-sm text-slate-600 hover:text-slate-900 h-8">
                View All Tasks <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </Card>
        </div>

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* BOQ Execution */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">Top BOQ Execution (Month)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[80px] text-xs">Code</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-right text-xs">Actual / Plan</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boqItems.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs text-slate-500">{item.code}</TableCell>
                      <TableCell className="text-sm text-slate-900 truncate max-w-[150px]">{item.desc}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="font-medium text-slate-900">{item.actual.toLocaleString()}</span>
                        <span className="text-slate-400 text-xs ml-1">/ {item.planned.toLocaleString()} {item.unit}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={item.percent} className="h-1.5 w-12 bg-slate-100" indicatorClassName={item.percent > 100 ? "bg-indigo-500" : item.percent < 50 ? "bg-rose-500" : "bg-blue-500"} />
                          <span className={`text-xs font-medium w-8 text-right ${item.percent > 100 ? "text-indigo-600" : item.percent < 50 ? "text-rose-600" : "text-slate-600"}`}>{item.percent}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Material Reconciliation */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-base text-slate-900">Material Reconciliation</CardTitle>
              <Truck className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="p-5">
              <div className="space-y-5">
                {materialRecon.map((mat, i) => {
                  const receiptPct = 100;
                  const consPct = (mat.consumption / mat.receipts) * 100;
                  const overconsumed = consPct > 95;
                  
                  return (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <p className="text-sm font-medium text-slate-900">{mat.item}</p>
                        <p className="text-xs text-slate-500">
                          {mat.consumption.toLocaleString()} / {mat.receipts.toLocaleString()} <span className="font-medium">{mat.unit}</span>
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-16 text-[10px] text-slate-400 uppercase tracking-wide text-right">Receipts</div>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-300" style={{ width: `${receiptPct}%` }}></div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 text-[10px] text-slate-400 uppercase tracking-wide text-right">Consumed</div>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${overconsumed ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${consPct}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
