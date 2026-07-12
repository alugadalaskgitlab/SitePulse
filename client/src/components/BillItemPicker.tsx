// Cascading "Bill → Item" picker for DPR activity selection.
// Field 1 = the BOQ Bill / Section (exactly as imported from Excel, e.g. "BILL No. 1 SITE CLEARANCE").
// Field 2 = only the items inside the chosen bill — a searchable picker showing
// code + short name + UOM prominently, with the full description as a
// secondary line / tooltip. On mobile it opens as a bottom sheet so long
// BOQ item lists stay easy to scan and search on a phone.
// Reused by Road DPR, Structure DPR, and labour/equipment/material BOQ links.

import { useMemo, useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, Check, ExternalLink } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { BOQ_WORK_CATEGORIES } from "@shared/boqWorkCategories";

export type BillItem = {
  id: number;
  description: string;
  itemCode: string | null;
  itemName: string | null;
  unit: string;
  dprConversionFactor: number | null;
  categoryName?: string | null;
  workCategory?: string | null;
  includeInDpr?: boolean | null;
  sortOrder?: number | null;
  displayName?: string | null;
  needsReview?: boolean | null;
};

const WORK_CAT_LABEL = new Map(BOQ_WORK_CATEGORIES.map(c => [c.code, { label: c.label, sortOrder: c.sortOrder }]));

