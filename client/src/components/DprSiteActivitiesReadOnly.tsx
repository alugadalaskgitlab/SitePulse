import { getSafeAttachmentObjectPath } from "@/components/AttachmentViewer";
import { DPR_SITE_ACTIVITY_TYPE_LABELS, formatDprChainage } from "@shared/dprSiteActivities";
import type { DprSiteActivity } from "@/components/DprSiteActivitiesEditor";

function chainageRange(from: unknown, to: unknown) {
  const start = formatDprChainage(from);
  const end = formatDprChainage(to);
  if (start && end) return `${start}–${end}`;
  return start || end;
}

function detailsFor(activity: DprSiteActivity) {
  const details: string[] = [];
  const range = chainageRange(activity.chainageFrom, activity.chainageTo);
  if (range) details.push(`Chainage ${range}`);
  if (activity.layer) details.push(`Layer / material: ${activity.layer}`);
  if (activity.activityType === "test") {
    if (activity.testPlace) details.push(`Done at: ${activity.testPlace}`);
    if (activity.side) details.push(`Side: ${activity.side}`);
    if (activity.resultValue != null && activity.resultValue !== "") details.push(`Result: ${activity.resultValue}`);
    if (activity.requiredValue != null && activity.requiredValue !== "") details.push(`Required: ${activity.requiredValue}`);
  }
  if (activity.activityType === "levels" && activity.deptPerson) details.push(`Department person: ${activity.deptPerson}`);
  if (activity.activityType === "office" && activity.note) details.push(activity.note);
  if (activity.activityType === "visit") {
    if (activity.visitorDesignation) details.push(activity.visitorDesignation);
    if (activity.note) details.push(activity.note);
  }
  if (activity.activityType === "other" && activity.note) details.push(activity.note);
  if (activity.activityType === "levels" && activity.note) details.push(activity.note);
  if (activity.activityType === "test" && activity.note) details.push(activity.note);
  return details;
}

export function DprSiteActivitiesReadOnly({ activities = [] }: { activities?: DprSiteActivity[] }) {
  return (
    <section className="rounded-lg border p-4 print:break-inside-avoid print:bg-white print:text-black" data-testid="dpr-site-activities-readonly">
      <h2 className="mb-3 text-lg font-semibold">Site activities</h2>
      {!activities.length ? <p className="text-sm text-muted-foreground print:text-black">No site activities recorded.</p> : (
        <div className="space-y-3">
          {activities.map((activity, index) => {
            const typeLabel = DPR_SITE_ACTIVITY_TYPE_LABELS[activity.activityType];
            const title = activity.activityType === "other"
              ? typeLabel
              : activity.levelsKind || activity.testName || activity.officeWork || activity.visitorName || typeLabel;
            const detailLines = detailsFor(activity);
            const staffNames = activity.staffNames?.length
              ? activity.staffNames
              : activity.staff?.map((person: { name: string }) => person.name) ?? [];
            const safeObjectPath = activity.objectPath ? getSafeAttachmentObjectPath(activity.objectPath) : null;
            return (
              <article key={activity.id ?? activity.persistedId ?? index} className="rounded-md border p-3 print:border-black print:bg-white">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium">{typeLabel}</span>
                  <h3 className="font-semibold">{title}</h3>
                </div>
                {detailLines.length > 0 && <p className="mt-1 whitespace-pre-wrap text-sm">{detailLines.join(" · ")}</p>}
                {activity.activityType === "test" && activity.resultPass != null && (
                  <p className="mt-1 text-sm font-bold" data-testid={`site-activity-result-${index}`}>
                    {activity.resultPass ? "Pass" : "Fail"}
                  </p>
                )}
                {staffNames.length > 0 && <p className="mt-1 text-sm"><span className="font-medium">Who did it:</span> {staffNames.join(", ")}</p>}
                {safeObjectPath && activity.fileName && <p className="mt-2 text-sm">
                  <a className="underline print:no-underline" href={safeObjectPath} target="_blank" rel="noreferrer">{activity.fileName}</a>
                </p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
