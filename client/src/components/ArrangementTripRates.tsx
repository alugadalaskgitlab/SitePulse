import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { arrangementTripRatesSchema, type ArrangementTripRate } from "@shared/arrangementTripRates";

export type TripRateDraft = { quantity: string; uom: string; rate: string };
export const tripRateHelp = "Flat all-in amount per trip, covering extraction, loading, haulage and dumping.";
export function parseTripRateDrafts(rows: TripRateDraft[]) {
  return arrangementTripRatesSchema.safeParse(rows.map(row => ({
    quantity: row.quantity.trim() ? Number(row.quantity) : NaN,
    uom: row.uom,
    rate: row.rate.trim() ? Number(row.rate) : NaN,
  })));
}

export function ArrangementTripRatesEditor({ rows, onChange }: {
  rows: TripRateDraft[]; onChange: (rows: TripRateDraft[]) => void;
}) {
  const result = parseTripRateDrafts(rows);
  const change = (index: number, field: keyof TripRateDraft, value: string) =>
    onChange(rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  return <section className="space-y-2" data-testid="arrangement-trip-rates-editor">
    <h4 className="text-xs font-semibold">Rates per trip</h4>
    <p className="text-xs text-muted-foreground">{tripRateHelp}</p>
    <div className="overflow-x-auto">
      <table className="w-full text-xs"><thead><tr>
        <th className="text-left">Trip size</th><th className="text-left">UOM</th>
        <th className="text-left">Rate per trip (₹)</th><th><span className="sr-only">Remove</span></th>
      </tr></thead><tbody>{rows.map((row, i) => <tr key={i}>
        <td className="p-1"><Input aria-label={`Trip quantity ${i + 1}`} type="number" step="any" value={row.quantity} onChange={e => change(i, "quantity", e.target.value)} /></td>
        <td className="p-1"><Input aria-label={`Trip UOM ${i + 1}`} value={row.uom} onChange={e => change(i, "uom", e.target.value)} /></td>
        <td className="p-1"><Input aria-label={`Rate per trip ${i + 1}`} type="number" step="any" value={row.rate} onChange={e => change(i, "rate", e.target.value)} /></td>
        <td><Button type="button" variant="ghost" size="sm" aria-label={`Remove trip rate ${i + 1}`} onClick={() => onChange(rows.filter((_, n) => n !== i))}>Remove</Button></td>
      </tr>)}</tbody></table>
    </div>
    {!result.success && <p role="alert" className="text-xs text-destructive">{result.error.issues[0].message}</p>}
    <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { quantity: "", uom: "", rate: "" }])}>+ Add row</Button>
  </section>;
}

export function ArrangementTripRatesView({ rates }: { rates?: ArrangementTripRate[] | null }) {
  if (!rates?.length) return null;
  return <section className="space-y-1 text-xs" data-testid="arrangement-trip-rates">
    <p className="font-semibold">Rates per trip</p>
    <p className="text-muted-foreground">{tripRateHelp}</p>
    {rates.map(row => <p key={`${row.quantity}-${row.uom}`}>
      {row.quantity.toLocaleString("en-IN")} {row.uom} — ₹{row.rate.toLocaleString("en-IN")} per trip
    </p>)}
  </section>;
}
