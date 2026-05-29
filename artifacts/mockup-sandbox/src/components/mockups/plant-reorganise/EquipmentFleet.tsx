import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Wrench, 
  Fuel, 
  BarChart3, 
  Database, 
  ChevronLeft, 
  AlertCircle,
  Truck,
  Activity,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CheckCircle2,
  ShieldCheck,
  Search,
  Settings
} from "lucide-react";

export function EquipmentFleet() {
  const [currentTile, setCurrentTile] = useState<string | null>(null);

  const renderLevel1 = () => (
    <div className="space-y-6">
      {/* Fleet Status Banner */}
      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="flex-1 p-4 flex items-center justify-center sm:justify-start gap-3">
            <div className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50"></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">12</p>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active</p>
            </div>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center sm:justify-start gap-3">
            <div className="h-3 w-3 rounded-full bg-amber-500 ring-4 ring-amber-50"></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">2</p>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Maintenance</p>
            </div>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center sm:justify-start gap-3 bg-red-50/50">
            <div className="h-3 w-3 rounded-full bg-red-500 ring-4 ring-red-100 animate-pulse"></div>
            <div>
              <p className="text-2xl font-bold text-red-700">1</p>
              <p className="text-xs font-medium text-red-600 uppercase tracking-wider">Breakdown</p>
            </div>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center sm:justify-start gap-3">
            <div className="h-3 w-3 rounded-full bg-slate-300 ring-4 ring-slate-50"></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">3</p>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Idle</p>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Fuel className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Diesel Consumed Today</p>
              <p className="text-2xl font-bold text-slate-800">380 <span className="text-base font-semibold text-slate-500">L</span></p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border-slate-200 shadow-sm border-l-4 border-l-red-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-lg">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Open Breakdowns</p>
              <p className="text-2xl font-bold text-red-700">1</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Avg Equipment Runtime</p>
              <p className="text-2xl font-bold text-slate-800">8 <span className="text-base font-semibold text-slate-500">hrs</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Tiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tile 1 */}
        <Card 
          className="bg-white border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
          onClick={() => setCurrentTile('usage')}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <BarChart3 className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-800 mb-1">Equipment Usage</h3>
              <p className="text-sm text-slate-500">Log daily meter readings & diesel consumption</p>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-300 rotate-180 group-hover:text-blue-500 transition-colors" />
          </CardContent>
        </Card>

        {/* Tile 2 */}
        <Card 
          className="bg-white border-slate-200 hover:border-red-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
          onClick={() => setCurrentTile('maintenance')}
        >
          <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-red-100 text-red-700 rounded-xl group-hover:bg-red-600 group-hover:text-white transition-colors">
              <Wrench className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-slate-800">Maintenance & Breakdowns</h3>
                <Badge variant="destructive" className="bg-red-500 hover:bg-red-600">1 Open</Badge>
              </div>
              <p className="text-sm text-slate-500">Log services, breakdowns & parts used</p>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-300 rotate-180 group-hover:text-red-500 transition-colors" />
          </CardContent>
        </Card>

        {/* Tile 3 */}
        <Card 
          className="bg-white border-slate-200 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group"
          onClick={() => setCurrentTile('diesel')}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-amber-100 text-amber-700 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <Fuel className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-800 mb-1">Daily Diesel Requirement</h3>
              <p className="text-sm text-slate-500">Plan diesel allocation per machine</p>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-300 rotate-180 group-hover:text-amber-500 transition-colors" />
          </CardContent>
        </Card>

        {/* Tile 4 */}
        <Card 
          className="bg-slate-50 border-slate-200 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer group"
          onClick={() => setCurrentTile('master')}
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-slate-200 text-slate-700 rounded-xl group-hover:bg-slate-700 group-hover:text-white transition-colors">
              <Database className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-slate-800">Equipment Master</h3>
                <Badge variant="outline" className="text-slate-500 border-slate-300 bg-white">Admin</Badge>
              </div>
              <p className="text-sm text-slate-500">Manage equipment registry & norms</p>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-300 rotate-180 group-hover:text-slate-500 transition-colors" />
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderUsage = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Today's Usage & Fuel Logs</h2>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Save Logs</Button>
      </div>
      <Card className="bg-white border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[300px]">Equipment</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>Meter Reading (Closing)</TableHead>
              <TableHead>Diesel Consumed (L)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { id: 1, name: "Excavator PC210", reg: "MH-12-AB-1234", plant: "HMP Plant A", meter: "12,450", fuel: "85" },
              { id: 2, name: "Grader GD535", reg: "MH-12-CD-5678", plant: "HMP Plant A", meter: "8,320", fuel: "60" },
              { id: 3, name: "JCB Backhoe Loader", reg: "MH-14-XY-9012", plant: "RMC Plant B", meter: "5,100", fuel: "45" },
              { id: 4, name: "Vibratory Roller", reg: "MH-12-PQ-3456", plant: "WMM Plant", meter: "3,890", fuel: "55" },
              { id: 5, name: "Transit Mixer 1", reg: "MH-14-KL-7890", plant: "RMC Plant B", meter: "145,200 km", fuel: "40" },
            ].map((eq) => (
              <TableRow key={eq.id}>
                <TableCell>
                  <div className="font-medium text-slate-800">{eq.name}</div>
                  <Badge variant="secondary" className="mt-1 text-[10px] bg-slate-100 text-slate-600">{eq.plant}</Badge>
                </TableCell>
                <TableCell className="text-slate-600">{eq.reg}</TableCell>
                <TableCell>
                  <Input defaultValue={eq.meter} className="w-32 bg-slate-50 border-slate-200" />
                </TableCell>
                <TableCell>
                  <Input defaultValue={eq.fuel} type="number" className="w-24 bg-slate-50 border-slate-200" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );

  const renderMaintenance = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Breakdowns & Maintenance</h2>
        <Button size="sm" className="bg-red-600 hover:bg-red-700"><AlertCircle className="w-4 h-4 mr-2" /> Report Breakdown</Button>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Open Issues</h3>
        <Card className="bg-white border-red-200 border-l-4 border-l-red-500 shadow-sm overflow-hidden">
          <div className="p-4 flex items-start gap-4">
            <div className="p-2 bg-red-100 text-red-600 rounded-full mt-1">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">Excavator PC210</h4>
                  <p className="text-slate-600 mt-1">Hydraulic pump leakage, losing pressure during operation.</p>
                </div>
                <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-0">Open</Badge>
              </div>
              <div className="flex items-center gap-4 mt-4 text-sm text-slate-500">
                <div className="flex items-center gap-1"><Clock className="w-4 h-4" /> Reported Today, 08:30 AM</div>
                <div className="flex items-center gap-1"><Truck className="w-4 h-4" /> MH-12-AB-1234</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50">Update Status</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700">Mark Resolved</Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4 mt-8">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recently Resolved</h3>
        {[
          { name: "Grader GD535", issue: "Blade control valve replacement", date: "Yesterday, 14:00 PM" },
          { name: "Transit Mixer 2", issue: "Routine oil change and filters", date: "Oct 12, 09:00 AM" }
        ].map((item, i) => (
          <Card key={i} className="bg-slate-50 border-slate-200 shadow-none">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-700">{item.name}</h4>
                  <p className="text-sm text-slate-500">{item.issue}</p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 mb-2">Resolved</Badge>
                <div className="text-xs text-slate-400">{item.date}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderDiesel = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Plan Daily Diesel Requirement</h2>
        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">Submit Indent</Button>
      </div>
      <Card className="bg-white border-slate-200">
        <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800">
            <Fuel className="h-5 w-5" />
            <span className="font-medium">Total Requirement for Tomorrow</span>
          </div>
          <span className="text-2xl font-bold text-amber-700">620 L</span>
        </div>
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Equipment</TableHead>
              <TableHead>Current Stock Est.</TableHead>
              <TableHead>Planned Work (hrs)</TableHead>
              <TableHead>Required Qty (L)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { id: 1, name: "Excavator PC210", stock: "20 L", hrs: "10", req: "150" },
              { id: 2, name: "Grader GD535", stock: "45 L", hrs: "8", req: "120" },
              { id: 3, name: "JCB Backhoe Loader", stock: "10 L", hrs: "12", req: "90" },
              { id: 4, name: "Vibratory Roller", stock: "55 L", hrs: "8", req: "80" },
              { id: 5, name: "Transit Mixer 1", stock: "30 L", hrs: "10", req: "100" },
              { id: 6, name: "Generator 500kVA", stock: "120 L", hrs: "16", req: "80" },
            ].map((eq) => (
              <TableRow key={eq.id}>
                <TableCell className="font-medium text-slate-800">{eq.name}</TableCell>
                <TableCell className="text-slate-500">{eq.stock}</TableCell>
                <TableCell>
                  <Input defaultValue={eq.hrs} className="w-20 bg-slate-50" />
                </TableCell>
                <TableCell>
                  <div className="relative w-32">
                    <Input defaultValue={eq.req} type="number" className="w-full bg-amber-50/50 border-amber-200 focus-visible:ring-amber-500 pr-8 font-medium" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">L</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );

  const renderMaster = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Equipment Master Registry</h2>
        <Button size="sm" className="bg-slate-800 hover:bg-slate-900 text-white">Add Equipment</Button>
      </div>
      
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search equipment or registration..." className="pl-9 bg-white" />
        </div>
        <select className="flex h-10 w-[180px] items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <option>All Types</option>
          <option>Earthmoving</option>
          <option>Transport</option>
          <option>Stationary</option>
        </select>
      </div>

      <Card className="bg-white border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Equipment Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>Assigned Plant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { id: 1, name: "Excavator PC210", type: "Earthmoving", reg: "MH-12-AB-1234", plant: "HMP Plant A", status: "Active" },
              { id: 2, name: "Grader GD535", type: "Earthmoving", reg: "MH-12-CD-5678", plant: "HMP Plant A", status: "Active" },
              { id: 3, name: "JCB Backhoe Loader", type: "Earthmoving", reg: "MH-14-XY-9012", plant: "RMC Plant B", status: "Active" },
              { id: 4, name: "Vibratory Roller", type: "Compaction", reg: "MH-12-PQ-3456", plant: "WMM Plant", status: "Inactive" },
              { id: 5, name: "Transit Mixer 1", type: "Transport", reg: "MH-14-KL-7890", plant: "RMC Plant B", status: "Active" },
              { id: 6, name: "Generator 500kVA", type: "Stationary", reg: "N/A", plant: "Crusher Plant", status: "Active" },
            ].map((eq) => (
              <TableRow key={eq.id}>
                <TableCell className="font-medium text-slate-800">{eq.name}</TableCell>
                <TableCell className="text-slate-500 text-sm">{eq.type}</TableCell>
                <TableCell className="text-slate-600 font-mono text-sm">{eq.reg}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">{eq.plant}</Badge>
                </TableCell>
                <TableCell>
                  {eq.status === 'Active' ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900">
                    <Settings className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {currentTile && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-slate-300 hover:text-white hover:bg-slate-800 rounded-full h-9 w-9 -ml-2 transition-colors"
                onClick={() => setCurrentTile(null)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xl">🔧</span>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Equipment & Fleet</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden sm:flex bg-slate-800/50 text-slate-300 border-slate-700 font-medium">
              NH-48 Bypass
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {!currentTile && renderLevel1()}
        {currentTile === 'usage' && renderUsage()}
        {currentTile === 'maintenance' && renderMaintenance()}
        {currentTile === 'diesel' && renderDiesel()}
        {currentTile === 'master' && renderMaster()}
      </main>
    </div>
  );
}

export default EquipmentFleet;
