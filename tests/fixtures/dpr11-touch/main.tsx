import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BillItemPicker, type BillItem } from "@/components/BillItemPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import "@/index.css";

const equipment = Array.from({ length: 60 }, (_, index) => ({
  id: index + 1,
  label: `Equipment ${String(index + 1).padStart(2, "0")} — ${
    index % 2 ? "HIRED: TEST VENDOR" : "HLC OWN"
  }`,
}));

const billItems: BillItem[] = Array.from({ length: 60 }, (_, index) => ({
  id: 1000 + index,
  description: `Long BOQ activity description ${String(index + 1).padStart(2, "0")}`,
  itemCode: `BOQ-${String(index + 1).padStart(2, "0")}`,
  itemName: `Activity ${String(index + 1).padStart(2, "0")}`,
  unit: "cum",
  canonicalUnit: "cum",
  dprConversionFactor: 1,
  categoryName: "BILL 1",
  categorySourceBillNo: "1",
  categorySortOrder: 1,
  includeInDpr: true,
  sortOrder: index + 1,
}));

function Fixture() {
  const [equipmentId, setEquipmentId] = useState("");
  const [itemId, setItemId] = useState<number | null>(null);

  return (
    <main className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300 p-4">
      <h1 className="text-xl font-semibold">DPR-11 real list components</h1>
      <Card>
        <CardHeader><CardTitle>Equipment Log</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4 relative">
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger data-testid="equipment-trigger">
                <SelectValue placeholder="Select equipment..." />
              </SelectTrigger>
              <SelectContent>
                {equipment.map((entry) => (
                  <SelectItem
                    key={entry.id}
                    value={String(entry.id)}
                    data-testid={`equipment-option-${entry.id}`}
                  >
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Progress / Work Activity</CardTitle></CardHeader>
        <CardContent>
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
            <BillItemPicker
              items={billItems}
              value={itemId}
              onChange={(id) => setItemId(id)}
              testidPrefix="touch-boq"
              stacked
              labels={false}
            />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);