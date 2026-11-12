import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Power, Trash2 } from "lucide-react";
import type { EquipmentMasterType } from "@shared/schema";
import { derivedEquipmentType, displayHireBasis } from "@shared/equipmentMasterRules";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function normalizeLabel(value: unknown): string {
  return String(value ?? "").trim().toLocaleUpperCase().replace(/\s+/g, " ");
}

function active(equipment: EquipmentMasterType): boolean {
  return Number(equipment.isActive ?? 1) !== 0;
}

function divisorLabel(equipment: EquipmentMasterType): string {
  if (equipment.hireMonthlyDivisorType === "custom" && equipment.hireMonthlyDivisor != null) {
    return `${equipment.hireMonthlyDivisor} days`;
  }
  return equipment.hireMonthlyDivisorType === "30" ? "30 days" : "Calendar days";
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>;
}

interface EquipmentMasterRowsProps {
  equipment: EquipmentMasterType[];
  showInactive: boolean;
  onShowInactiveChange: (show: boolean) => void;
  vendorMasterNames: string[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (equipment: EquipmentMasterType) => void;
  onToggleActive: (id: number) => void;
  onDelete: (id: number) => void;
  togglePending?: boolean;
}

export function EquipmentMasterRows({
  equipment,
  showInactive,
  onShowInactiveChange,
  vendorMasterNames,
  canEdit,
  canDelete,
  onEdit,
  onToggleActive,
  onDelete,
  togglePending = false,
}: EquipmentMasterRowsProps) {
  const [tab, setTab] = useState<"owned" | "hired">("owned");
  const [searchByTab, setSearchByTab] = useState<Record<"owned" | "hired", string>>({ owned: "", hired: "" });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const knownVendorNames = useMemo(() => new Set(vendorMasterNames.map(normalizeLabel)), [vendorMasterNames]);
  const visibleTabRows = (ownership: "owned" | "hired") =>
    equipment.filter(item =>
      (item.ownership === "hired" ? "hired" : "owned") === ownership &&
      (showInactive || active(item)),
    );
  const counts = {
    owned: visibleTabRows("owned").length,
    hired: visibleTabRows("hired").length,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="equipment-show-inactive"
          checked={showInactive}
          onCheckedChange={value => onShowInactiveChange(value === true)}
          data-testid="checkbox-show-inactive"
        />
        <Label htmlFor="equipment-show-inactive" className="cursor-pointer text-sm">Show inactive</Label>
      </div>
      <Tabs value={tab} onValueChange={value => setTab(value as "owned" | "hired")}>
        <TabsList>
          <TabsTrigger value="owned" data-testid="tab-equipment-owned">Owned ({counts.owned})</TabsTrigger>
          <TabsTrigger value="hired" data-testid="tab-equipment-hired">Hired ({counts.hired})</TabsTrigger>
        </TabsList>
        {(["owned", "hired"] as const).map(ownership => {
          const rows = visibleTabRows(ownership);
          const search = searchByTab[ownership];
          const needle = normalizeLabel(search);
          const filtered = rows.filter(item => {
            if (!needle) return true;
            return [
              derivedEquipmentType(item.name),
              item.name,
              item.registrationNumber,
              ownership === "hired" ? item.vendorName : null,
            ].some(value => normalizeLabel(value).includes(needle));
          });
          return (
            <TabsContent key={ownership} value={ownership} className="space-y-3">
              <Input
                value={search}
                onChange={event => setSearchByTab(current => ({ ...current, [ownership]: event.target.value }))}
                placeholder="Search by type, name, registration or owner"
                aria-label={`Search ${ownership} equipment`}
                data-testid={`input-equipment-search-${ownership}`}
              />
              {filtered.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  {rows.length ? "No equipment matches this search." : `No ${ownership} equipment to show.`}
                </p>
              ) : (
                <div className="space-y-2">
                  {filtered.map(item => {
                    const isExpanded = expandedId === item.id;
                    const isInactive = !active(item);
                    const type = derivedEquipmentType(item.name);
                    const ownerName = item.vendorName?.trim() ?? "";
                    const ownerIsInMaster = !!ownerName && knownVendorNames.has(normalizeLabel(ownerName));
                    const nonMonthlyBasis = item.hireBillingBasis && item.hireBillingBasis !== "monthly"
                      ? displayHireBasis(item.hireBillingBasis)
                      : null;
                    const registration = item.registrationNumber?.trim() || "—";
                    return (
                      <article
                        key={item.id}
                        className={`rounded-md border ${isInactive ? "bg-muted/20 opacity-75" : "bg-background"}`}
                        data-testid={`row-equipment-${item.id}`}
                      >
                        <button
                          type="button"
                          className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
                          aria-expanded={isExpanded}
                          aria-controls={`equipment-details-${item.id}`}
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          data-testid={`toggle-equipment-row-${item.id}`}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {type} · Reg. no. {registration}
                            {ownership === "hired" ? ` · Owner ${ownerName || "—"}` : ""}
                            {ownership === "hired" && item.hireBillingBasis === "monthly" && item.hireRate != null
                              ? ` · Monthly ${rupees.format(Number(item.hireRate))}`
                              : ""}
                          </span>
                          {isInactive && <Badge variant="outline" className="shrink-0">Inactive</Badge>}
                        </button>
                        {isExpanded && (
                          <div id={`equipment-details-${item.id}`} className="border-t px-4 py-3" data-testid={`equipment-details-${item.id}`}>
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                              <Detail label="Name" value={item.name || "—"} />
                              <Detail label="Type" value={type} />
                              <Detail label="Registration no." value={registration} />
                              {ownership === "hired" && (
                                <div className="min-w-0">
                                  <dt className="text-xs text-muted-foreground">Owner</dt>
                                  <dd className="flex flex-wrap items-center gap-2 text-sm">
                                    <span>{ownerName || "—"}</span>
                                    {ownerName && !ownerIsInMaster && <Badge variant="outline">Not in vendor master</Badge>}
                                  </dd>
                                </div>
                              )}
                              <Detail label="Meter type" value={item.meterType === "odometer" ? "Odometer" : "Hour meter"} />
                              <Detail
                                label="Fuel norm"
                                value={item.consumptionNorm == null ? "—" : `${item.consumptionNorm} ${item.meterType === "odometer" ? "L/km" : "L/hr"}`}
                              />
                              <Detail label="Plant" value={item.plantName?.trim() || "Shared / no specific plant"} />
                              {ownership === "hired" && item.hireBillingBasis === "monthly" && (
                                <>
                                  <Detail label="Hire rate" value={item.hireRate == null ? "—" : rupees.format(Number(item.hireRate))} />
                                  <Detail label="Start date" value={item.hireStartDate || "—"} />
                                  <Detail label="End date" value={item.hireEndDate || "Open-ended"} />
                                  <Detail label="Divisor" value={divisorLabel(item)} />
                                  <Detail label="Diesel by" value={item.hireDieselResponsibility === "vendor" ? "Vendor" : "HLC"} />
                                  <Detail label="Operator by" value={item.hireOperatorResponsibility === "vendor" ? "Vendor" : "HLC"} />
                                  <Detail label="Breakdown deduction" value={item.hireBreakdownDeductionEnabled ? "Allowed" : "Not allowed"} />
                                  {item.hireAgreementRemarks?.trim() && <Detail label="Remarks" value={item.hireAgreementRemarks.trim()} />}
                                </>
                              )}
                              {ownership === "hired" && nonMonthlyBasis && (
                                <div className="sm:col-span-2 lg:col-span-3 text-sm" data-testid={`hire-basis-note-${item.id}`}>
                                  {nonMonthlyBasis}
                                </div>
                              )}
                            </dl>
                            {(canEdit || canDelete) && (
                              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                                {canEdit && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => onEdit(item)} data-testid={`button-edit-equipment-${item.id}`}>
                                      <Pencil className="mr-1 h-4 w-4" /> Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onToggleActive(item.id)}
                                      disabled={togglePending}
                                      data-testid={`button-toggle-equipment-${item.id}`}
                                    >
                                      <Power className="mr-1 h-4 w-4" /> {isInactive ? "Activate" : "Deactivate"}
                                    </Button>
                                  </>
                                )}
                                {canDelete && (
                                  <Button size="sm" variant="destructive" onClick={() => onDelete(item.id)} data-testid={`button-delete-equipment-${item.id}`}>
                                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
