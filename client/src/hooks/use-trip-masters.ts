import { useQuery } from "@tanstack/react-query";
import type { EquipmentMasterType } from "@shared/schema";
import type { TripEquipmentOption } from "@/components/trip-link-utils";

export function useTripEquipmentMasters() {
  const master = useQuery<EquipmentMasterType[]>({ queryKey: ["/api/plant-module/equipment"] });
  const owners = useQuery<TripEquipmentOption[]>({ queryKey: ["/api/site-material-trips/hired-vehicle-options"] });
  return { master, owners };
}
