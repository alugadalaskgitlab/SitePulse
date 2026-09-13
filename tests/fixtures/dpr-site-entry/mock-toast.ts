export function useToast() {
  return {
    toast: (message: unknown) => {
      const fixture = (window as Window & { __DprSiteFixture?: { toasts: unknown[] } }).__DprSiteFixture;
      fixture?.toasts.push(message);
    },
  };
}