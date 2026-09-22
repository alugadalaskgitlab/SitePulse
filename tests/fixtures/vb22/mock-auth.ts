export function useAuth() {
  return {
    isAdmin: true, sectionCan: () => true, sectionVisible: () => true,
    canApprove: () => true, isAuthenticated: true, isLoading: false,
    isOwner: true, isManager: false, isFieldEngineer: false,
    canManagePermissions: true, permissionManagerScope: "full" as const,
    user: {
      id: 2201, email: "vb22-fixture@example.invalid", fullName: "VB-22 Fixture Reviewer",
      isAdmin: true, isOwner: true, isActive: true, isFieldEngineer: false,
      sessionPolicy: "sticky" as const, canManagePermissions: true,
      permissionManagerScope: "full" as const,
    },
    permissions: {}, refresh: async () => undefined, logout: async () => undefined,
  };
}