export function useAuth() {
  const partB = new URLSearchParams(window.location.search).has("partB");
  const role = new URLSearchParams(window.location.search).get("role") || "stores";
  return {
    isAdmin: !partB, sectionCan: (section: string, action: string) => !partB || (section === "site_procurement"
      ? ["view", "create", "edit"].includes(action)
      : section === "stores_inventory" ? role === "stores" : true),
    sectionVisible: () => true,
    canApprove: () => !partB || role === "pm", isAuthenticated: true, isLoading: false,
    isOwner: !partB, isManager: partB && role === "pm", isFieldEngineer: false,
    canManagePermissions: !partB, permissionManagerScope: partB ? "none" as const : "full" as const,
    user: {
      id: 102, email: "pi02-fixture@example.invalid", fullName: partB ? `Synthetic ${role.toUpperCase()} reviewer` : "PI-02 Fixture Reviewer",
      isAdmin: !partB, isOwner: !partB, isActive: true, isFieldEngineer: false,
      sessionPolicy: "sticky" as const, canManagePermissions: !partB,
      permissionManagerScope: partB ? "none" as const : "full" as const,
    },
    permissions: {}, refresh: async () => undefined, logout: async () => undefined,
  };
}