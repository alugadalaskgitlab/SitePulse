import React, { useState } from "react";
import { 
  FileText, 
  TrendingUp, 
  Package, 
  Fuel, 
  DollarSign, 
  ChevronLeft, 
  BarChart,
  ArrowLeft,
  Calendar,
  Filter
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TileId = string | null;

export function ReportsAnalysis() {
  const [currentTile, setCurrentTile] = useState<TileId>(null);

  const handleBack = () => setCurrentTile(null);

  if (currentTile === "Today's Plant Report") {
    return <TodaysPlantReport onBack={handleBack} />;
  }

  if (currentTile === "Stock Balances & Ledger") {
    return <StockBalancesLedger onBack={handleBack} />;
  }

  if (currentTile === "Vendor Bills & GRN") {
    return <VendorBills onBack={handleBack} />;
  }

  if (currentTile) {
    return <StubReport title={currentTile} onBack={handleBack} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      {/* Header */}
      <header className="bg-indigo-700 text-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-indigo-600 rounded-full h-8 w-8">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BarChart className="w-5 h-5 text-indigo-200" />
            Reports & Analysis
          </h1>
        </div>
        <div className="text-sm font-medium bg-indigo-800 px-3 py-1 rounded-full text-indigo-100">
          NH-48 Bypass
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-6">
        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-indigo-500 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Billed</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800">₹ 4.2 L</span>
                <span className="text-[10px] text-slate-400">This month</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Variance</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800">18 MT</span>
                <span className="text-[10px] text-red-500 font-medium">Pending inv.</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Dispatched</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800">142 MT</span>
                <span className="text-[10px] text-slate-400">Today</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Diesel</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800">380 L</span>
                <span className="text-[10px] text-slate-400">Book stock</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Production Reports */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <div className="w-1 h-5 bg-orange-500 rounded-full"></div>
            <h2 className="text-base font-semibold text-slate-800">Production Reports</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Tile title="Today's Plant Report" icon={FileText} onClick={() => setCurrentTile("Today's Plant Report")} />
            <Tile title="Historical Daily Reports" icon={Calendar} onClick={() => setCurrentTile("Historical Daily Reports")} />
            <Tile title="Heating Trends Report" icon={TrendingUp} onClick={() => setCurrentTile("Heating Trends Report")} />
          </div>
        </section>

        {/* Stock & Fuel Ledgers */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
            <h2 className="text-base font-semibold text-slate-800">Stock & Fuel Ledgers</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Tile title="Stock Balances & Ledger" icon={Package} onClick={() => setCurrentTile("Stock Balances & Ledger")} />
            <Tile title="Variance Report" icon={BarChart} onClick={() => setCurrentTile("Variance Report")} />
            <Tile title="Audit Report" icon={FileText} onClick={() => setCurrentTile("Audit Report")} />
            <Tile title="Diesel Procurement" icon={Fuel} onClick={() => setCurrentTile("Diesel Procurement")} />
            <Tile title="Bitumen Stock Tracker" icon={TrendingUp} onClick={() => setCurrentTile("Bitumen Stock Tracker")} />
            <Tile title="LDO Flow Meter" icon={Fuel} onClick={() => setCurrentTile("LDO Flow Meter")} />
          </div>
        </section>

        {/* Finance & Procurement */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <div className="w-1 h-5 bg-green-500 rounded-full"></div>
            <h2 className="text-base font-semibold text-slate-800">Finance & Procurement</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Tile title="Vendor Bills & GRN" icon={DollarSign} onClick={() => setCurrentTile("Vendor Bills & GRN")} />
            <Tile title="Party Statement" icon={FileText} onClick={() => setCurrentTile("Party Statement")} />
            <Tile title="Purchase Indents" icon={Package} onClick={() => setCurrentTile("Purchase Indents")} />
          </div>
        </section>
      </main>
    </div>
  );
}

function Tile({ title, icon: Icon, onClick }: { title: string; icon: any; onClick: () => void }) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all hover:border-indigo-200 group bg-white border-slate-200"
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-3 h-full min-h-[100px]">
        <div className="bg-slate-50 p-2 rounded-full group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
          <Icon className="w-5 h-5 text-slate-500 group-hover:text-indigo-600" />
        </div>
        <span className="text-sm font-medium text-slate-700 leading-tight">{title}</span>
      </CardContent>
    </Card>
  );
}

function ReportHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-600 -ml-2 hover:bg-slate-100 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      </div>
      <Button variant="outline" size="sm" className="gap-2 text-slate-600">
        <Filter className="w-4 h-4" /> Filter
      </Button>
    </header>
  );
}

