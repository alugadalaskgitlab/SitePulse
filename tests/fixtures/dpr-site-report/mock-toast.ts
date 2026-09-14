export function useToast() {
  return {
    toast: (message: unknown) => {
      const fixture = (window as Window & {
        __DprSiteReportFixture?: { toasts: unknown[] };
      }).__DprSiteReportFixture;
      fixture?.toasts.push(message);
    },
  };
}