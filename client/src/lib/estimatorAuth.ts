export const ESTIMATOR_COOKIE = 'hlc_est_role';

export function readEstimatorRole(): 'admin' | 'manager' | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const c of cookies) {
    const trimmed = c.trim();
    if (trimmed.startsWith(ESTIMATOR_COOKIE + '=')) {
      const val = decodeURIComponent(trimmed.slice(ESTIMATOR_COOKIE.length + 1));
      const role = val.split('.')[0];
      if (role === 'admin' || role === 'manager') return role as 'admin' | 'manager';
    }
  }
  return null;
}

export function requireEstimatorAuth(returnTo?: string): 'admin' | 'manager' {
  const role = readEstimatorRole();
  if (!role) {
    const rt = returnTo || (window.location.pathname + window.location.search);
    window.location.href = `/estimator-login?returnTo=${encodeURIComponent(rt)}`;
    throw new Error('Not authenticated');
  }
  return role;
}

export async function signOutEstimator() {
  try {
    await fetch('/api/estimator/session', { method: 'DELETE', credentials: 'include' });
  } catch {}
  document.cookie = `${ESTIMATOR_COOKIE}=; path=/; max-age=0`;
}
