// Cascading "Bill → Item" picker for DPR activity selection.
// Field 1 = the BOQ Bill / Section (exactly as imported from Excel, e.g. "BILL No. 1 SITE CLEARANCE").
// Field 2 = only the items inside the chosen bill (short name, full text on hover).
// Reused by both the Road DPR and the Structure DPR.

import { useMemo, useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export type BillItem = {
  id: number;
  description: string;
  itemCode: string | null;
  itemName: string | null;
  unit: string;
  dprConversionFactor: number | null;
  categoryName?: string | null;
  sortOrder?: number | null;
};

// Same smart short-name used elsewhere — strips boilerplate, keeps grade + location.
function shortItemName(full?: string | null): string {
  if (!full) return "";
  let s = String(full).replace(/\s+/g, " ").trim();
  const PREFIXES = [
    /^providing\s*(&|and)\s*laying\s*(in\s*position\s*)?(of\s*)?/i,
    /^providing\s*(&|and)\s*fixing\s*(of\s*)?/i,
    /^providing\s*(&|and)\s*casting\s*(of\s*)?/i,
    /^providing,?\s*laying\s*(&|and)?\s*(compacting|finishing)?\s*(of\s*)?/i,
    /^providing\s*(of\s*)?/i,
    /^supplying\s*(&|and)\s*(laying|fixing|installing|stacking)?\s*(of\s*)?/i,
    /^supply\s*(&|and)\s*(laying|fixing)?\s*(of\s*)?/i,
    /^construction\s*of\s*/i,
    /^constructing\s*(of\s*)?/i,
    /^laying\s*(of\s*)?/i,
    /^casting\s*(of\s*)?/i,
    /^fixing\s*(of\s*)?/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of PREFIXES) {
      const next = s.replace(re, "");
      if (next !== s) { s = next.trim(); changed = true; }
    }
  }
  s = s.split(/\b(complete as per|as per drawing|as per technical|as per specification|including all lead|including all lift|all complete|at all (heights|leads|lifts)|including cost of|excluding cost of|i\/c\b|incl\.? )/i)[0].trim();
  s = s.replace(/[,;:.\-\s]+$/, "").trim();
  if (s.length < 4) return String(full).replace(/\s+/g, " ").trim().slice(0, 60);
  if (s.length > 80) s = s.slice(0, 80).replace(/\s+\S*$/, "") + "…";
  return s;
}

const BILL_OTHER = "Other / Unbilled";

export function BillItemPicker({
  items,
  value,
  onChange,
  testidPrefix = "boq",
  stacked = false,
  labels = true,
}: {
  items: BillItem[];
  value: number | null;
  onChange: (id: number | null, item: BillItem | null) => void;
  testidPrefix?: string;
  stacked?: boolean;
  labels?: boolean;
}) {
  // Bills in their original Excel order (by first item's sortOrder).
  const bills = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const name = it.categoryName?.trim() || BILL_OTHER;
      const so = it.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (!m.has(name) || so < (m.get(name) as number)) m.set(name, so);
    }
    return [...m.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  }, [items]);

  const selectedItem = value != null ? items.find((i) => i.id === value) ?? null : null;
  const [bill, setBill] = useState<string>(selectedItem?.categoryName?.trim() || "");
  const effectiveBill = bill || selectedItem?.categoryName?.trim() || "";

  const billItems = useMemo(
    () =>
      items
        .filter((i) => (i.categoryName?.trim() || BILL_OTHER) === effectiveBill)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [items, effectiveBill],
  );

  return (
    <div className={stacked ? "flex flex-col gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
      <div className="space-y-1">
        {labels && <Label className="text-sm">Bill / Section</Label>}
        <Select
          value={effectiveBill || "__none__"}
          onValueChange={(v) => {
            setBill(v === "__none__" ? "" : v);
            onChange(null, null); // changing the bill clears the item
          }}
          data-testid={`${testidPrefix}-bill-select`}
        >
          <SelectTrigger className="h-auto min-h-9 py-1.5 text-left [&>span]:line-clamp-2 [&>span]:whitespace-normal">
            <SelectValue placeholder="Select bill…" />
          </SelectTrigger>
          <SelectContent className="max-w-[min(92vw,560px)]">
            <SelectItem value="__none__">— Select bill —</SelectItem>
            {bills.map((b) => (
              <SelectItem key={b} value={b} className="whitespace-normal leading-snug py-2">
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        {labels && <Label className="text-sm">Work Item</Label>}
        <Select
          value={value != null ? String(value) : "__none__"}
          disabled={!effectiveBill}
          onValueChange={(v) => {
            if (v === "__none__") { onChange(null, null); return; }
            const it = items.find((i) => i.id === parseInt(v)) ?? null;
            onChange(it ? it.id : null, it);
          }}
          data-testid={`${testidPrefix}-item-select`}
        >
          <SelectTrigger className="h-auto min-h-9 py-1.5 text-left [&>span]:line-clamp-2 [&>span]:whitespace-normal">
            <SelectValue placeholder={effectiveBill ? "Select item…" : "Pick a bill first"} />
          </SelectTrigger>
          <SelectContent className="max-w-[min(92vw,640px)]">
            <SelectItem value="__none__">— Select item —</SelectItem>
            {billItems.map((it) => (
              <SelectItem
                key={it.id}
                value={String(it.id)}
                className="items-start whitespace-normal leading-snug py-2"
              >
                <span className="block pr-2" title={it.description}>
                  {it.itemCode ? <span className="font-semibold">{it.itemCode} · </span> : null}
                  {shortItemName(it.itemName || it.description)}{" "}
                  <span className="text-slate-400 font-normal">
                    ({it.unit}
                    {it.dprConversionFactor != null && it.dprConversionFactor !== 1
                      ? ` × ${it.dprConversionFactor}`
                      : ""}
                    )
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
