import { useQuery } from "@tanstack/react-query";
import type { EquipmentMasterType, Site, SiteMaterialTrip } from "@shared/schema";
import { TripRoleEditDialog } from "./TripRoleEditDialog";
import type { ExistingTripVendor } from "./trip-role-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  receipt: { id: number; site: string };
  sitesList: Site[];
  onClose: () => void;
  onSaved: (trip: SiteMaterialTrip) => void;
};

/** Report rows are projections, never safe edit drafts. Use the existing
 * scoped trip-list endpoint (there is no GET /trips/:id) and shared cache. */
export function ReceivedTripEditor({ receipt, sitesList, onClose, onSaved }: Props) {
  const trips = useQuery<SiteMaterialTrip[]>({
    queryKey: [`/api/site-material-trips?site=${encodeURIComponent(receipt.site)}`],
  });
  const trip = trips.data?.find(item => item.id === receipt.id);
  const vendors = useQuery<ExistingTripVendor[]>({
    queryKey: [`/api/site-material-trips/vendor-options?site=${encodeURIComponent(trip?.site || receipt.site)}`],
    enabled: !!trip,
  });
  const equipment = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
    enabled: !!trip,
  });
  if (!trip) return <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent>
      <DialogHeader><DialogTitle>Material Trip</DialogTitle><DialogDescription>Loading the saved trip before editing.</DialogDescription></DialogHeader>
      {trips.isLoading ? <div className="h-32 animate-pulse rounded bg-muted" role="status" aria-label="Loading full material trip" /> :
        <div role="alert" className="space-y-3">
          <p>{trips.isError ? "Could not load the full trip. No changes have been made." : "This trip is no longer available in this site. Close and refresh the report."}</p>
          <Button variant="outline" onClick={() => void trips.refetch()}>Retry</Button>
        </div>}
      <Button variant="outline" onClick={onClose}>Back to receipt</Button>
    </DialogContent>
  </Dialog>;
  return <TripRoleEditDialog key={trip.id} trip={trip} sitesList={sitesList}
    vendors={vendors.data ?? []} equipment={equipment.data ?? []}
    vendorsLoading={vendors.isLoading} vendorsError={vendors.isError}
    onRetryVendors={() => void vendors.refetch()} onClose={onClose} onSaved={onSaved} />;
}
