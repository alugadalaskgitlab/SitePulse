import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, ChevronLeft, PackageCheck, ShoppingCart, CheckCircle2, AlertCircle, User, Calendar, FileText, ListTodo } from "lucide-react";

type ItemAction = "issue" | "procure" | "split";

type StoreItem = {
  id: number;
  material: string;
  reqQty: number;
  uom: string;
  purpose: string;
  urgency: string;
  stockAvailable: number;
  issueQty: number;
  procureQty: number;
  action: ItemAction;
  notes: string;
};

const INITIAL_ITEMS: StoreItem[] = [
  { id: 1, material: "Bitumen (VG-30)", reqQty: 5.0, uom: "MT", purpose: "Road patch repair — Km 12.4", urgency: "urgent", stockAvailable: 2.5, issueQty: 2.5, procureQty: 2.5, action: "split", notes: "" },
  { id: 2, material: "Aggregate 20mm", reqQty: 12.0, uom: "MT", purpose: "Road patch repair — Km 12.4", urgency: "urgent", stockAvailable: 0, issueQty: 0, procureQty: 12.0, action: "procure", notes: "Out of stock — fast-track PI" },
  { id: 3, material: "Stone Dust", reqQty: 4.0, uom: "MT", purpose: "Road patch repair — Km 12.4", urgency: "normal", stockAvailable: 8.5, issueQty: 4.0, procureQty: 0, action: "issue", notes: "" },
];

const URGENCY_COLOR: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  normal: "bg-gray-100 text-gray-600 border-gray-200",
};

