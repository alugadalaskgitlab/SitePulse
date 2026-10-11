import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HIRE_QUANTITY_UNITS, HIRE_RATE_UNITS, type BillHireTerms } from "./hireBillTerms";
import type { HireBillingBasis } from "@shared/hireBilling";

export function HireBillTermsEditor({ group, equipmentName, result, onChange, onRemove }: {
  group: BillHireTerms & { id: string };
  equipmentName: string;
  result: { quantity: number; grossAmount: number } | null | undefined;
  onChange: (patch: Partial<BillHireTerms>) => void;
  onRemove: () => void;
}) {
  const suffix = group.id;
  return <section className="space-y-3 rounded border bg-muted/20 p-3" data-testid={`hire-terms-${suffix}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{equipmentName}</h3>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Remove equipment charge</Button>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <div><Label htmlFor={`basis-${suffix}`}>Hire Basis</Label>
        <Select value={group.basis} onValueChange={basis => onChange({ basis: basis as HireBillingBasis })}>
          <SelectTrigger id={`basis-${suffix}`} data-testid={`select-hire-basis-${suffix}`}><SelectValue /></SelectTrigger>
          <SelectContent>{(["trip", "daily", "hourly", "monthly"] as const).map(basis =>
            <SelectItem key={basis} value={basis}>{basis[0].toUpperCase() + basis.slice(1)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label htmlFor={`rate-${suffix}`}>Hire Rate ({HIRE_RATE_UNITS[group.basis]})</Label>
        <Input id={`rate-${suffix}`} type="number" min="0.01" step="0.01" value={group.rate || ""}
          placeholder="Agreed rate" aria-invalid={!Number.isFinite(group.rate) || group.rate <= 0}
          onChange={e => onChange({ rate: Number(e.target.value) })} data-testid={`input-hire-rate-${suffix}`} />
        {(!Number.isFinite(group.rate) || group.rate <= 0) && <p className="mt-1 text-xs text-destructive">Enter a positive rate for this bill.</p>}
      </div>
      <div><Label htmlFor={`from-${suffix}`}>Billing Period From</Label><Input id={`from-${suffix}`} type="date" value={group.periodFrom}
        onChange={e => onChange({ periodFrom: e.target.value })} /></div>
      <div><Label htmlFor={`to-${suffix}`}>Billing Period To</Label><Input id={`to-${suffix}`} type="date" value={group.periodTo}
        onChange={e => onChange({ periodTo: e.target.value })} /></div>
    </div>
    {group.basis === "monthly" && <div className="flex flex-wrap items-end gap-3">
      <div className="w-full md:w-56"><Label htmlFor={`divisor-${suffix}`}>Partial-month divisor</Label>
        <Select value={group.monthlyDivisorType || "30"} onValueChange={value => onChange({ monthlyDivisorType: value as BillHireTerms["monthlyDivisorType"] })}>
          <SelectTrigger id={`divisor-${suffix}`}><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="30">30 days</SelectItem><SelectItem value="calendar">Calendar days</SelectItem><SelectItem value="custom">Custom days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {group.monthlyDivisorType === "custom" && <div><Label htmlFor={`custom-${suffix}`}>Divisor days</Label>
        <Input id={`custom-${suffix}`} type="number" min="0.01" step="0.01" value={group.monthlyDivisor ?? ""}
          onChange={e => onChange({ monthlyDivisor: e.target.value === "" ? null : Number(e.target.value) })} /></div>}
      <p className="text-xs text-muted-foreground">Full calendar months use the agreed monthly rate. Longer periods split automatically by month.</p>
    </div>}
    <div className="overflow-x-auto rounded border bg-background">
      <table className="w-full text-left text-xs"><thead className="bg-muted/30 text-muted-foreground"><tr>
        {["Hire Basis", "Rate", "Billable Quantity", "Unit", "Gross Amount"].map(label => <th key={label} scope="col" className="p-2 whitespace-nowrap">{label}</th>)}
      </tr></thead><tbody><tr>
        <td className="p-2 capitalize">{group.basis}</td>
        <td className="p-2 whitespace-nowrap">₹{group.rate.toLocaleString("en-IN")} {HIRE_RATE_UNITS[group.basis].replace("₹", "")}</td>
        <td className="p-2">{result?.quantity ?? "—"}</td><td className="p-2">{HIRE_QUANTITY_UNITS[group.basis]}</td>
        <td className="p-2 font-semibold whitespace-nowrap">{result ? `₹${result.grossAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Complete terms"}</td>
      </tr></tbody></table>
    </div>
    {group.activityReviewRequired && <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50/40 p-2 text-xs">
      <p>Terms changed. Review the activity and deductions below before saving this draft.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ activityReviewRequired: false })}>Confirm activity review</Button>
    </div>}
  </section>;
}
