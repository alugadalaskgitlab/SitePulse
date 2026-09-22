export function useToast() {
  return {
    toast: (message: { title?: string; description?: string; variant?: string }) => {
      window.__PI02Fixture?.toasts.push(message);
    },
  };
}