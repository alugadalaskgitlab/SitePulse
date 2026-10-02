import React from "react";
import { PurchaseIndentDeliveryPanel } from "../../../client/src/components/purchase-indent-delivery";
import SiteMaterialTrips from "../../../client/src/pages/SiteMaterialTrips";

const sites = [{ id: 11, name: "ALLADURG", isActive: true }];
const baseItem = {
  description: "WMM", qty: 1500, approvedQty: 1500, qtyPurchased: 1500,
  totalPurchasedQty: 1500, orderedQty: 1500, uom: "MT",
  purchaseStatus: "ordered", receivingLocation: "site", receivingSiteId: 11,
  deliveryEvidence: [], deliveryWarnings: [],
};
const scenarios = [
  { ...baseItem, id: 401, deliveredQty: 600 },
  { ...baseItem, id: 402, deliveredQty: 1500 },
  { ...baseItem, id: 403, deliveredQty: 1750 },
  { ...baseItem, id: 404, qty: 1.625, approvedQty: 1.625, qtyPurchased: 1.625, totalPurchasedQty: 1.625, orderedQty: 1.625, deliveredQty: 0.5 },
  { ...baseItem, id: 405, deliveredQty: 600, receivingLocation: "hmp_plant", receivingSiteId: null, materialId: 77 },
  { ...baseItem, id: 406, deliveredQty: 0, receivingLocation: null, receivingSiteId: null },
  { ...baseItem, id: 407, deliveredQty: 0, purchaseStatus: "pending", qtyPurchased: 0, totalPurchasedQty: 0, orderedQty: 0 },
];

// The production href performs a real browser navigation to this path. No
// quantity is calculated or injected by the fixture at the destination.
export default function B2Fixture() {
  if (window.location.pathname === "/site/material-trips") return <SiteMaterialTrips />;
  const refuseDestinationWrite = async () => { throw new Error("B2 fixture does not permit destination writes"); };
  return <main className="mx-auto max-w-3xl space-y-4 p-4" data-testid="b2-fixture-panels">
    <h1 className="text-xl font-semibold">B2 synthetic remaining-quantity scenarios</h1>
    {scenarios.map(item => <PurchaseIndentDeliveryPanel
      key={item.id} item={item} sites={sites} canEdit
      indentId={91} indentNo="SYNTHETIC/PI/0091" onSave={refuseDestinationWrite}
    />)}
    <PurchaseIndentDeliveryPanel item={{ ...baseItem, id: 408, deliveredQty: 600 }}
      sites={sites} canEdit={false} indentId={91} onSave={refuseDestinationWrite} />
    <PurchaseIndentDeliveryPanel item={{ ...baseItem, id: 409, deliveredQty: 600 }}
      sites={sites} canEdit onSave={refuseDestinationWrite} />
  </main>;
}