// Same smart short-name used elsewhere — strips boilerplate, keeps grade + location.
export function shortItemName(full?: string | null): string {
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
const NEEDS_MAPPING = "⚠ Needs Mapping";

function ItemRow({ it, unitSuffix }: { it: BillItem; unitSuffix: string }) {
  const short = it.displayName || shortItemName(it.itemName || it.description);
  return (
    <div className="flex flex-col min-w-0" title={it.description}>
      <span className="flex items-center gap-1.5 font-medium leading-snug truncate">
        {it.itemCode ? <span className="text-primary shrink-0">{it.itemCode}</span> : null}
        <span className="truncate">{short}</span>
        <span className="text-muted-foreground font-normal shrink-0">{unitSuffix}</span>
        {it.needsReview && (
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 shrink-0">Review</span>
        )}
      </span>
      {it.description && it.description !== short && (
        <span className="text-xs text-muted-foreground truncate">{it.description}</span>
      )}
    </div>
  );
}

function ItemSearchList({
  billItems,
  value,
  onSelect,
}: {
  billItems: BillItem[];
  value: number | null;
  onSelect: (it: BillItem | null) => void;
}) {
  return (
    <Command
      filter={(value, search) => {
        const it = billItems.find((i) => String(i.id) === value);
        if (!it) return 0;
        const haystack = [it.itemCode, it.itemName, it.description, it.unit]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.toLowerCase()) ? 1 : 0;
      }}
    >
      <CommandInput placeholder="Search by code, name, or description…" data-testid="input-boq-item-search" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No matching items.</CommandEmpty>
        <CommandGroup>
          <CommandItem value="__none__" onSelect={() => onSelect(null)} data-testid="option-boq-item-none">
            <Check className={cn("mr-2 h-4 w-4", value == null ? "opacity-100" : "opacity-0")} />
            — Select item —
          </CommandItem>
          {billItems.map((it) => {
            const unitSuffix = `(${it.unit}${it.dprConversionFactor != null && it.dprConversionFactor !== 1 ? ` × ${it.dprConversionFactor}` : ""})`;
            return (
              <CommandItem
                key={it.id}
                value={String(it.id)}
                onSelect={() => onSelect(it)}
                className="items-start py-2.5"
                data-testid={`option-boq-item-${it.id}`}
              >
                <Check className={cn("mr-2 mt-1 h-4 w-4 shrink-0", value === it.id ? "opacity-100" : "opacity-0")} />
                <ItemRow it={it} unitSuffix={unitSuffix} />
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function BillItemPicker({
  items,
  value,
  onChange,
  testidPrefix = "boq",
  stacked = false,
  labels = true,
  reviewPath,
}: {
  items: BillItem[];
  value: number | null;
  onChange: (id: number | null, item: BillItem | null) => void;
  testidPrefix?: string;
  stacked?: boolean;
  labels?: boolean;
  reviewPath?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // Bills derived from workCategory (set via BOQ Review). Falls back to categoryName
  // for items not yet classified. "Needs Mapping" group always appears last.
  const bills = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (it.includeInDpr === false) continue;
      const unmapped = !it.workCategory?.trim() || it.needsReview;
      const name = unmapped ? NEEDS_MAPPING : (WORK_CAT_LABEL.get(it.workCategory!)?.label ?? it.workCategory!);
      const catSortOrder = it.workCategory ? (WORK_CAT_LABEL.get(it.workCategory)?.sortOrder ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const so = catSortOrder * 1000 + (it.sortOrder ?? 0);
      if (!m.has(name) || so < (m.get(name) as number)) m.set(name, so);
    }
    return [...m.entries()]
      .sort((a, b) => {
        if (a[0] === NEEDS_MAPPING) return 1;
        if (b[0] === NEEDS_MAPPING) return -1;
        return a[1] - b[1];
      })
      .map(([name]) => name);
  }, [items]);

  const selectedItem = value != null ? items.find((i) => i.id === value) ?? null : null;

  function itemGroup(it: BillItem | null): string {
    if (!it) return "";
    if (!it.workCategory?.trim() || it.needsReview) return NEEDS_MAPPING;
    return WORK_CAT_LABEL.get(it.workCategory!)?.label ?? it.workCategory!;
  }

  const [bill, setBill] = useState<string>(itemGroup(selectedItem));
  const effectiveBill = bill || itemGroup(selectedItem);

  const billItems = useMemo(() => {
    return items
      .filter((i) => {
        if (i.includeInDpr === false) return false;
        const unmapped = !i.workCategory?.trim() || i.needsReview;
        const groupName = unmapped ? NEEDS_MAPPING : (WORK_CAT_LABEL.get(i.workCategory!)?.label ?? i.workCategory!);
        return groupName === effectiveBill;
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [items, effectiveBill]);

  const handleSelect = (it: BillItem | null) => {
    onChange(it ? it.id : null, it);
    setOpen(false);
  };

  const triggerLabel = selectedItem ? (
    <ItemRow
      it={selectedItem}
      unitSuffix={`(${selectedItem.unit}${selectedItem.dprConversionFactor != null && selectedItem.dprConversionFactor !== 1 ? ` × ${selectedItem.dprConversionFactor}` : ""})`}
    />
  ) : (
    <span className="text-muted-foreground">{effectiveBill ? "Select item…" : "Pick a bill first"}</span>
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
        {effectiveBill === NEEDS_MAPPING && reviewPath && (
          <Link href={reviewPath}>
            <a className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 hover:underline mt-0.5" data-testid="link-needs-mapping-review">
              <ExternalLink className="w-3 h-3" />
              Fix unmapped items in BOQ Item Review
            </a>
          </Link>
        )}
      </div>

      <div className="space-y-1">
        {labels && <Label className="text-sm">Work Item</Label>}
        {isMobile ? (
          <>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={!effectiveBill}
              onClick={() => setOpen(true)}
              className="h-auto min-h-9 w-full justify-between py-1.5 font-normal"
              data-testid={`${testidPrefix}-item-select`}
            >
              <span className="min-w-0 flex-1 text-left truncate">{triggerLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
            <Drawer open={open} onOpenChange={setOpen}>
              <DrawerContent className="max-h-[85vh]">
                <DrawerHeader className="text-left">
                  <DrawerTitle>Select Work Item</DrawerTitle>
                </DrawerHeader>
                <div className="px-2 pb-4">
                  <ItemSearchList billItems={billItems} value={value} onSelect={handleSelect} />
                </div>
              </DrawerContent>
            </Drawer>
          </>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                disabled={!effectiveBill}
                className="h-auto min-h-9 w-full justify-between py-1.5 font-normal"
                data-testid={`${testidPrefix}-item-select`}
              >
                <span className="min-w-0 flex-1 text-left truncate">{triggerLabel}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(92vw,640px)] p-0" align="start">
              <ItemSearchList billItems={billItems} value={value} onSelect={handleSelect} />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
