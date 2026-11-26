import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import { createRangeReadings, parseChainage, toOursChainage, type BookChainageSystem, type ReadingRow } from "@shared/levelSheets";

export function RangeRowsForm({ settings, onCreate, label = "Create rows", disabled = false }: {
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
  onCreate: (rows: ReadingRow[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [values, setValues] = useState({ from: "", to: "", interval: "10", left: "3.375", right: "3.375" });
  const [error, setError] = useState("");
  const create = () => {
    try {
      const from = parseChainage(values.from), to = parseChainage(values.to);
      if (from == null || to == null) throw new Error("Enter From chainage and To chainage.");
      const distances = (value: string) => value.trim() ? value.split(";").map(text => Number(text.trim().replace(",", "."))) : [];
      onCreate(createRangeReadings(toOursChainage(from, settings.bookChainageSystem, settings.consultantOffsetM),
        toOursChainage(to, settings.bookChainageSystem, settings.consultantOffsetM),
        Number(values.interval.replace(",", ".")), distances(values.left), distances(values.right)));
      setError("");
    } catch (cause) { setError((cause as Error).message); }
  };
  return <fieldset disabled={disabled} className="space-y-3 rounded border p-3">
    <legend className="px-1 text-sm font-medium">Chainages and points across</legend>
    <div className="grid gap-3 sm:grid-cols-3">
      {([["from", "From chainage"], ["to", "To chainage"], ["interval", "Interval (m)"],
        ["left", "Left distances (m; separate with ;)"], ["right", "Right distances (m; separate with ;)"]] as const).map(([key, text]) =>
        <label key={key} className="text-sm">{text}<Input aria-label={text} value={values[key]} inputMode={key === "left" || key === "right" ? undefined : "decimal"}
          onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /></label>)}
    </div>
    <p className="text-xs">CL is included. Use {settings.bookChainageSystem === "ours" ? "our" : "consultant"} chainages.</p>
    {error && <p role="alert">{error}</p>}
    <Button type="button" variant="outline" onClick={create}>{label}</Button>
  </fieldset>;
}
