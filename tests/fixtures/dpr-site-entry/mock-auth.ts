export function useAuth() {
  // DPR-07 browser evidence explicitly exercises both authenticated roles.
  // The route flag only chooses this fixture's synthetic identity; production
  // SiteEdit still receives the normal authenticated-user object.
  const role = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role")
    : null;
  const isAdmin = role !== "manager";
  return {
    isAdmin,
    sectionCan: () => true,
    sectionVisible: () => true,
    canApprove: () => true,
    isAuthenticated: true,
    isLoading: false,
    isOwner: true,
    isManager: !isAdmin,
    isFieldEngineer: true,
    canManagePermissions: true,
    permissionManagerScope: "full" as const,
    user: {
      id: 606,
      email: "dpr-fixture@example.invalid",
      fullName: isAdmin ? "DPR Fixture Admin" : "DPR Fixture Manager",
      isAdmin,
      isOwner: isAdmin,
      isActive: true,
      isFieldEngineer: !isAdmin,
      sessionPolicy: "sticky" as const,
      canManagePermissions: true,
      permissionManagerScope: "full" as const,
    },
    permissions: {},
    refresh: async () => undefined,
    logout: async () => undefined,
  };
}