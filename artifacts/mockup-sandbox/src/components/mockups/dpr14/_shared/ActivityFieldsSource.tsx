import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Static example of SiteEntry's detailed road-progress row; not a DPR form.
const entry = {
  activity: "WMM LAYING",
  boqItemId: 42,
  programmeBarId: 7,
  side: "LHS",
  chainageFrom: "1+200",
  chainageTo: "1+450",
  width: 7,
  thickness: 0.15,
  layerNo: 1,
  uom: "CUM",
  quantity: 262.5,
  quantitySource: "calculated",
  noSiteWork: false,
  isIncidental: false,
};
const SIDE_OPTIONS = ["LHS", "RHS", "Both Sides", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS", "LS"];

export function ActivityFieldsSource() {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="source-no-site-work" checked={entry.noSiteWork} disabled />
            <Label htmlFor="source-no-site-work" className="cursor-pointer text-sm">No Site Work</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="source-incidental" checked={entry.isIncidental} disabled />
            <Label htmlFor="source-incidental" className="cursor-pointer text-sm">Incidental / Non-BOQ</Label>
          </div>
        </div>
        <Button size="icon" variant="ghost" disabled aria-label="Remove activity">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <div className="col-span-2">
          <Label className="text-sm">BOQ Item / Activity</Label>
          <Input value={entry.activity} readOnly aria-label="Sample BOQ item / activity" />
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px]">BOQ #{entry.boqItemId}</Badge>
            <Badge variant="outline" className="text-[10px]">Programme bar #{entry.programmeBarId}</Badge>
          </div>
        </div>
        <div>
          <Label className="text-sm">Side</Label>
          <Select value={entry.side} disabled>
            <SelectTrigger><SelectValue placeholder="Side" /></SelectTrigger>
            <SelectContent>{SIDE_OPTIONS.map(side => <SelectItem key={side} value={side}>{side}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm">From (Ch.)</Label>
          <Input className="uppercase" value={entry.chainageFrom} readOnly />
        </div>
        <div>
          <Label className="text-sm">To (Ch.)</Label>
          <Input className="uppercase" value={entry.chainageTo} readOnly />
        </div>
        <div>
          <Label className="text-sm">L (m)</Label>
          <Input className="bg-muted/50" value="250.00" readOnly tabIndex={-1} />
        </div>
        <div>
          <Label className="text-sm">W (m)</Label>
          <Input type="number" step="0.01" value={entry.width} readOnly />
        </div>
        <div>
          <Label className="text-sm">T (m)</Label>
          <Input type="number" step="0.01" value={entry.thickness} readOnly />
        </div>
        <div>
          <Label className="text-sm">Layer / Lift No.</Label>
          <Input type="number" step={1} min={1} value={entry.layerNo} readOnly />
        </div>
        <div>
          <Label className="flex items-center gap-1 text-sm">UOM <span className="rounded border border-teal-200 bg-teal-50 px-1 py-0.5 text-[10px] font-semibold text-teal-700">auto</span></Label>
          <Select value={entry.uom} disabled>
            <SelectTrigger><SelectValue placeholder="UOM" /></SelectTrigger>
            <SelectContent>{UOM_OPTIONS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm">Physical Qty ({entry.uom})</Label>
          <Input type="number" step="0.01" value={entry.quantity} readOnly />
          <p className="mt-1 text-[10px] text-muted-foreground">Quantity source: Calculated from geometry (automatic)</p>
        </div>
      </div>
    </div>
  );
}