import React, { useState } from "react";
import {
  Flame,
  ClipboardList,
  Truck,
  ShoppingCart,
  Fuel,
  BarChart3,
  ChevronLeft,
  ArrowLeft,
  Settings,
  Calendar,
  Clock,
  Thermometer,
  Save,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TileType = "heating" | "shift" | "dispatch" | "purchase" | "diesel" | "report" | null;

export default function HMPOperations() {
  const [currentTile, setCurrentTile] = useState<TileType>(null);

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Shifts Today", value: "3", sub: "Active" },
          { label: "Dispatched", value: "142 MT", sub: "Today" },
          { label: "Heating Time", value: "6.2 hrs", sub: "Avg" },
          { label: "LDO Consumed", value: "380 L", sub: "Est." }
        ].map((kpi, i) => (
          <Card key={i} className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-4 flex flex-col justify-center items-center text-center">
              <span className="text-3xl font-bold text-slate-800 tracking-tight">{kpi.value}</span>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">{kpi.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card 
          className="cursor-pointer hover:border-orange-500 hover:shadow-md transition-all group border-slate-200"
          onClick={() => setCurrentTile("heating")}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg group-hover:scale-110 transition-transform">
              <Flame size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-lg group-hover:text-orange-600 transition-colors">Bitumen Heating Sessions</h3>
              <p className="text-sm text-slate-500 mt-1">Log boiler runs & track hot-oil temps</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-amber-500 hover:shadow-md transition-all group border-slate-200"
          onClick={() => setCurrentTile("shift")}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-lg group-hover:scale-110 transition-transform">
              <ClipboardList size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-lg group-hover:text-amber-600 transition-colors">Plant Shift Log</h3>
              <p className="text-sm text-slate-500 mt-1">Record shift details, personnel & production</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group border-slate-200"
          onClick={() => setCurrentTile("dispatch")}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg group-hover:scale-110 transition-transform">
              <Truck size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-lg group-hover:text-emerald-600 transition-colors">Production & Dispatches</h3>
              <p className="text-sm text-slate-500 mt-1">Log truck loads with mix data & tonnage</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group border-slate-200"
          onClick={() => setCurrentTile("purchase")}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg group-hover:scale-110 transition-transform">
              <ShoppingCart size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">Purchase Indents</h3>
              <p className="text-sm text-slate-500 mt-1">Raise material purchase requests</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-yellow-500 hover:shadow-md transition-all group border-slate-200"
          onClick={() => setCurrentTile("diesel")}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-yellow-100 text-yellow-600 rounded-lg group-hover:scale-110 transition-transform">
              <Fuel size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-lg group-hover:text-yellow-600 transition-colors">Daily Diesel Requirement</h3>
              <p className="text-sm text-slate-500 mt-1">Plan diesel per equipment for today</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-purple-500 hover:shadow-md transition-all group border-slate-200"
          onClick={() => setCurrentTile("report")}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg group-hover:scale-110 transition-transform">
              <BarChart3 size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-lg group-hover:text-purple-600 transition-colors">Today's Plant Report</h3>
              <p className="text-sm text-slate-500 mt-1">Quick summary of plant activities</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderHeatingSessions = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Flame className="text-orange-500" /> Heating Sessions
        </h2>
        <Button className="bg-orange-600 hover:bg-orange-700 text-white">Log Session</Button>
      </div>
      <div className="grid gap-4">
        {[
          { date: "Oct 24, 2023", time: "06:00 - 10:30", ldo: "120 L", status: "completed" },
          { date: "Oct 24, 2023", time: "14:00 - 16:45", ldo: "85 L", status: "completed" },
          { date: "Oct 25, 2023", time: "05:30 - In Progress", ldo: "-", status: "active" },
        ].map((session, i) => (
          <Card key={i} className="border-slate-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-slate-100 p-3 rounded-full">
                  <Thermometer className="text-slate-500" size={20} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{session.date}</div>
                  <div className="text-sm text-slate-500">{session.time}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs text-slate-500 uppercase tracking-wider">LDO Consumed</div>
                  <div className="font-mono font-medium text-slate-700">{session.ldo}</div>
                </div>
                <Badge variant={session.status === "active" ? "default" : "secondary"} className={session.status === "active" ? "bg-orange-500" : ""}>
                  {session.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderShiftLog = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ClipboardList className="text-amber-500" /> New Shift Log
        </h2>
      </div>
      <Card className="border-slate-200">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" defaultValue="2023-10-25" />
            </div>
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select defaultValue="day">
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day Shift (08:00 - 20:00)</SelectItem>
                  <SelectItem value="night">Night Shift (20:00 - 08:00)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Plant Operator</Label>
              <Input placeholder="Enter operator name" />
            </div>
          </div>
          <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2">
            <Save size={16} /> Save Shift Log
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderDispatches = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Truck className="text-emerald-500" /> Production & Dispatches
        </h2>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">New Dispatch</Button>
      </div>
      <Card className="border-slate-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Truck No.</TableHead>
              <TableHead>Mix Type</TableHead>
              <TableHead className="text-right">Tonnage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { time: "08:15", truck: "MH 12 AB 1234", mix: "DBM Grade 2", qty: "28.5 MT" },
              { time: "09:30", truck: "MH 12 CD 5678", mix: "DBM Grade 2", qty: "30.0 MT" },
              { time: "10:45", truck: "MH 14 EF 9012", mix: "BC Grade 1", qty: "29.2 MT" },
              { time: "11:20", truck: "MH 12 AB 1234", mix: "BC Grade 1", qty: "28.8 MT" },
              { time: "13:00", truck: "MH 14 GH 3456", mix: "DBM Grade 2", qty: "31.5 MT" },
            ].map((row, i) => (
              <TableRow key={i}>
                <TableCell className="text-slate-500">{row.time}</TableCell>
                <TableCell className="font-medium text-slate-800">{row.truck}</TableCell>
                <TableCell><Badge variant="outline">{row.mix}</Badge></TableCell>
                <TableCell className="text-right font-mono font-medium">{row.qty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );

  const renderComingSoon = (title: string, icon: React.ReactNode) => (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="p-6 bg-slate-100 rounded-full text-slate-400 mb-4">
        {icon}
      </div>
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      <p className="text-slate-500 max-w-md">This module is currently under construction. Check back soon for updates.</p>
      <Button variant="outline" onClick={() => setCurrentTile(null)} className="mt-4 gap-2">
        <ArrowLeft size={16} /> Return to Dashboard
      </Button>
    </div>
  );

  const renderContent = () => {
    switch (currentTile) {
      case null: return renderDashboard();
      case "heating": return renderHeatingSessions();
      case "shift": return renderShiftLog();
      case "dispatch": return renderDispatches();
      case "purchase": return renderComingSoon("Purchase Indents", <ShoppingCart size={48} />);
      case "diesel": return renderComingSoon("Daily Diesel Requirement", <Fuel size={48} />);
      case "report": return renderComingSoon("Today's Plant Report", <BarChart3 size={48} />);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Top Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {currentTile ? (
              <button 
                onClick={() => setCurrentTile(null)}
                className="p-2 hover:bg-slate-800 rounded-md transition-colors flex items-center gap-2 text-slate-300 hover:text-white"
              >
                <ArrowLeft size={20} />
                <span className="hidden sm:inline font-medium">Back to HMP Operations</span>
              </button>
            ) : (
              <button className="p-2 hover:bg-slate-800 rounded-md transition-colors">
                <ChevronLeft size={24} />
              </button>
            )}
            
            {!currentTile && (
              <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
                <span className="text-xl">🏭</span> HMP Operations
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700">NH-48 Bypass</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {renderContent()}
      </main>
    </div>
  );
}
