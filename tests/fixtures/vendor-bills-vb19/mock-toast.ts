export function useToast() {
  return {
    toast: (message: { title?: string; description?: string }) => {
      const fixture = (window as Window & { __VB19Fixture?: { toastMessages?: unknown[] } }).__VB19Fixture;
      fixture?.toastMessages?.push(message);
    },
  };
}