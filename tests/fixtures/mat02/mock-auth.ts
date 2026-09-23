export function useAuth() {
  return {
    isAdmin: true,
    isOwner: true,
    isAuthenticated: true,
    isLoading: false,
    sectionCan: () => true,
    sectionVisible: () => true,
    canApprove: () => true,
    canManagePermissions: true,
    permissionManagerScope: "full" as const,
    user: {
      id: 1302,
      email: "mat02-fixture@example.invalid",
      fullName: "MAT-02 Fixture Reviewer",
      isAdmin: true,
      isOwner: true,
      isActive: true,
    },
    permissions: {},
    refresh: async () => undefined,
    logout: async () => undefined,
  };
}