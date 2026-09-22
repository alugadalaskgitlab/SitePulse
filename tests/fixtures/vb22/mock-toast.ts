export function useToast() {
  return {
    toast: (message: { title?: string; description?: string; variant?: string }) => {
      window.__VB22Fixture?.toastMessages.push(message);
    },
  };
}