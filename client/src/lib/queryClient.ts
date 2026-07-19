import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Routes that handle their own 401s — never auto-redirect from these.
// Estimator-portal pages (/admin/mix-*) are included so a stale or missing
// main-app session doesn't send estimator users to the main-app /login page;
// the component-level auth guard redirects them to /estimator-login instead.
const AUTH_BYPASS_PATHS = [
  "/login",
  "/estimator-login",
  "/estimator-hub",
  "/concrete-calculator",
  "/admin/mix-impact",
  "/admin/scenario-comparison",
  "/admin/mix-estimates",
  "/admin/mix-comparison",
];

function shouldRedirectOn401(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return !AUTH_BYPASS_PATHS.some((b) => p === b || p.startsWith(b + "/"));
}

function maybeRedirectToLogin() {
  if (!shouldRedirectOn401()) return;
  // Avoid redirect storm — only redirect if not already navigating.
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      maybeRedirectToLogin();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") return null;
      maybeRedirectToLogin();
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const NO_PERMISSION_DESCRIPTION =
  "You don't have permission to edit/delete this item. Contact an administrator.";

export const NO_CREATE_PERMISSION_DESCRIPTION =
  "You don't have permission to create this item. Contact an administrator.";

export function isForbiddenError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("403");
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,  // disabled: on mobile, tab-switching fires this constantly; staleTime + refetchOnMount is sufficient
      refetchOnMount: true,         // refresh on every page open / navigation
      refetchOnReconnect: true,
      staleTime: 2 * 60_000,        // treat data as fresh for 2 min — was 15s (too aggressive on mobile)
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
