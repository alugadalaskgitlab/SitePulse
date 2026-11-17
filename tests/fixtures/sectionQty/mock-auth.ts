export function useAuth() {
  return {
    user: { id: 7001, isOwner: true },
    permissions: {
      boq_item_sections: { view: true, edit: true },
      qto_boq: { view: true, edit: true },
    },
    sectionCan: () => true,
  };
}
