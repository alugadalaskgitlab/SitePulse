/** Saved store identity outranks descriptions (which may be renamed). */
export function linkedPiStoreStock(item: any, stores: any[]) {
  if (item.storeItemId == null) return null;
  if (item.storeItemId === -1) return { liveStockQty: null, liveStoreItemName: null, liveStockNote: "Multiple linked Store items; stock requires review" };
  const store = stores.find(s => s.id === item.storeItemId);
  if (!store) return { liveStockQty: null, liveStoreItemName: null, liveStockNote: "Linked Store item not found" };
  const unit = (s: string) => (s ?? "").trim().toLowerCase().replace(/\.$/, "").replace(/^(nos|numbers|number|pieces|pcs|pc|no)$/, "each");
  if (unit(store.uom) !== unit(item.uom)) return {
    liveStockQty: null, liveStoreItemName: store.name,
    liveStockNote: `Store balance ${Number(store.balance)} ${store.uom}; PI unit ${item.uom} requires conversion`,
  };
  return { liveStockQty: Number(store.balance), liveStoreItemName: store.name, liveStockNote: null };
}
