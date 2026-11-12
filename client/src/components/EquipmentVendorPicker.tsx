import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface EquipmentVendorChoice {
  id: number;
  name: string;
  isActive?: boolean;
  aliases: string[];
}

interface EquipmentVendorPickerProps {
  vendors: EquipmentVendorChoice[];
  value: number | null;
  onChange: (vendorId: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  selectedNameFallback?: string | null;
}

export function EquipmentVendorPicker({
  vendors,
  value,
  onChange,
  isLoading = false,
  isError = false,
  selectedNameFallback,
}: EquipmentVendorPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = vendors.find(vendor => vendor.id === value);
  const selectableVendors = vendors.filter(vendor => vendor.isActive !== false);
  const query = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => selectableVendors.filter(vendor =>
    !query || vendor.name.toLocaleLowerCase().includes(query) ||
      vendor.aliases.some(alias => alias.toLocaleLowerCase().includes(query)),
  ), [selectableVendors, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={isLoading || isError}
          data-testid="button-equipment-vendor-picker"
        >
          <span className="truncate">
            {isLoading
              ? "Loading vendors…"
              : isError
                ? "Vendor list unavailable"
                : selected?.name ?? selectedNameFallback ?? "Choose a vendor"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,440px)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search vendor name or alias"
            data-testid="input-equipment-vendor-search"
          />
          <CommandList>
            {filtered.length === 0 ? <CommandEmpty>No matching vendor.</CommandEmpty> : filtered.map(vendor => {
              const matchedAlias = query && !vendor.name.toLocaleLowerCase().includes(query)
                ? vendor.aliases.find(alias => alias.toLocaleLowerCase().includes(query))
                : null;
              return (
                <CommandItem
                  key={vendor.id}
                  value={String(vendor.id)}
                  onSelect={() => {
                    onChange(vendor.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  data-testid={`option-equipment-vendor-${vendor.id}`}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === vendor.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{vendor.name}</span>
                    {matchedAlias && (
                      <span className="block text-xs text-muted-foreground">Matched alias: {matchedAlias}</span>
                    )}
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
