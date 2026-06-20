import React from "react";
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  IndianRupee, 
  Briefcase, 
  Calendar, 
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight
} from "lucide-react";
import "./_management.css";

// Components
const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`mgt-card p-6 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = "default" }: { children: React.ReactNode, variant?: "default" | "danger" | "warning" | "success" }) => {
  const variants = {
    default: "bg-slate-100 text-slate-700",
    danger: "bg-red-50 text-red-700 border border-red-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200"
  };
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

const ProgressBar = ({ value, colorClass = "mgt-bg-teal" }: { value: number, colorClass?: string }) => (
  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
    <div className={`h-full ${colorClass} rounded-full`} style={{ width: `${value}%` }} />
  </div>
);

export function Management() {
  return (
    <div className="mgt-theme min-h-screen w-full pb-12">
      {/* Alert Strip */}
      <div className="bg-red-50 border-b border-red-100 px-6 py-3 flex items-center justify-between text-sm text-red-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="w-4 h-4" />
            <span>Critical Alerts:</span>
          </div>
          <span className="hidden md:inline">• 2 Overdue Vendor Bills (₹42.5L)</span>
          <span className="hidden md:inline">• 1 Unapproved PI &gt; ₹10L (Bitumen)</span>
          <span className="hidden md:inline">• Schedule Slippage: Structure 3B (-4 days)</span>
        </div>
        <button className="text-red-700 hover:text-red-900 font-medium flex items-center gap-1">
          View All <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Executive Overview</h1>
            <p className="text-slate-500 mt-1 flex items-center gap-2 text-sm">
              <Briefcase className="w-4 h-4" /> NH-44 Highway Expansion Project
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-3 py-2 rounded-md border border-slate-200 shadow-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            Data updated today at 08:45 AM
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Portfolio Summary */}
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5 mgt-text-teal" />
                Project Health
              </h2>
              <Badge variant="success">On Track</Badge>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Contract Value</p>
                <p className="text-2xl font-bold text-slate-900">₹142.5 Cr</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Projected Finish</p>
                <p className="text-2xl font-bold text-slate-900">Nov 2024</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Physical Progress</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-slate-900">68%</p>
                  <span className="text-sm text-emerald-600 flex items-center"><ArrowUpRight className="w-3 h-3" /> 2% this mo</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Financial Progress</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-slate-900">62%</p>
                  <span className="text-sm text-emerald-600 flex items-center"><ArrowUpRight className="w-3 h-3" /> 5% this mo</span>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">Time Elapsed</span>
                  <span className="text-slate-500">75% (18 of 24 months)</span>
                </div>
                <ProgressBar value={75} colorClass="bg-amber-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">Work Completed (BC, DBM)</span>
                  <span className="text-slate-500">68% (34 of 50 km)</span>
                </div>
                <ProgressBar value={68} colorClass="bg-blue-500" />
              </div>
            </div>
          </Card>

          {/* Financial Snapshot */}
          <Card className="bg-slate-900 text-white border-none relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-teal-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-6 text-slate-100">
              <IndianRupee className="w-5 h-5 text-teal-400" />
              Financial Snapshot
            </h2>
            
            <div className="space-y-6 relative z-10">
              <div>
                <p className="text-sm text-slate-400 mb-1">Total Certified Value</p>
                <p className="text-3xl font-bold text-white">₹88.35 Cr</p>
                <p className="text-xs text-slate-400 mt-1">From RA Bill 1 to 14</p>
              </div>
              
              <div className="pt-4 border-t border-slate-800">
                <p className="text-sm text-slate-400 mb-1">Amount Received</p>
                <p className="text-xl font-semibold text-slate-200">₹79.50 Cr</p>
              </div>
              
              <div className="pt-4 border-t border-slate-800">
                <p className="text-sm text-slate-400 mb-1">Retention / Withheld</p>
                <p className="text-xl font-semibold text-amber-400">₹4.41 Cr</p>
                <p className="text-xs text-slate-400 mt-1">5% Retention Money</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Billing vs Payment */}
          <Card>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <BarChart3 className="w-5 h-5 mgt-text-teal" />
              Billing vs Receipts (Last 6 Months)
            </h2>
            
            <div className="h-64 flex items-end justify-between gap-2 px-2 relative">
              {/* Y-axis lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[10, 8, 6, 4, 2, 0].map((val) => (
                  <div key={val} className="flex items-center w-full border-b border-slate-100 h-0">
                    <span className="text-xs text-slate-400 -translate-y-2 -translate-x-8 absolute">₹{val}Cr</span>
                  </div>
                ))}
              </div>
              
              {/* Bars */}
              {[
                { m: "Oct", b: 4.2, r: 4.0 },
                { m: "Nov", b: 5.8, r: 4.2 },
                { m: "Dec", b: 6.5, r: 5.8 },
                { m: "Jan", b: 3.2, r: 6.5 },
                { m: "Feb", b: 7.1, r: 3.0 },
                { m: "Mar", b: 8.5, r: 0 }
              ].map((data) => (
                <div key={data.m} className="flex flex-col items-center gap-2 z-10 w-1/6">
                  <div className="flex items-end gap-1 w-full justify-center h-[200px]">
                    <div className="w-1/3 bg-slate-200 rounded-t-sm" style={{ height: `${(data.b / 10) * 100}%` }}></div>
                    <div className="w-1/3 mgt-bg-teal rounded-t-sm" style={{ height: `${(data.r / 10) * 100}%` }}></div>
                  </div>
                  <span className="text-xs text-slate-500">{data.m}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-6 mt-6">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="w-3 h-3 bg-slate-200 rounded-sm"></div> Billed
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="w-3 h-3 mgt-bg-teal rounded-sm"></div> Received
              </div>
            </div>
          </Card>

          {/* Cost Benchmarks */}
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-6">
                <TrendingDown className="w-5 h-5 mgt-text-teal" />
                Cost Benchmarks (MTD)
              </h2>
              
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Equipment & Labour</p>
                      <p className="text-xs text-slate-500">Actual vs Allowed (BOQ)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">₹45.2L</p>
                      <p className="text-xs text-slate-500">Limit: ₹42.0L</p>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-red-500" style={{ width: '100%' }}></div>
                  </div>
                  <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> 7.6% Over budget
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Materials (Bitumen, Aggregates)</p>
                      <p className="text-xs text-slate-500">Actual vs Allowed (BOQ)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">₹1.82 Cr</p>
                      <p className="text-xs text-slate-500">Limit: ₹1.95 Cr</p>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '93%' }}></div>
                  </div>
                  <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 6.7% Under budget
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Recent Approvals Needed</h2>
                <Badge variant="warning">3 Pending</Badge>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-md border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">Vendor Bill: Sharma Transports</p>
                    <p className="text-xs text-slate-500">Aggregate transport • ₹12.5L</p>
                  </div>
                  <div className="text-xs text-slate-400">2h ago</div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">Work Programme Revision</p>
                    <p className="text-xs text-slate-500">Requested by Site Engineer</p>
                  </div>
                  <div className="text-xs text-slate-400">1d ago</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Management;