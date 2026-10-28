import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { SiteMaterialTrip } from "@shared/schema";
import {
  bulkConfirmableTripRole,
  bulkTripRoleGroupKey,
  bulkTripRoleReviewReason,
  classifyTripRoles,
  type BulkConfirmableTripRole,
} from "@shared/tripTransportRoles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RoleGroup = {
  key: string;
  role: BulkConfirmableTripRole | null;
  source: string;
  transporter: string;
  site: string;
  trips: SiteMaterialTrip[];
  reviewReason: string | null;
};

type Props = {
  trips: SiteMaterialTrip[];
  onConfirm: (input: { tripIds: number[]; role: BulkConfirmableTripRole }) => Promise<void>;
};

const roleLabel: Record<BulkConfirmableTripRole, string> = {
  same_party: "Same party",
  different_parties: "Different parties",
  own_source_agency: "Own source · agency transporter",
};

function groupSource(trip: SiteMaterialTrip): string {
  return trip.materialSourceType === "own_source"
    ? trip.materialSourceLabel?.trim() || "Own source label missing"
    : trip.materialSourceSupplier?.trim() || "Material source missing";
}

function groupTransporter(trip: SiteMaterialTrip): string {
  return trip.supplier?.trim() ||
    (trip.internalEquipmentId != null ? `Internal equipment #${trip.internalEquipmentId}` : "Transporter missing");
}

function displayDate(date: string): string {
  try {
    return format(new Date(`${date}T00:00:00`), "dd MMM yyyy");
  } catch {
    return date;
  }
}

function buildGroups(trips: SiteMaterialTrip[]): RoleGroup[] {
  const groups = new Map<string, RoleGroup>();
  for (const trip of trips) {
    if (classifyTripRoles(trip) !== "unresolved") continue;
    const key = bulkTripRoleGroupKey(trip);
    const role = bulkConfirmableTripRole(trip);
    const existing = groups.get(key);
    if (existing) {
      existing.trips.push(trip);
      if (existing.role !== role) {
        existing.role = null;
        existing.reviewReason = bulkTripRoleReviewReason(trip);
      }
      continue;
    }
    groups.set(key, {
      key,
      role,
      source: groupSource(trip),
      transporter: groupTransporter(trip),
      site: trip.site,
      trips: [trip],
      reviewReason: role ? null : bulkTripRoleReviewReason(trip),
    });
  }
  return Array.from(groups.values()).sort((a, b) => b.trips.length - a.trips.length);
}

function describeGroupDates(group: RoleGroup): string {
  const dates = Array.from(new Set(group.trips.map(trip => trip.date).filter((date): date is string => !!date))).sort();
  if (!dates.length) return "Dates unavailable";
  if (dates.length === 1) return displayDate(dates[0]);
  return `${displayDate(dates[0])} – ${displayDate(dates[dates.length - 1])}`;
}

export function TripRoleBulkConfirmation({ trips, onConfirm }: Props) {
  const groups = useMemo(() => buildGroups(trips), [trips]);
  const [activeGroup, setActiveGroup] = useState<RoleGroup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const unresolvedCount = groups.reduce((sum, group) => sum + group.trips.length, 0);
  const readyCount = groups.reduce((sum, group) => sum + (group.role ? group.trips.length : 0), 0);
  const readyGroups = groups.filter((group): group is RoleGroup & { role: BulkConfirmableTripRole } => !!group.role);
  const reviewGroups = groups.filter(group => !group.role);

  if (!unresolvedCount) return null;

  const confirmActiveGroup = async () => {
    if (!activeGroup?.role) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({
        tripIds: activeGroup.trips.map(trip => trip.id),
        role: activeGroup.role,
      });
      setActiveGroup(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm this group. Refresh and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"
      aria-labelledby="trip-role-bulk-heading"
      data-testid="trip-role-bulk-confirmation"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trip-role-bulk-heading" className="text-base font-semibold">
            Confirm trip roles by source and transporter
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unresolvedCount} unresolved trip{unresolvedCount === 1 ? "" : "s"} in {groups.length} group{groups.length === 1 ? "" : "s"}.
            {" "}{readyCount} can be confirmed from their recorded party details; {unresolvedCount - readyCount} need individual review.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A group confirmation only records the transport type. It does not change party names, Vendor Master IDs, quantities, or vehicle details.
          </p>
        </div>
        <Badge variant={reviewGroups.length ? "secondary" : "default"}>Grouping: source + transporter</Badge>
      </div>

      {readyGroups.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Ready to confirm</h3>
          {readyGroups.map(group => (
            <div key={group.key} className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">
                  {group.source} <span className="text-muted-foreground">→</span> {group.transporter}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.site} · {group.trips.length} trip{group.trips.length === 1 ? "" : "s"} · {describeGroupDates(group)}
                </p>
                <p className="mt-1 text-xs">
                  Suggested role: <span className="font-medium">{roleLabel[group.role]}</span>
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setError("");
                  setActiveGroup(group);
                }}
                data-testid={`button-review-trip-role-group-${group.trips[0].id}`}
              >
                Review {group.trips.length} trip{group.trips.length === 1 ? "" : "s"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {reviewGroups.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Needs individual review</h3>
          {reviewGroups.map(group => (
            <div key={group.key} className="rounded-md border border-dashed bg-background/70 p-3">
              <p className="break-words text-sm font-medium">
                {group.source} <span className="text-muted-foreground">→</span> {group.transporter}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {group.site} · {group.trips.length} trip{group.trips.length === 1 ? "" : "s"} · {group.reviewReason}
              </p>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!activeGroup} onOpenChange={(open) => {
        if (!open && !submitting) {
          setActiveGroup(null);
          setError("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this trip group?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeGroup && (
                <>
                  Confirm <strong>{roleLabel[activeGroup.role!]}</strong> for {activeGroup.trips.length} trips at {activeGroup.site}:
                  {" "}<strong>{activeGroup.source} → {activeGroup.transporter}</strong>.
                  {" "}This records agency/vendor transport for the group and preserves all existing party names, IDs, quantities, and vehicle details.
                  {" "}The server rechecks every trip and will reject the whole group if any trip has changed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void confirmActiveGroup();
              }}
            >
              {submitting ? "Confirming…" : "Confirm this group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
