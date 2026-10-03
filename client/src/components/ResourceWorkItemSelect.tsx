import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dprBoqItemDisplayName } from "@shared/dprBoqSelection";
import { resourceSuggestion, type SuggestionRow } from "@/lib/resourceSuggestions";

type Item = { id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null };
export function ResourceWorkItemSelect({ row, items, activityIds, onChange, testId, itemLabel = dprBoqItemDisplayName }: {
  row: SuggestionRow; items: Item[]; activityIds: number[]; onChange: (value: string) => void; testId: string; itemLabel?: (item: Item) => string;
}) {
  const today = activityIds.map(id => items.find(item => item.id === id) ?? { id, displayName: `Work item ${id}` });
  const other = items.filter(item => !activityIds.includes(item.id));
  return <>
    <Select value={row.resourceScope === "general" ? "general" : row.boqItemId != null ? String(row.boqItemId) : "none"} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}><SelectValue placeholder="Work item (optional)" /></SelectTrigger>
      <SelectContent>
        {today.length > 0 && <SelectGroup><SelectLabel>Today's activities</SelectLabel>
          {today.map(item => <SelectItem key={item.id} value={String(item.id)}>{itemLabel(item)}</SelectItem>)}
        </SelectGroup>}
        <SelectItem value="general">General / not item-specific</SelectItem>
        {other.length > 0 && <SelectGroup><SelectLabel>Other BOQ items</SelectLabel>
          {other.map(item => <SelectItem key={item.id} value={String(item.id)}>{itemLabel(item)}</SelectItem>)}
        </SelectGroup>}
        <SelectItem value="none">No work item</SelectItem>
      </SelectContent>
    </Select>
    {row[resourceSuggestion] === "suggested" && row.persistedId == null && <p className="text-xs text-muted-foreground">Suggested from today's activity — change if wrong</p>}
  </>;
}