export const DISPATCH_WAITING_POLL_MS = 10_000;
export const DISPATCH_RECENT_ACTION_WINDOW_MS = 60_000;

export function dispatchRefetchInterval(input: {
  hasVisibleWaitingDispatch: boolean;
  lastActionAt: number;
  now: number;
}): number | false {
  if (input.hasVisibleWaitingDispatch) return DISPATCH_WAITING_POLL_MS;
  if (input.lastActionAt > 0 && input.now - input.lastActionAt < DISPATCH_RECENT_ACTION_WINDOW_MS) {
    return DISPATCH_WAITING_POLL_MS;
  }
  return false;
}
