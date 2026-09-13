import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface EquipmentTankBalancePatch {
  openingDiesel?: number | null;
  dieselBalanceInTank?: number | null;
  dieselBalanceConfirmed?: boolean | null;
}

interface EquipmentTankBalanceInputsProps {
  index: number;
  openingDiesel?: number | null;
  dieselBalanceInTank?: number | null;
  dieselBalanceConfirmed?: boolean | null;
  dieselIssued?: number | null;
  expectedDiesel?: number | null;
  runtime?: number | null;
  onChange: (patch: EquipmentTankBalancePatch) => void;
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The DPR rendering of the standalone Plant tank controls.  The physical
 * closing dip is intentionally separate from the calculated closing balance;
 * users can record zero and the confirmation checkbox independently.
 */
export function EquipmentTankBalanceInputs({
  index,
  openingDiesel,
  dieselBalanceInTank,
  dieselBalanceConfirmed,
  dieselIssued,
  expectedDiesel,
  runtime,
  onChange,
}: EquipmentTankBalanceInputsProps) {
  const canCalculateClosing =
    finite(openingDiesel) && finite(dieselIssued) && finite(expectedDiesel);
  const calculatedClosing = canCalculateClosing
    ? (openingDiesel as number) + (dieselIssued as number) - (expectedDiesel as number)
    : null;
  const hasActualConsumption =
    finite(openingDiesel) && finite(dieselIssued) && finite(dieselBalanceInTank);
  const actualConsumption = hasActualConsumption
    ? (openingDiesel as number) + (dieselIssued as number) - (dieselBalanceInTank as number)
    : null;

  const setNumber = (key: "openingDiesel" | "dieselBalanceInTank", value: string) => {
    onChange({ [key]: value === "" ? null : Number(value) });
  };

  return (
    <div
      className="col-span-2 border rounded-md p-3 space-y-3 bg-blue-50/50 dark:bg-blue-900/10 md:col-span-4"
      data-testid={`equipment-tank-balance-${index}`}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Opening Diesel Tank (L)</Label>
          <Input
            type="number"
            step="0.1"
            value={openingDiesel ?? ""}
            onChange={(event) => setNumber("openingDiesel", event.target.value)}
            placeholder="Previous balance"
            data-testid={`input-opening-diesel-${index}`}
          />
        </div>
        <div>
          <Label>Diesel Balance in Tank (L)</Label>
          <Input
            type="number"
            step="0.1"
            value={dieselBalanceInTank ?? ""}
            onChange={(event) => setNumber("dieselBalanceInTank", event.target.value)}
            placeholder="Closing dip (L) — enter even if no diesel issued"
            data-testid={`input-diesel-balance-${index}`}
          />
        </div>
      </div>

      {canCalculateClosing && (
        <div className="p-3 bg-primary/10 rounded-md text-sm" data-testid={`panel-closing-tank-balance-${index}`}>
          <p>
            Closing Tank Balance: <strong>{(calculatedClosing as number).toFixed(3)} L</strong>
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id={`diesel-balance-confirmed-${index}`}
          checked={dieselBalanceConfirmed === true}
          onCheckedChange={(checked) => onChange({ dieselBalanceConfirmed: checked === true })}
          data-testid={`checkbox-diesel-balance-confirmed-${index}`}
        />
        <Label htmlFor={`diesel-balance-confirmed-${index}`} className="text-sm cursor-pointer">
          Physical tank balance confirmed
        </Label>
      </div>

      {hasActualConsumption && (
        <div className="p-2 bg-blue-100/50 dark:bg-blue-900/20 rounded text-sm space-y-1" data-testid={`panel-actual-consumption-${index}`}>
          <p>
            Actual Consumption (L):{" "}
            <strong data-testid={`text-actual-consumption-${index}`}>
              {(actualConsumption as number).toFixed(3)}
            </strong>
          </p>
          <p>
            L/Hr:{" "}
            <strong data-testid={`text-actual-l-per-hr-${index}`}>
              {finite(runtime) && (runtime as number) > 0
                ? ((actualConsumption as number) / (runtime as number)).toFixed(3)
                : "—"}
            </strong>
          </p>
        </div>
      )}
    </div>
  );
}