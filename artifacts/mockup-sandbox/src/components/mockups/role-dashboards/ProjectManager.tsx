import React from "react";
import { 
  AlertTriangle, 
  Calendar, 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  CreditCard, 
  DollarSign, 
  FileText, 
  LayoutDashboard, 
  MoreVertical, 
  Package, 
  ShoppingCart, 
  TrendingDown, 
  TrendingUp,
  Settings,
  Bell,
  Search
} from "lucide-react";
import "./_projectmanager.css";

// --- Minimal Mock UI Components ---
const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`pm-card ${className}`}>{children}</div>
);

const CardHeader = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`px-6 py-4 border-b border-slate-100 ${className}`}>{children}</div>
);

const CardTitle = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <h3 className={`text-lg font-semibold text-slate-800 ${className}`}>{children}</h3>
);

const CardContent = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

const Badge = ({ children, variant = "default", className = "" }: { children: React.ReactNode, variant?: "default" | "success" | "warning" | "danger" | "outline", className?: string }) => {
  const variants = {
    default: "bg-slate-100 text-slate-800",
    success: "bg-green-100 text-green-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    outline: "border border-slate-200 text-slate-600"
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

const ProgressBar = ({ value, variant = "default", className = "" }: { value: number, variant?: "default" | "success" | "warning" | "danger", className?: string }) => {
  const variants = {
    default: "bg-green-600",
    success: "bg-green-500",
    warning: "bg-amber-500",
    danger: "bg-red-500"
  };
  return (
    <div className={`w-full bg-slate-100 rounded-full h-2 ${className}`}>
      <div className={`${variants[variant]} h-2 rounded-full`} style={{ width: `${value}%` }}></div>
    </div>
  );
};

// --- Main Dashboard Component ---

export function ProjectManager() {
  return (
    <div className="pm-dashboard flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 bg-green-700 text-white rounded-md font-bold text-xl">
            SP
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">NH-44 Highway Expansion</h1>
            <p className="text-xs text-slate-500 font-medium">Project Manager Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search BOQ, IRNs..." 
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-md text-sm w-64 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 text-slate-400 hover:text-slate-600 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-600">
              <Settings className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600 border border-slate-300 ml-2">
              JD
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Schedule Variance</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-800">42%</h3>
                  <span className="text-sm text-red-600 font-medium flex items-center">
                    <TrendingDown className="w-3 h-3 mr-1" /> -4% Actual
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Planned: 46% completion</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <Calendar className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Financial Spend</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-800">₹45.2Cr</h3>
                  <span className="text-sm text-green-600 font-medium flex items-center">
                    <TrendingDown className="w-3 h-3 mr-1" /> 2% under
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Budget YTD: ₹46.1Cr</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                <DollarSign className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Open Procurement (PI)</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-800">18</h3>
                  <span className="text-sm text-slate-500 font-medium">Pending</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Value: ₹2.4Cr awaiting approval</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <ShoppingCart className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Pending Vendor Bills</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-800">12</h3>
                  <span className="text-sm text-red-600 font-medium flex items-center">
                    3 overdue
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Total Value: ₹85.4L</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                <FileText className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column (Schedule & Critical Path) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Critical Path Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Critical Path: Behind Schedule
                </CardTitle>
                <button className="text-sm text-green-700 hover:text-green-800 font-medium flex items-center">
                  View Work Programme <ChevronRight className="w-4 h-4" />
                </button>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="px-6 py-3 font-medium">BOQ Ref / Activity</th>
                      <th className="px-6 py-3 font-medium">Progress</th>
                      <th className="px-6 py-3 font-medium text-right">Variance</th>
                      <th className="px-6 py-3 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">Earthwork Excavation (Ch 12-18km)</div>
                        <div className="text-xs text-slate-500 mt-1">BOQ: 2.01.1 • Planned finish: 12 Oct</div>
                      </td>
                      <td className="px-6 py-4 w-48">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">68%</span>
                          <span className="text-slate-500">85% Plan</span>
                        </div>
                        <ProgressBar value={68} variant="danger" />
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-red-600">
                        -14 Days
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="danger">Critical</Badge>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">GSB Laying (Ch 0-5km)</div>
                        <div className="text-xs text-slate-500 mt-1">BOQ: 3.05.2 • Planned finish: 28 Oct</div>
                      </td>
                      <td className="px-6 py-4 w-48">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">22%</span>
                          <span className="text-slate-500">30% Plan</span>
                        </div>
                        <ProgressBar value={22} variant="warning" />
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-amber-600">
                        -6 Days
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="warning">Delayed</Badge>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">Bridge Minor Pier Construction</div>
                        <div className="text-xs text-slate-500 mt-1">BOQ: 5.12.1 • Planned finish: 05 Nov</div>
                      </td>
                      <td className="px-6 py-4 w-48">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">45%</span>
                          <span className="text-slate-500">50% Plan</span>
                        </div>
                        <ProgressBar value={45} variant="warning" />
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-amber-600">
                        -3 Days
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="warning">Watch</Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Upcoming Milestones */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Upcoming Milestones
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  <div className="p-4 flex items-start gap-4 hover:bg-slate-50">
                    <div className="w-12 h-12 rounded-lg bg-green-50 border border-green-100 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-xs text-green-600 font-bold uppercase">Oct</span>
                      <span className="text-lg text-green-700 font-bold leading-none">15</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-800">Complete Sub-grade Ch 0-10km</h4>
                      <p className="text-sm text-slate-500 mt-1">Value: ₹4.2Cr • Expected on time</p>
                    </div>
                    <Badge variant="success">On Track</Badge>
                  </div>
                  <div className="p-4 flex items-start gap-4 hover:bg-slate-50">
                    <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-100 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-xs text-amber-600 font-bold uppercase">Oct</span>
                      <span className="text-lg text-amber-700 font-bold leading-none">28</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-800">Major Bridge Superstructure Ready</h4>
                      <p className="text-sm text-slate-500 mt-1">Value: ₹12.5Cr • Depends on Pier completion</p>
                    </div>
                    <Badge variant="warning">At Risk</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Right Column (Procurement & Materials) */}
          <div className="space-y-6">
            
            {/* Material Demand vs Stock */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-5 h-5 text-slate-600" />
                  Material Shortages (30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-800">Bitumen VG-30</span>
                    <span className="text-red-600 font-medium">Short 450 MT</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 flex">
                    <div className="bg-green-500 h-2 rounded-l-full" style={{ width: '40%' }} title="In Stock"></div>
                    <div className="bg-blue-400 h-2" style={{ width: '20%' }} title="In Transit"></div>
                    <div className="bg-red-400 h-2 rounded-r-full" style={{ width: '40%' }} title="Shortfall"></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>Demand: 1200 MT</span>
                    <span>Stock: 480 MT</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-800">Aggregate 20mm</span>
                    <span className="text-amber-600 font-medium">Short 1200 MT</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 flex">
                    <div className="bg-green-500 h-2 rounded-l-full" style={{ width: '60%' }} title="In Stock"></div>
                    <div className="bg-blue-400 h-2" style={{ width: '10%' }} title="In Transit"></div>
                    <div className="bg-amber-400 h-2 rounded-r-full" style={{ width: '30%' }} title="Shortfall"></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>Demand: 4000 MT</span>
                    <span>Stock: 2400 MT</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-800">Cement OPC 43</span>
                    <span className="text-slate-500 font-medium">Adequate</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 flex">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '85%' }} title="In Stock"></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>Demand: 800 MT</span>
                    <span>Stock: 1100 MT</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button className="w-full py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    Raise Purchase Indents
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Procurement Pipeline */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-500" />
                  Procurement Actions
                </CardTitle>
              </CardHeader>
              <div className="divide-y divide-slate-100">
                <div className="p-4 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">PI Approvals Required</h4>
                    <p className="text-xs text-slate-500 mt-0.5">5 Purchase Indents waiting</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-800">₹84.5L</div>
                    <Badge variant="warning" className="mt-1">Action</Badge>
                  </div>
                </div>
                <div className="p-4 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Open IRNs (Site)</h4>
                    <p className="text-xs text-slate-500 mt-0.5">14 Material requests</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-800">Review</div>
                  </div>
                </div>
                <div className="p-4 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Vendor Bills</h4>
                    <p className="text-xs text-slate-500 mt-0.5">8 Pending Certification</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-800">₹42.1L</div>
                    <Badge variant="danger" className="mt-1">Overdue</Badge>
                  </div>
                </div>
              </div>
            </Card>

          </div>
        </div>

      </main>
    </div>
  );
}
