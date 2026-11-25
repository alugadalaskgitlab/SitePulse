export function useAuth() {
  return {
    user: { id: 9001, isOwner: false },
    sectionCan: (_section: string, action: string) => action === "view_reports" || ["view", "create", "edit", "delete"].includes(action),
    sectionVisible: () => true,
  };
}
