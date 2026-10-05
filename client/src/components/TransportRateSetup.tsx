import { useState } from "react";
import { calculateTransportRate } from "@shared/transportRate";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TransportRateFields = {
  ratePerKm: number | null;
  leadDistanceKm: number | null;
  payloadMt: number | null;
};

export const transportNumber = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function hasTransportSetup(fields?: Partial<TransportRateFields> | null): boolean {
  return !!fields && Number(fields.ratePerKm) > 0 && Number(fields.leadDistanceKm) > 0 && Number(fields.payloadMt) > 0;
}

export function TransportRateBasis({ fields }: { fields: TransportRateFields }) {
  const result = calculateTransportRate(fields);
  return <span className="text-xs font-mono whitespace-nowrap" data-testid="transport-rate-basis">
    ₹{transportNumber(fields.ratePerKm!)}/km · {transportNumber(fields.leadDistanceKm!)} km one way · {transportNumber(fields.payloadMt!)} MT → ₹{transportNumber(result.perTrip!)}/trip · ₹{transportNumber(result.perMT!)}/MT
  </span>;
}

export function TransportRateSetup({ label, fields, onSave, onClose }: {
  label: string;
  fields?: Partial<TransportRateFields> | null;
  onSave: (fields: TransportRateFields) => Promise<void>;
  onClose: () => void;
}) {
  const [rate, setRate] = useState(String(fields?.ratePerKm ?? ""));
  const [lead, setLead] = useState(String(fields?.leadDistanceKm ?? ""));
  const [payload, setPayload] = useState(String(fields?.payloadMt ?? 30));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const parsed = (value: string) => value.trim() === "" ? null : Number(value);
  const values: TransportRateFields = { ratePerKm: parsed(rate), leadDistanceKm: parsed(lead), payloadMt: parsed(payload) };
  const invalidPayload = values.payloadMt === null || !Number.isFinite(values.payloadMt) || values.payloadMt <= 0;
  const invalidOther = [values.ratePerKm, values.leadDistanceKm].some(value => value !== null && (!Number.isFinite(value) || value < 0));
  const result = calculateTransportRate(values);
  const price = (value: number | null) => value === null ? "" : `₹${transportNumber(value)}`;
  const save = async () => {
    if (invalidPayload || invalidOther || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save rate setup. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-lg" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>TRANSPORT RATE SETUP</DialogTitle>
        <DialogDescription>{label} · The one-way lead is doubled for each load.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={saving} className="grid gap-4">
          <div className="space-y-1.5"><Label htmlFor="transport-rate-km">Rate (₹ per km per load)</Label>
            <Input id="transport-rate-km" type="number" min="0" step="any" value={rate} onChange={event => setRate(event.target.value)} autoFocus /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="transport-lead">Lead distance — ONE WAY (km)</Label>
              <Input id="transport-lead" type="number" min="0" step="any" value={lead} onChange={event => setLead(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="transport-payload">Payload (MT)</Label>
              <Input id="transport-payload" type="number" min="0" step="any" value={payload} aria-invalid={invalidPayload} onChange={event => setPayload(event.target.value)} /></div>
          </div>
        </fieldset>
        {invalidPayload && <p role="alert" className="text-sm text-destructive">Payload required for ₹/MT</p>}
        {invalidOther && <p role="alert" className="text-sm text-destructive">Rate and lead distance must be zero or greater.</p>}
        <dl className="rounded-md border bg-muted/40 p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt>Two-way distance</dt><dd className="font-mono" data-testid="transport-two-way">{result.twoWayDistanceKm === null ? "—" : `${transportNumber(result.twoWayDistanceKm)} km`}</dd></div>
          <div className="flex justify-between gap-4"><dt>₹ per trip</dt><dd className="font-mono" data-testid="transport-per-trip">{price(result.perTrip)}</dd></div>
          <div className="flex justify-between gap-4"><dt>₹ per MT</dt><dd className="font-mono font-semibold" data-testid="transport-per-mt">{invalidPayload ? "" : price(result.perMT)}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">Saving changes only this row’s rate basis. Its existing flat rate and saved unit are not changed. A blank or zero lead keeps flat-rate entry available.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>CANCEL</Button>
          <Button type="submit" disabled={saving || invalidPayload || invalidOther}>{saving ? "SAVING…" : "SAVE RATE SETUP"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}