import { format, subDays } from "date-fns";
import type { ComparisonInput } from "../../../server/dieselComparisonEquipment";

export const diesel05Today = format(new Date(), "yyyy-MM-dd");
const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
// Isolated API fixture only. No production records are read or changed.
export const diesel05Sources: ComparisonInput = {
  masters: [
    { id: 1701, name: "Fixture Excavator", registrationNumber: "FX-01" },
    { id: 1702, name: "Fixture Roller", registrationNumber: "FX-02" },
    { id: 1703, name: "Fixture Mixer", registrationNumber: "FX-03" },
    { id: 1704, name: "Fixture Loader", registrationNumber: "FX-04" },
  ],
  requirements: [
    { id: 1, date: diesel05Today, totalPlanned: 100, qtyPurchased: 100 },
    { id: 2, date: diesel05Today, totalPlanned: 30, qtyPurchased: 0 },
    { id: 3, date: diesel05Today, totalPlanned: 5, qtyPurchased: 5 },
    { id: 4, date: diesel05Today, totalPlanned: 20, qtyPurchased: 20 },
    { id: 5, date: yesterday, totalPlanned: 60, qtyPurchased: 60 },
  ],
  items: [
    { requirementId: 1, equipmentId: 1701, equipmentName: "Fixture Excavator", plannedQty: 100 },
    { requirementId: 2, equipmentId: 1702, equipmentName: "Fixture Roller", plannedQty: 30 },
    { requirementId: 3, equipmentId: 1703, equipmentName: "Fixture Mixer", plannedQty: 5 },
    { requirementId: 4, equipmentId: 1704, equipmentName: "Fixture Loader", plannedQty: 20 },
    { requirementId: 5, equipmentId: 1701, equipmentName: "Fixture Excavator", plannedQty: 30 },
    { requirementId: 5, equipmentId: 1702, equipmentName: "Fixture Roller", plannedQty: 30 },
  ],
  usage: [
    { date: diesel05Today, equipmentId: 1701, dieselIssued: 20 },
    { date: diesel05Today, equipmentId: 1704, dieselIssued: 20 },
    { date: yesterday, equipmentId: 1702, dieselIssued: 35 },
  ],
  logs: [{ date: diesel05Today, equipmentId: null, machine: " fixture mixer ", diesel: 0 }],
  dateWise: [
    { date: diesel05Today, planned: 155, purchased: 125, actual: 40 },
    { date: yesterday, planned: 60, purchased: 60, actual: 35 },
  ],
};