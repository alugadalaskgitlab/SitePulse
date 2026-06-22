import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFeatureFlags } from "@/lib/featureFlags";

export interface LocationValue {
  siteId: number | null;
  raisedFrom: string | null;
}

interface LocationPickerProps {
  value: LocationValue;
  onChange: (val: LocationValue) => void;
  sitesList: { id: number; name: string }[] | undefined;
  placeholder?: string;
  "data-testid"?: string;
}

export const SECTION_OPTIONS = [
  { value: "HMP PLANT", label: "HMP PLANT" },
  { value: "RMC PLANT", label: "RMC PLANT", rmcOnly: true },
  { value: "EQUIPMENT & FLEET", label: "EQUIPMENT & FLEET" },
  { value: "MAIN STORE", label: "MAIN STORE" },
] as const;

function encodeValue(loc: LocationValue): string {
  if (loc.siteId != null) return `site:${loc.siteId}`;
  if (loc.raisedFrom) return `section:${loc.raisedFrom}`;
  return "";
}

function decodeValue(raw: string): LocationValue {
  if (!raw) return { siteId: null, raisedFrom: null };
  if (raw.startsWith("site:")) return { siteId: Number(raw.slice(5)), raisedFrom: null };
  if (raw.startsWith("section:")) return { siteId: null, raisedFrom: raw.slice(8) };
  return { siteId: null, raisedFrom: null };
}

export function locationLabel(loc: LocationValue, sitesList: { id: number; name: string }[] | undefined): string {
  if (loc.siteId != null && sitesList) {
    const s = sitesList.find(s => s.id === loc.siteId);
    return s?.name ?? `Site #${loc.siteId}`;
  }
  if (loc.raisedFrom) return loc.raisedFrom;
  return "—";
}

export function LocationPicker({ value, onChange, sitesList, placeholder, "data-testid": testId }: LocationPickerProps) {
  const { rmcEnabled } = useFeatureFlags();
  const encoded = encodeValue(value);

  const handleChange = (raw: string) => {
    onChange(decodeValue(raw));
  };

  return (
    <Select value={encoded} onValueChange={handleChange}>
      <SelectTrigger data-testid={testId ?? "select-location"}>
        <SelectValue placeholder={placeholder ?? "Select location"} />
      </SelectTrigger>
      <SelectContent>
        {(sitesList ?? []).length > 0 && (
          <div className="px-2 py-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Field Sites
          </div>
        )}
        {(sitesList ?? []).map((s) => (
          <SelectItem key={`site:${s.id}`} value={`site:${s.id}`}>{s.name}</SelectItem>
        ))}
        <div className="px-2 pt-2 pb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground border-t mt-1">
          Sections
        </div>
        {SECTION_OPTIONS.filter(o => !("rmcOnly" in o) || rmcEnabled).map(o => (
          <SelectItem key={`section:${o.value}`} value={`section:${o.value}`}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