function TodaysPlantReport({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      <ReportHeader title="Today's Plant Report" onBack={onBack} />
      
      <main className="p-4 max-w-3xl mx-auto space-y-6 mt-2">
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-indigo-900">
          <div>
            <p className="text-sm text-indigo-700/80 font-medium uppercase tracking-wider mb-1">Date</p>
            <p className="text-lg font-bold">24 Oct 2023</p>
          </div>
          <Badge className="bg-indigo-600 hover:bg-indigo-700">Finalized</Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">MT Produced</p>
              <p className="text-2xl font-bold text-slate-800">420.5</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">LDO Consumed</p>
              <p className="text-2xl font-bold text-slate-800">1,240 L</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Bitumen Used</p>
              <p className="text-2xl font-bold text-slate-800">21.4 MT</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Manpower</p>
              <p className="text-2xl font-bold text-slate-800">24</p>
            </CardContent>
          </Card>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Shifts</h2>
          <div className="space-y-4">
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b flex justify-between items-center">
                <span className="font-semibold text-slate-700">Day Shift</span>
                <span className="text-sm text-slate-500">08:00 - 20:00</span>
              </div>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 mb-1">Production</p>
                    <p className="font-medium text-slate-800">240 MT</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">LDO</p>
                    <p className="font-medium text-slate-800">710 L</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Operator</p>
                    <p className="font-medium text-slate-800">Raju</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b flex justify-between items-center">
                <span className="font-semibold text-slate-700">Night Shift</span>
                <span className="text-sm text-slate-500">20:00 - 08:00</span>
              </div>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 mb-1">Production</p>
                    <p className="font-medium text-slate-800">180.5 MT</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">LDO</p>
                    <p className="font-medium text-slate-800">530 L</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Operator</p>
                    <p className="font-medium text-slate-800">Ramesh</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

function StockBalancesLedger({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      <ReportHeader title="Stock Balances & Ledger" onBack={onBack} />
      
      <main className="p-4 max-w-5xl mx-auto space-y-6 mt-2">
        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[180px] font-semibold">Party Name</TableHead>
                  <TableHead className="font-semibold">Material</TableHead>
                  <TableHead className="text-right font-semibold">Opening</TableHead>
                  <TableHead className="text-right font-semibold">Receipts</TableHead>
                  <TableHead className="text-right font-semibold">Consumption</TableHead>
                  <TableHead className="text-right font-semibold text-indigo-700">Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Shree Enterprises</TableCell>
                  <TableCell>Aggregate 10mm</TableCell>
                  <TableCell className="text-right text-slate-500">450 MT</TableCell>
                  <TableCell className="text-right text-green-600">+ 120 MT</TableCell>
                  <TableCell className="text-right text-red-500">- 85 MT</TableCell>
                  <TableCell className="text-right font-bold text-slate-800">485 MT</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Shree Enterprises</TableCell>
                  <TableCell>Aggregate 20mm</TableCell>
                  <TableCell className="text-right text-slate-500">820 MT</TableCell>
                  <TableCell className="text-right text-green-600">+ 0 MT</TableCell>
                  <TableCell className="text-right text-red-500">- 140 MT</TableCell>
                  <TableCell className="text-right font-bold text-slate-800">680 MT</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Balaji Traders</TableCell>
                  <TableCell>Dust</TableCell>
                  <TableCell className="text-right text-slate-500">1,200 MT</TableCell>
                  <TableCell className="text-right text-green-600">+ 400 MT</TableCell>
                  <TableCell className="text-right text-red-500">- 220 MT</TableCell>
                  <TableCell className="text-right font-bold text-slate-800">1,380 MT</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Indian Oil</TableCell>
                  <TableCell>Bitumen VG-30</TableCell>
                  <TableCell className="text-right text-slate-500">45 MT</TableCell>
                  <TableCell className="text-right text-green-600">+ 20 MT</TableCell>
                  <TableCell className="text-right text-red-500">- 18 MT</TableCell>
                  <TableCell className="text-right font-bold text-slate-800">47 MT</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
}

function VendorBills({ onBack }: { onBack: () => void }) {
  const bills = [
    { id: "INV-2023-081", vendor: "Balaji Earthmovers", date: "22 Oct 2023", amount: "₹ 45,000", cat: "Equipment", status: "Approved" },
    { id: "INV-2023-082", vendor: "Shree Enterprises", date: "23 Oct 2023", amount: "₹ 1,12,500", cat: "Material", status: "Pending" },
    { id: "TR-9921", vendor: "Navkar Transport", date: "24 Oct 2023", amount: "₹ 28,400", cat: "Transport", status: "Pending" },
    { id: "INV-2023-083", vendor: "Indian Oil", date: "24 Oct 2023", amount: "₹ 8,45,000", cat: "Material", status: "Approved" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      <ReportHeader title="Vendor Bills & GRN" onBack={onBack} />
      
      <main className="p-4 max-w-4xl mx-auto space-y-4 mt-2">
        {bills.map(bill => (
          <Card key={bill.id} className="shadow-sm border-slate-200 hover:border-indigo-200 transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex gap-4 items-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{bill.vendor}</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <span>{bill.id}</span>
                    <span>•</span>
                    <span>{bill.date}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 justify-between sm:justify-end ml-14 sm:ml-0">
                <Badge variant="outline" className="bg-slate-50 text-slate-600 font-normal">
                  {bill.cat}
                </Badge>
                <div className="text-right">
                  <p className="font-bold text-slate-800">{bill.amount}</p>
                  <span className={`text-xs font-medium ${bill.status === 'Approved' ? 'text-green-600' : 'text-amber-500'}`}>
                    {bill.status}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}

function StubReport({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      <ReportHeader title={title} onBack={onBack} />
      
      <main className="p-4 max-w-3xl mx-auto mt-12">
        <Card className="border-dashed border-2 border-slate-300 shadow-none bg-transparent">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">{title}</h2>
            <p className="text-slate-500 max-w-sm">
              Select date range to generate this report. This module is currently under development.
            </p>
            <Button className="mt-6 bg-indigo-600 hover:bg-indigo-700">
              Select Date Range
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
