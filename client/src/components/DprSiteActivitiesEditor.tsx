import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, FileText, Paperclip, Plus, Trash2, X } from "lucide-react";
import {
  DPR_SITE_ACTIVITY_DEFAULT_LAYERS,
  DPR_SITE_ACTIVITY_LEVEL_KINDS,
  DPR_SITE_ACTIVITY_OFFICE_WORK,
  DPR_SITE_ACTIVITY_TESTS,
  DPR_SITE_ACTIVITY_TEST_PLACES,
} from "@shared/dprSiteActivities";

export type DprSiteActivityType =
  | "levels"
  | "test"
  | "office"
  | "visit"
  | "other";

export type DprSiteActivity = {
  id?: number | string | null;
  persistedId?: number | string | null;
  activityType: DprSiteActivityType;
  sortOrder?: number | null;
  chainageFrom?: number | string | null;
  chainageTo?: number | string | null;
  side?: string | null;
  layer?: string | null;
  levelsKind?: string | null;
  deptPerson?: string | null;
  testName?: string | null;
  testPlace?: string | null;
  resultValue?: number | string | null;
  requiredValue?: number | string | null;
  resultPass?: boolean | null;
  officeWork?: string | null;
  note?: string | null;
  visitorName?: string | null;
  visitorDesignation?: string | null;
  fileName?: string | null;
  objectPath?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  staffNames?: string[];
  staff?: Array<{ id: number; name: string; isActive?: number | boolean | null }>;
  file?: File;
  attachment?: {
    fileName: string;
    objectPath: string;
    mimeType?: string;
    fileSize?: number;
  } | null;
  personnelIds: number[];
};

export type DprSiteActivityPersonnel = {
  id: number;
  name: string;
  isActive: boolean;
};

export type DprSiteActivitiesEditorProps = {
  activities: DprSiteActivity[];
  personnel: DprSiteActivityPersonnel[];
  layers: string[];
  disabled?: boolean;
  uploading?: boolean;
  onChange: (next: DprSiteActivity[]) => void;
  onRemove: (index: number) => void;
  onFileSelected: (index: number, file: File) => void;
  onRemoveAttachment: (index: number) => void;
};

const ACTIVITY_TYPES: { value: DprSiteActivityType; label: string }[] = [
  { value: "levels", label: "Levels / survey" },
  { value: "test", label: "Lab / field test" },
  { value: "office", label: "Office work" },
  { value: "visit", label: "Inspection / meeting" },
  { value: "other", label: "Other" },
];

function activityLabel(type: string) {
  return ACTIVITY_TYPES.find(option => option.value === type)?.label ?? type;
}

function displayValue(value: string | number | null | undefined) {
  return value == null || String(value).trim() === "" ? "" : String(value);
}

function formatChainage(value: number | string | null | undefined) {
  if (value == null || String(value).trim() === "") return "";
  const raw = String(value).trim();
  const numeric = Number(raw.replace(/\s/g, ""));
  if (!Number.isFinite(numeric)) return raw;
  const metres = Math.round(numeric * 1000);
  const kmPart = Math.floor(metres / 1000);
  const metrePart = String(Math.abs(metres % 1000)).padStart(3, "0");
  return `${kmPart}+${metrePart}`;
}

function selectOptions(options: readonly string[]) {
  return options.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>);
}

function activityTitle(activity: DprSiteActivity) {
  switch (activity.activityType) {
    case "levels":
      return activity.levelsKind || "Survey levels";
    case "test":
      return activity.testName || "Field / lab test";
    case "office":
      return activity.officeWork || "Office work";
    case "visit":
      return activity.visitorName || "Visit";
    default:
      return activity.note || "Other activity";
  }
}

function activityDetails(activity: DprSiteActivity) {
  const details: string[] = [];
  const from = formatChainage(activity.chainageFrom);
  const to = formatChainage(activity.chainageTo);
  if (from || to) details.push(`Chainage ${from || "—"}${to ? ` to ${to}` : ""}`);
  if (activity.side) details.push(activity.side);
  if (activity.layer) details.push(activity.layer);
  if (activity.testPlace) details.push(activity.testPlace);
  if (activity.resultValue !== "" && activity.resultValue != null) {
    details.push(`Result ${activity.resultValue}${activity.requiredValue !== "" && activity.requiredValue != null ? ` / ${activity.requiredValue}` : ""}`);
  }
  if (activity.note && activity.activityType !== "other") details.push(activity.note);
  return details;
}