export function IrnStores() {
  const [items, setItems] = useState<StoreItem[]>(INITIAL_ITEMS);
  const [storeNotes, setStoreNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function updateItem(id: number, field: keyof StoreItem, value: string | number | ItemAction) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "action") {
          if (value === "issue") { updated.issueQty = item.reqQty; updated.procureQty = 0; }
          else if (value === "procure") { updated.issueQty = 0; updated.procureQty = item.reqQty; }
          else if (value === "split") { updated.issueQty = item.stockAvailable; updated.procureQty = item.reqQty - item.stockAvailable; }
        }
        if (field === "issueQty") { updated.procureQty = Math.max(0, item.reqQty - Number(value)); }
        if (field === "procureQty") { updated.issueQty = Math.max(0, item.reqQty - Number(value)); }
        return updated;
      })
    );
  }

  const issueCount = items.filter((i) => i.action === "issue" || (i.action === "split" && i.issueQty > 0)).length;
  const procureCount = items.filter((i) => i.action === "procure" || (i.action === "split" && i.procureQty > 0)).length;

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex flex-col items-center justify-center gap-6 px-6">
        <div className="bg-white border rounded-xl p-8 max-w-md w-full text-center shadow-sm space-y-4">
          <div className="p-4 bg-green-100 rounded-full w-fit mx-auto">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Stores Verification Complete</h2>
          <p className="text-sm text-gray-500">IRN HLC/IRN/2026/0008 has been verified. The following actions have been taken:</p>
          <div className="space-y-2 text-left">
            {issueCount > 0 && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded p-2.5 text-sm text-green-700">
                <PackageCheck className="h-4 w-4 shrink-0" />
                <span><strong>{issueCount} item{issueCount > 1 ? "s" : ""}</strong> issued from store stock — Issue Voucher IV/2026/0045 generated</span>
              </div>
            )}
            {procureCount > 0 && (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded p-2.5 text-sm text-purple-700">
                <ListTodo className="h-4 w-4 shrink-0" />
                <span><strong>{procureCount} item{procureCount > 1 ? "s" : ""}</strong> added to Procurement Queue — a procurement officer will batch these into a PI or DR</span>
              </div>
            )}
          </div>
          <Button variant="outline" onClick={() => setConfirmed(false)} className="w-full mt-2 text-sm">← Back to IRN</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-0.5">
          <button className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm">
            <ChevronLeft className="h-4 w-4" /> IRN List
          </button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded">
              <ClipboardList className="h-4 w-4 text-amber-700" />
            </div>
            <span className="font-semibold text-gray-900">Stores Verification</span>
          </div>
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium ml-1">Pending Stores Check</Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
        {/* IRN meta */}
        <div className="bg-white border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">IRN No.</p>
                <p className="font-mono font-semibold text-amber-700 text-xs">HLC/IRN/2026/0008</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Raised by</p>
                <p className="font-medium text-gray-800 text-xs">Suresh K. — Site</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="font-medium text-gray-800 text-xs">01 Jun 2026</p>
              </div>
            </div>
          </div>
          <Separator className="my-3" />
          <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Purpose:</span> Road patch repair — Km 12.4, SH-64</p>
        </div>

        {/* Instruction banner */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>For each item: check physical stock, then choose an action. <strong>Issue from Store</strong> generates an Issue Voucher immediately. <strong>Route to Procurement Queue</strong> adds the item to a queue — a procurement officer will batch it into a PI or DR (no PI is raised automatically). <strong>Split</strong> issues available stock now and queues the shortfall for procurement.</span>
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-white border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium">#{idx + 1}</span>
                    <span className="font-semibold text-gray-800 text-sm">{item.material}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${URGENCY_COLOR[item.urgency]}`}>
                      {item.urgency === "urgent" ? "🔴 Urgent" : item.urgency === "high" ? "🟠 High" : "Normal"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 ml-7">{item.purpose}</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs text-gray-400">Requested</p>
                  <p className="font-bold text-gray-800">{item.reqQty} <span className="font-normal text-gray-500">{item.uom}</span></p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-12 gap-3 items-end">
                {/* Stock in hand */}
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs text-gray-500">Stock in Hand ({item.uom})</Label>
                  <Input
                    type="number"
                    value={item.stockAvailable}
                    onChange={(e) => updateItem(item.id, "stockAvailable", Number(e.target.value))}
                    className={`h-8 text-sm font-medium ${item.stockAvailable >= item.reqQty ? "border-green-300 bg-green-50" : item.stockAvailable === 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
                  />
                </div>

                {/* Action */}
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs text-gray-500">Action</Label>
                  <Select value={item.action} onValueChange={(v) => updateItem(item.id, "action", v as ItemAction)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="issue" className="text-xs text-green-700">✅ Issue from Store</SelectItem>
                      <SelectItem value="procure" className="text-xs text-purple-700">📋 Add to Procurement Queue</SelectItem>
                      <SelectItem value="split" className="text-xs text-blue-700">⚖️ Split — issue now + queue balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Issue qty */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-gray-500">Issue ({item.uom})</Label>
                  <Input
                    type="number"
                    value={item.issueQty}
                    onChange={(e) => updateItem(item.id, "issueQty", Number(e.target.value))}
                    disabled={item.action === "procure"}
                    className="h-8 text-sm bg-green-50 border-green-200 disabled:opacity-50"
                  />
                </div>

                {/* Procure qty */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-gray-500">Procure ({item.uom})</Label>
                  <Input
                    type="number"
                    value={item.procureQty}
                    onChange={(e) => updateItem(item.id, "procureQty", Number(e.target.value))}
                    disabled={item.action === "issue"}
                    className="h-8 text-sm bg-purple-50 border-purple-200 disabled:opacity-50"
                  />
                </div>

                {/* Notes */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-gray-500">Notes</Label>
                  <Input
                    value={item.notes}
                    onChange={(e) => updateItem(item.id, "notes", e.target.value)}
                    placeholder="optional"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Action summary chip */}
              <div className="flex gap-2 mt-1">
                {item.issueQty > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">
                    <PackageCheck className="h-3 w-3" /> Issue {item.issueQty} {item.uom} from stock
                  </span>
                )}
                {item.procureQty > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                    <ListTodo className="h-3 w-3" /> {item.procureQty} {item.uom} → Procurement Queue
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Stores notes */}
        <div className="bg-white border rounded-lg p-4 space-y-2">
          <Label className="text-xs font-medium text-gray-700">Storekeeper Remarks</Label>
          <Textarea
            value={storeNotes}
            onChange={(e) => setStoreNotes(e.target.value)}
            placeholder="Any remarks for the team or procurement team…"
            className="text-sm resize-none h-16"
          />
        </div>

        {/* Summary + actions */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-6 text-sm mb-4">
            <div className="flex items-center gap-2 text-green-700">
              <PackageCheck className="h-4 w-4" />
              <span>{issueCount} item{issueCount !== 1 ? "s" : ""} to issue from store</span>
            </div>
            <div className="flex items-center gap-2 text-purple-700">
              <ListTodo className="h-4 w-4" />
              <span>{procureCount} item{procureCount !== 1 ? "s" : ""} to add to Procurement Queue</span>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" className="text-sm h-9">Cancel</Button>
            <Button
              onClick={() => setConfirmed(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm h-9 px-6 gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm Verification
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
