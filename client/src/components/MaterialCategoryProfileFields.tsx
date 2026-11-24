import { calculateCompactedLooseQuantity, compactedLooseProfileFromInputs, looseWeightPerCumFromProfile } from "@shared/compactedLoose";
import { materialMasterFieldGroup } from "@shared/materialMasterFields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface MaterialProfileFields {
  volumeUom: string;
  bulkDensity: string;
  rolledDensity: string;
  rollingPct: string;
  extraLoosePct: string;
  wastagePct: string;
  materialThicknessMm: string;
  packedUnitName: string;
  packedUnitNetWeightKg: string;
  packedUnitVolumeLiters: string;
}

interface MaterialCategoryProfileFieldsProps {
  category: string;
  name: string;
  values: MaterialProfileFields;
  onChange: <K extends keyof MaterialProfileFields>(key: K, value: MaterialProfileFields[K]) => void;
  idPrefix?: string;
}

function formatValue(value: number, maximumFractionDigits = 2): string {
  return Number(value.toFixed(maximumFractionDigits)).toLocaleString("en-IN", { maximumFractionDigits });
}

export function MaterialCategoryProfileFields({
  category,
  name,
  values,
  onChange,
  idPrefix = "",
}: MaterialCategoryProfileFieldsProps) {
  const group = materialMasterFieldGroup(category, name);
  const id = (field: string) => `${idPrefix}${field}`;

  if (group === "choose-category") {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground" data-testid={id("material-category-prompt")}>
        Choose a category to see the right fields.
      </p>
    );
  }

  if (group === "store") return null;

  if (group === "bitumen" || group === "emulsion" || group === "fuel") {
    const isFuel = group === "fuel";
    const materialLabel = group === "bitumen" ? "bitumen" : group === "emulsion" ? "emulsion" : "fuel";
    return (
      <div className="rounded-md border border-dashed border-border p-3 space-y-3 bg-muted/30" data-testid={id("packed-unit-master-fields")}>
        <div>
          <p className="text-sm font-semibold">Packed receipt unit (optional)</p>
          <p className="text-xs text-muted-foreground">
            For {materialLabel} received in barrels or drums. Enter the standard {isFuel ? "volume in litres" : "net weight"} per unit.
          </p>
        </div>
        <div className={`grid grid-cols-1 gap-3 ${isFuel ? "" : "sm:grid-cols-2"}`}>
          <div>
            <Label htmlFor={id("packed-unit-name")}>Packed unit</Label>
            <Select
              value={values.packedUnitName || "none"}
              onValueChange={value => onChange("packedUnitName", value === "none" ? "" : value)}
            >
              <SelectTrigger id={id("packed-unit-name")} data-testid={id("select-packed-unit")}>
                <SelectValue placeholder="Not configured" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not configured</SelectItem>
                <SelectItem value="Barrel">Barrel</SelectItem>
                <SelectItem value="Drum">Drum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isFuel ? (
            <div>
              <Label htmlFor={id("packed-unit-volume-liters")}>Standard volume per unit, L</Label>
              <Input
                id={id("packed-unit-volume-liters")}
                type="number"
                min="0.001"
                step="0.1"
                value={values.packedUnitVolumeLiters}
                onChange={event => onChange("packedUnitVolumeLiters", event.target.value)}
                placeholder="e.g. 200"
                data-testid={id("input-packed-unit-volume-liters")}
              />
            </div>
          ) : (
            <div>
              <Label htmlFor={id("packed-unit-net-kg")}>Standard net weight per unit, kg</Label>
              <Input
                id={id("packed-unit-net-kg")}
                type="number"
                min="0.001"
                step="0.1"
                value={values.packedUnitNetWeightKg}
                onChange={event => onChange("packedUnitNetWeightKg", event.target.value)}
                placeholder="e.g. 156"
                data-testid={id("input-packed-unit-net-kg")}
              />
            </div>
          )}
        </div>
        {values.packedUnitName && !(isFuel ? values.packedUnitVolumeLiters : values.packedUnitNetWeightKg) && (
          <p className="text-xs text-amber-700" data-testid={id("packed-unit-profile-missing")}>
            Set the standard {isFuel ? "volume in litres" : "net weight"} before recording a packed receipt.
          </p>
        )}
      </div>
    );
  }

  const profile = compactedLooseProfileFromInputs({
    rolledDensity: values.rolledDensity,
    rollingPct: values.rollingPct,
    extraLoosePct: values.extraLoosePct,
    wastagePct: values.wastagePct,
  });
  const example = calculateCompactedLooseQuantity(100, profile);
  const looseDensity = looseWeightPerCumFromProfile(profile);
  const manualDensity = Number(values.bulkDensity);
  const conversionDensity = looseDensity ?? (Number.isFinite(manualDensity) && manualDensity > 0 ? manualDensity : null);
  const thickness = values.materialThicknessMm.trim() === "" ? null : Number(values.materialThicknessMm);

  return (
    <>
      <div className="rounded-md border border-dashed border-border p-3 space-y-3 bg-muted/30" data-testid={id("volume-weight-conversion")}>
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Volume → Weight Conversion (optional)</p>
        <p className="text-sm text-muted-foreground">
          Fill this only if the material is sometimes received in volume units (CFT / Cum) but tracked in weight (MT).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm">Volume UOM at Receipt</Label>
            <Select value={values.volumeUom} onValueChange={value => onChange("volumeUom", value)}>
              <SelectTrigger data-testid={id("select-volume-uom")} className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CFT">CFT (cubic feet)</SelectItem>
                <SelectItem value="Cum">CUM / m³</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Weight of 1 cum as delivered, MT</Label>
            <Input
              type="number"
              step="0.01"
              min="0.1"
              max="5"
              value={looseDensity != null ? looseDensity.toFixed(2) : values.bulkDensity}
              onChange={event => onChange("bulkDensity", event.target.value)}
              placeholder="e.g. 1.8"
              className="h-8 text-sm"
              readOnly={looseDensity != null}
              data-testid={id("input-bulk-density")}
            />
          </div>
        </div>
        {conversionDensity != null && (
          <div className="text-sm rounded bg-background border px-3 py-2 space-y-0.5">
            <p className="font-medium text-foreground">Derived conversion factor:</p>
            {values.volumeUom === "CFT" ? (
              <p className="text-muted-foreground">
                1 CFT = {(conversionDensity / 35.3147).toFixed(3)} MT · 100 CFT = {(100 * conversionDensity / 35.3147).toFixed(2)} MT
              </p>
            ) : (
              <p className="text-muted-foreground">
                1 cum = {conversionDensity.toFixed(2)} MT · 10 cum = {(10 * conversionDensity).toFixed(2)} MT
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-md border border-teal-200 bg-teal-50/40 p-3 space-y-3" data-testid={id("compacted-loose-material-fields")}>
        <div>
          <p className="text-sm font-semibold text-foreground">Compacted and loose</p>
          <p className="text-xs text-muted-foreground">When set, the calculated loose weight above is used for volume-to-weight conversions.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={id("rolled-density")}>Compacted density (lab)</Label>
            <Input id={id("rolled-density")} type="number" min="0" step="0.001" value={values.rolledDensity}
              onChange={event => onChange("rolledDensity", event.target.value)} placeholder="MT per cum" data-testid={id("input-rolled-density")} />
            <p className="text-xs text-muted-foreground mt-0.5">MT per cum</p>
          </div>
          <div>
            <Label htmlFor={id("rolling-pct")}>Field compaction</Label>
            <Input id={id("rolling-pct")} type="number" min="0" step="0.1" value={values.rollingPct}
              onChange={event => onChange("rollingPct", event.target.value)} placeholder="98" data-testid={id("input-rolling-pct")} />
            <p className="text-xs text-muted-foreground mt-0.5">% of lab density to be achieved on site</p>
          </div>
          <div>
            <Label htmlFor={id("extra-loose")}>Extra loose</Label>
            <Input id={id("extra-loose")} type="number" min="0" step="0.1" value={values.extraLoosePct}
              onChange={event => onChange("extraLoosePct", event.target.value)} placeholder="20" data-testid={id("input-extra-loose-pct")} />
            <p className="text-xs text-muted-foreground mt-0.5">
              {values.extraLoosePct.trim() ? `Factor ${profile.looseFactor?.toFixed(2) ?? "—"}` : "Enter %, e.g. 20 (factor 1.20)"}
            </p>
          </div>
          <div>
            <Label htmlFor={id("wastage-pct")}>Wastage</Label>
            <Input id={id("wastage-pct")} type="number" min="0" step="0.1" value={values.wastagePct}
              onChange={event => onChange("wastagePct", event.target.value)} data-testid={id("input-wastage-pct")} />
            <p className="text-xs text-muted-foreground mt-0.5">%</p>
          </div>
        </div>
        <div className="rounded border bg-background px-3 py-2 text-xs" data-testid={id("compacted-loose-preview")}>
          {!example ? (
            <p className="text-amber-700 font-medium">Values not set</p>
          ) : (
            <p className="font-medium">
              For 100 cum compacted: Weight {formatValue(example.compactedMt)} MT · Loose {formatValue(example.looseCum)} cum ({formatValue(example.looseCft, 0)} CFT) · With {formatValue(profile.wastagePct!)}% wastage: {formatValue(example.requiredMt)} MT · {formatValue(example.requiredLooseCum)} cum loose · 1 cum loose weighs {example.looseWeightPerCum.toFixed(2)} MT — used to change truck CFT into MT
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-teal-700" data-testid={id("material-thickness-check")}>
            <Label htmlFor={id("thickness-mm")} className="text-xs">Compacted thickness</Label>
            <Input id={id("thickness-mm")} type="number" min="0" step="1" value={values.materialThicknessMm}
              onChange={event => onChange("materialThicknessMm", event.target.value)} className="h-7 w-24 text-xs" data-testid={id("input-thickness-mm")} />
            <span>mm →</span>
            {thickness != null && Number.isFinite(thickness) && thickness > 0 && profile.looseFactor != null
              ? <span>Lay loose {(thickness * profile.looseFactor).toFixed(1)} mm to get {thickness} mm compacted</span>
              : <span>Enter a thickness and Extra loose value</span>}
          </div>
        </div>
      </div>
    </>
  );
}