export function DprSiteActivitiesEditor({
  activities,
  personnel,
  layers,
  disabled = false,
  uploading = false,
  onChange,
  onRemove,
  onFileSelected,
  onRemoveAttachment,
}: DprSiteActivitiesEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const uid = useId();
  const patch = (index: number, changes: Partial<DprSiteActivity>) => {
    onChange(activities.map((activity, i) => i === index ? { ...activity, ...changes } : activity));
  };
  const addActivity = (activityType: DprSiteActivityType) => {
    const nextIndex = activities.length;
    onChange([...activities, {
      activityType,
      sortOrder: activities.reduce((maximum, item) => Math.max(maximum, Number(item.sortOrder) || 0), 0) + 1,
      personnelIds: [],
    }]);
    setEditingIndex(nextIndex);
  };
  const remove = (index: number) => {
    onRemove(index);
    setEditingIndex(current => current === index ? null : current != null && current > index ? current - 1 : current);
  };
  const togglePersonnel = (index: number, personId: number, checked: boolean) => {
    const current = activities[index].personnelIds ?? [];
    patch(index, {
      personnelIds: checked
        ? Array.from(new Set([...current, personId]))
        : current.filter(id => id !== personId),
    });
  };

  return (
    <section className="space-y-3" aria-label="Site activities">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Site activities</h3>
          <p className="text-xs text-muted-foreground">Optional activities recorded alongside daily progress.</p>
        </div>
        {activities.length > 0 && (
          <span className="text-xs text-muted-foreground">{activities.length} {activities.length === 1 ? "entry" : "entries"}</span>
        )}
      </header>

      {activities.map((activity, index) => {
        const isEditing = editingIndex === index;
        const fieldId = (name: string) => `${uid}-activity-${index}-${name}`;
        const linkedPersonnel = (activity.personnelIds ?? [])
          .map(id => personnel.find(person => person.id === id))
          .filter((person): person is DprSiteActivityPersonnel => Boolean(person));
        const inactiveLinked = linkedPersonnel.filter(person => !person.isActive);
        const activePersonnel = personnel.filter(person => person.isActive);
        const details = activityDetails(activity);

        if (!isEditing) {
          return (
            <article key={activity.id ?? activity.persistedId ?? `activity-${index}`} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{activityLabel(activity.activityType)}</span>
                    <h4 className="font-medium">{activityTitle(activity)}</h4>
                    {activity.resultPass != null && (
                      <span className="text-xs font-bold text-black">{activity.resultPass ? "Pass" : "Fail"}</span>
                    )}
                  </div>
                  {details.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{details.join(" · ")}</p>}
                  {linkedPersonnel.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Staff: {linkedPersonnel.map(person => person.name).join(", ")}</p>
                  )}
                  {(activity.file || activity.attachment) && (
                    <p className="mt-1 flex items-center gap-1 break-all text-xs text-muted-foreground">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      {activity.file?.name ?? activity.attachment?.fileName}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setEditingIndex(index)}>Edit</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => remove(index)} aria-label={`Remove ${activityLabel(activity.activityType)} entry`}>
                    <Trash2 className="mr-1 h-4 w-4" />Remove
                  </Button>
                </div>
              </div>
            </article>
          );
        }

        return (
          <article key={activity.id ?? activity.persistedId ?? `activity-${index}`} className="space-y-4 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Activity details</h4>
              <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setEditingIndex(null)}>
                <Check className="mr-1 h-4 w-4" />Done
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="sm:col-span-2 text-sm text-muted-foreground">{activityLabel(activity.activityType)}</p>

              {activity.activityType === "levels" && <>
                <div>
                  <Label htmlFor={fieldId("levels-kind")}>Levels taken as</Label>
                  <Select value={activity.levelsKind || "__none__"} disabled={disabled} onValueChange={value => patch(index, { levelsKind: value === "__none__" ? null : value })}>
                    <SelectTrigger id={fieldId("levels-kind")}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Select</SelectItem>{selectOptions(DPR_SITE_ACTIVITY_LEVEL_KINDS)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={fieldId("chainage-from")}>From chainage (km)</Label>
                  <Input id={fieldId("chainage-from")} inputMode="decimal" value={displayValue(activity.chainageFrom)} disabled={disabled} onChange={event => patch(index, { chainageFrom: event.target.value })} placeholder="2.600" />
                </div>
                <div>
                  <Label htmlFor={fieldId("chainage-to")}>To chainage (km)</Label>
                  <Input id={fieldId("chainage-to")} inputMode="decimal" value={displayValue(activity.chainageTo)} disabled={disabled} onChange={event => patch(index, { chainageTo: event.target.value })} placeholder="2.800" />
                </div>
                <div>
                  <Label htmlFor={fieldId("layer")}>Layer</Label>
                  <Select value={activity.layer || "__none__"} disabled={disabled} onValueChange={value => patch(index, { layer: value === "__none__" ? "" : value })}>
                    <SelectTrigger id={fieldId("layer")}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Select</SelectItem>{Array.from(new Set([...layers, ...DPR_SITE_ACTIVITY_DEFAULT_LAYERS])).map(layer => <SelectItem key={layer} value={layer}>{layer}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {activity.levelsKind === "Joint levels with department" && <div>
                  <Label htmlFor={fieldId("dept-person")}>Department person</Label>
                  <Input id={fieldId("dept-person")} value={activity.deptPerson ?? ""} disabled={disabled} onChange={event => patch(index, { deptPerson: event.target.value })} />
                </div>}
              </>}

              {activity.activityType === "test" && <>
                <div>
                  <Label htmlFor={fieldId("test-name")}>Test</Label>
                  <Select value={activity.testName || "__none__"} disabled={disabled} onValueChange={value => patch(index, { testName: value === "__none__" ? null : value })}>
                    <SelectTrigger id={fieldId("test-name")}><SelectValue placeholder="Select test" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Select test</SelectItem>{selectOptions(DPR_SITE_ACTIVITY_TESTS)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={fieldId("test-place")}>Done at</Label>
                  <Select value={activity.testPlace || "__none__"} disabled={disabled} onValueChange={value => patch(index, { testPlace: value === "__none__" ? null : value })}>
                    <SelectTrigger id={fieldId("test-place")}><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Select location</SelectItem>{selectOptions(DPR_SITE_ACTIVITY_TEST_PLACES)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={fieldId("layer")}>Layer / material</Label>
                  <Select value={activity.layer || "__none__"} disabled={disabled} onValueChange={value => patch(index, { layer: value === "__none__" ? "" : value })}>
                    <SelectTrigger id={fieldId("layer")}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Select</SelectItem>{Array.from(new Set([...layers, ...DPR_SITE_ACTIVITY_DEFAULT_LAYERS])).map(layer => <SelectItem key={layer} value={layer}>{layer}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={fieldId("chainage-from")}>Chainage / sample from (km)</Label>
                  <Input id={fieldId("chainage-from")} inputMode="decimal" value={displayValue(activity.chainageFrom)} disabled={disabled} onChange={event => patch(index, { chainageFrom: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor={fieldId("side")}>Side</Label>
                  <Select value={activity.side || "__none__"} disabled={disabled} onValueChange={value => patch(index, { side: value === "__none__" ? null : value })}>
                    <SelectTrigger id={fieldId("side")}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Select</SelectItem><SelectItem value="Centre">Centre</SelectItem><SelectItem value="LHS">LHS</SelectItem><SelectItem value="RHS">RHS</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={fieldId("result")}>Result</Label>
                  <Input id={fieldId("result")} value={displayValue(activity.resultValue)} disabled={disabled} onChange={event => patch(index, { resultValue: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor={fieldId("required")}>Required</Label>
                  <Input id={fieldId("required")} value={displayValue(activity.requiredValue)} disabled={disabled} onChange={event => patch(index, { requiredValue: event.target.value })} />
                </div>
              </>}

              {activity.activityType === "office" && (
                <div className="sm:col-span-2">
                  <Label htmlFor={fieldId("office-work")}>Work</Label>
                  <Select value={activity.officeWork || "__none__"} disabled={disabled} onValueChange={value => patch(index, { officeWork: value === "__none__" ? null : value })}>
                    <SelectTrigger id={fieldId("office-work")}><SelectValue placeholder="Select work" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">Select work</SelectItem>{selectOptions(DPR_SITE_ACTIVITY_OFFICE_WORK)}</SelectContent>
                  </Select>
                </div>
              )}
              {activity.activityType === "office" && (
                <div className="sm:col-span-2">
                  <Label htmlFor={fieldId("office-details")}>Details</Label>
                  <Textarea id={fieldId("office-details")} value={activity.note ?? ""} disabled={disabled} onChange={event => patch(index, { note: event.target.value })} rows={2} />
                </div>
              )}

              {activity.activityType === "visit" && <>
                <div>
                  <Label htmlFor={fieldId("visitor-name")}>Visitor</Label>
                  <Input id={fieldId("visitor-name")} value={activity.visitorName ?? ""} disabled={disabled} onChange={event => patch(index, { visitorName: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor={fieldId("visitor-designation")}>Designation</Label>
                  <Input id={fieldId("visitor-designation")} value={activity.visitorDesignation ?? ""} disabled={disabled} onChange={event => patch(index, { visitorDesignation: event.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={fieldId("visit-note")}>Instructions given / points discussed</Label>
                  <Textarea id={fieldId("visit-note")} value={activity.note ?? ""} disabled={disabled} onChange={event => patch(index, { note: event.target.value })} rows={2} />
                </div>
              </>}

              {activity.activityType === "other" && (
                <div className="sm:col-span-2">
                  <Label htmlFor={fieldId("note")}>Activity</Label>
                  <Textarea id={fieldId("note")} value={activity.note ?? ""} disabled={disabled} onChange={event => patch(index, { note: event.target.value })} rows={2} />
                </div>
              )}

              {activity.activityType === "levels" && (
                <div className="sm:col-span-2">
                  <Label htmlFor={fieldId("note")}>Note</Label>
                  <Textarea id={fieldId("note")} value={activity.note ?? ""} disabled={disabled} onChange={event => patch(index, { note: event.target.value })} rows={2} />
                </div>
              )}
              {activity.activityType === "test" && (
                <div className="sm:col-span-2">
                  <Label htmlFor={fieldId("note")}>Note</Label>
                  <Textarea id={fieldId("note")} value={activity.note ?? ""} disabled={disabled} onChange={event => patch(index, { note: event.target.value })} rows={2} />
                </div>
              )}

              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-medium">Who did it</legend>
                {activePersonnel.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activePersonnel.map(person => {
                      const checkboxId = fieldId(`person-${person.id}`);
                      return (
                        <div key={person.id} className="flex items-center gap-2">
                          <input id={checkboxId} type="checkbox" className="h-4 w-4 accent-current" checked={(activity.personnelIds ?? []).includes(person.id)} disabled={disabled} onChange={event => togglePersonnel(index, person.id, event.target.checked)} />
                          <Label htmlFor={checkboxId} className="font-normal">{person.name}</Label>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No active staff available.</p>}
                {inactiveLinked.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Previously linked (inactive): {inactiveLinked.map(person => person.name).join(", ")}</p>
                )}
              </fieldset>

              <div className="sm:col-span-2">
                <Label htmlFor={fieldId("file")}>Photo / sheet</Label>
                <Input
                  id={fieldId("file")}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  disabled={disabled || uploading}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) onFileSelected(index, file);
                    event.currentTarget.value = "";
                  }}
                />
                {uploading && <p className="mt-1 text-xs text-muted-foreground">Uploading attachment…</p>}
                {activity.file && (
                  <p className="mt-2 flex items-center gap-2 break-all text-xs">
                    <Paperclip className="h-3 w-3 shrink-0" />Selected: {activity.file.name}
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={disabled || uploading} aria-label="Remove selected file" onClick={() => patch(index, { file: undefined })}><X className="h-4 w-4" /></Button>
                  </p>
                )}
                {activity.attachment && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {activity.attachment.mimeType?.startsWith("image/") ? <Paperclip className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                    <span className="break-all">{activity.attachment.fileName}</span>
                    <Button type="button" size="sm" variant="ghost" disabled={disabled || uploading} onClick={() => onRemoveAttachment(index)} aria-label={`Remove attachment ${activity.attachment.fileName}`}>
                      <Trash2 className="mr-1 h-3 w-3" />Remove attachment
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end border-t pt-2">
              <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => remove(index)}>
                <Trash2 className="mr-1 h-4 w-4" />Remove activity
              </Button>
            </div>
          </article>
        );
      })}

      {activities.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No site activities added. This section is optional.</p>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Add a site activity">
        {ACTIVITY_TYPES.map(option => (
          <Button key={option.value} type="button" size="sm" variant="outline" disabled={disabled || editingIndex != null} onClick={() => addActivity(option.value)}>
            <Plus className="mr-1 h-4 w-4" />{option.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

export default DprSiteActivitiesEditor;
