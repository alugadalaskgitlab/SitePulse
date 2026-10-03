import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LabourHoursInput({ value, contractor, onChange, rowIndex }: {
  value?: number | null; contractor: string; onChange: (value: number | null) => void; rowIndex: number;
}) {
  const invalid = value != null && (!Number.isFinite(value) || value < 0.5 || value > 24);
  return <div className="min-w-0">
    <Label htmlFor={`input-labour-hours-${rowIndex}`} className="text-xs text-slate-700 dark:text-slate-200">Hours</Label>
    <Input id={`input-labour-hours-${rowIndex}`} data-testid={`input-labour-hours-${rowIndex}`}
      type="number" min="0.5" max="24" step="any" value={value ?? ""} placeholder="Optional"
      aria-invalid={invalid} onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} />
    {contractor.trim().toLowerCase() === "direct / local hire" && <p className="mt-1 text-xs text-muted-foreground">Hours blank = full day</p>}
    {invalid && <p className="mt-1 text-xs text-destructive" role="alert">Hours must be between 0.5 and 24</p>}
  </div>;
}

/** Plain-text storage; callers supply only names from the selected site's authorised history. */
export function LabourContractorInput({ value, onChange, suggestions = [], rowIndex }: {
  value: string; onChange: (value: string) => void; suggestions?: string[]; rowIndex: number;
}) {
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const options = Array.from(new Set([...suggestions.filter(name => name.trim()), "Direct / local hire", ...(value.trim() ? [value] : [])]));
  return <div className="min-w-0 space-y-1">
    <Select value={typing ? "__other__" : value || undefined} onValueChange={next => {
      if (next === "__other__") {
        setTyping(true);
        requestAnimationFrame(() => input.current?.focus());
      } else { setTyping(false); onChange(next); }
    }}>
      <SelectTrigger aria-label="Choose contractor / gang" data-testid={`select-labour-contractor-${rowIndex}`}><SelectValue placeholder="Select or type a name" /></SelectTrigger>
      <SelectContent>
        {options.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        <SelectItem value="__other__">Other — type a name</SelectItem>
      </SelectContent>
    </Select>
    {typing && <Input ref={input} aria-label="Contractor / gang name" placeholder="e.g. Raju gang" value={value}
      data-testid={`input-labour-contractor-${rowIndex}`} onChange={event => onChange(event.target.value)} />}
  </div>;
}