import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Plus, Search, Filter, ChevronRight, AlertCircle, Clock, CheckCircle2, PackageCheck, ShoppingCart, MoreHorizontal } from "lucide-react";

const IRN_DATA = [
  { id: 1, irnNo: "HLC/IRN/2026/0008", date: "01 Jun 2026", raisedBy: "Suresh K.", section: "Site", status: "stores_check", items: 3, urgency: "urgent", purpose: "Road patch repair — Km 12.4" },
  { id: 2, irnNo: "HLC/IRN/2026/0007", date: "31 May 2026", raisedBy: "Ramesh P.", section: "HMP Plant", status: "partially_fulfilled", items: 5, urgency: "normal", purpose: "Heating session consumables" },
  { id: 3, irnNo: "HLC/IRN/2026/0006", date: "30 May 2026", raisedBy: "Anand S.", section: "Equipment", status: "fulfilled", items: 2, urgency: "normal", purpose: "Generator maintenance parts" },
  { id: 4, irnNo: "HLC/IRN/2026/0005", date: "30 May 2026", raisedBy: "Vijay M.", section: "Site", status: "routed", items: 4, urgency: "urgent", purpose: "Formwork & shuttering for culvert" },
  { id: 5, irnNo: "HLC/IRN/2026/0004", date: "29 May 2026", raisedBy: "Suresh K.", section: "HMP Plant", status: "fulfilled", items: 1, urgency: "normal", purpose: "LDO tank repair sealant" },
  { id: 6, irnNo: "HLC/IRN/2026/0003", date: "29 May 2026", raisedBy: "Pradeep R.", section: "Equipment", status: "routed", items: 6, urgency: "high", purpose: "Hydraulic oil & filters — Paver" },
  { id: 7, irnNo: "HLC/IRN/2026/0002", date: "28 May 2026", raisedBy: "Ramesh P.", section: "Site", status: "fulfilled", items: 2, urgency: "normal", purpose: "Binding wire & chairs for RCC" },
  { id: 8, irnNo: "HLC/IRN/2026/0001", date: "28 May 2026", raisedBy: "Anand S.", section: "HMP Plant", status: "submitted", items: 3, urgency: "high", purpose: "Bitumen drum storage rack" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <MoreHorizontal className="h-3 w-3" /> },
  submitted: { label: "Submitted", color: "bg-blue-50 text-blue-700 border-blue-200", icon: <Clock className="h-3 w-3" /> },
  stores_check: { label: "Stores Check", color: "bg-amber-50 text-amber-700 border-amber-200", icon: <AlertCircle className="h-3 w-3" /> },
  fulfilled: { label: "Issued", color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  partially_fulfilled: { label: "Part. Issued", color: "bg-teal-50 text-teal-700 border-teal-200", icon: <PackageCheck className="h-3 w-3" /> },
  routed: { label: "→ Purchase", color: "bg-purple-50 text-purple-700 border-purple-200", icon: <ShoppingCart className="h-3 w-3" /> },
};

const URGENCY_CONFIG: Record<string, string> = {
  normal: "bg-gray-100 text-gray-600 border-gray-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

export function IrnList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  const filtered = IRN_DATA.filter((r) => {
    const matchSearch = r.irnNo.toLowerCase().includes(search.toLowerCase()) || r.raisedBy.toLowerCase().includes(search.toLowerCase()) || r.purpose.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchSection = sectionFilter === "all" || r.section === sectionFilter;
    return matchSearch && matchStatus && matchSection;
  });

  const pendingCount = IRN_DATA.filter((r) => r.status === "submitted" || r.status === "stores_check").length;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <ClipboardList className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">Internal Requisitions</h1>
            <p className="text-xs text-gray-500 mt-0.5">IRN — Raise → Stores Check → Issue / Procure</p>
          </div>
        </div>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2 h-9">
          <Plus className="h-4 w-4" />
          Raise IRN
        </Button>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-6 text-sm">
        {[
          { label: "Total (May–Jun)", value: IRN_DATA.length, color: "text-gray-800" },
          { label: "Pending action", value: pendingCount, color: "text-amber-600 font-semibold" },
          { label: "Issued from stock", value: IRN_DATA.filter(r => r.status === "fulfilled" || r.status === "partially_fulfilled").length, color: "text-green-700" },
          { label: "Routed to PI/DR", value: IRN_DATA.filter(r => r.status === "routed").length, color: "text-purple-700" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`text-base font-bold ${s.color}`}>{s.value}</span>
            <span className="text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="px-6 py-3 flex items-center gap-3 bg-white border-b">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search IRN, raiser, purpose…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="stores_check">Stores Check</SelectItem>
            <SelectItem value="partially_fulfilled">Part. Issued</SelectItem>
            <SelectItem value="fulfilled">Issued</SelectItem>
            <SelectItem value="routed">→ Purchase</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            <SelectItem value="Site">Site</SelectItem>
            <SelectItem value="HMP Plant">HMP Plant</SelectItem>
            <SelectItem value="Equipment">Equipment</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {IRN_DATA.length}</span>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        <div className="bg-white border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 text-xs">
                <TableHead className="font-semibold text-gray-600 py-2.5">IRN No.</TableHead>
                <TableHead className="font-semibold text-gray-600 py-2.5">Date</TableHead>
                <TableHead className="font-semibold text-gray-600 py-2.5">Raised By</TableHead>
                <TableHead className="font-semibold text-gray-600 py-2.5">Section</TableHead>
                <TableHead className="font-semibold text-gray-600 py-2.5">Purpose</TableHead>
                <TableHead className="font-semibold text-gray-600 py-2.5 text-center">Items</TableHead>
                <TableHead className="font-semibold text-gray-600 py-2.5">Urgency</TableHead>
                <TableHead className="font-semibold text-gray-600 py-2.5">Status</TableHead>
                <TableHead className="py-2.5 w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const sc = STATUS_CONFIG[row.status];
                return (
                  <TableRow key={row.id} className="hover:bg-gray-50 cursor-pointer text-sm">
                    <TableCell className="font-mono text-xs font-semibold text-amber-700 py-3">{row.irnNo}</TableCell>
                    <TableCell className="text-gray-500 text-xs py-3">{row.date}</TableCell>
                    <TableCell className="text-gray-700 py-3">{row.raisedBy}</TableCell>
                    <TableCell className="py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border">{row.section}</span>
                    </TableCell>
                    <TableCell className="text-gray-600 text-xs max-w-[200px] truncate py-3">{row.purpose}</TableCell>
                    <TableCell className="text-center text-gray-700 font-medium py-3">{row.items}</TableCell>
                    <TableCell className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${URGENCY_CONFIG[row.urgency]}`}>
                        {row.urgency === "urgent" ? "🔴 Urgent" : row.urgency === "high" ? "🟠 High" : "Normal"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${sc.color}`}>
                        {sc.icon}{sc.label}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
