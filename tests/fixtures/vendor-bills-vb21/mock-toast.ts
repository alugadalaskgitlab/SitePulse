export function useToast() {
  return {
    toast: (message: { title?: string; description?: string; variant?: string }) => {
      window.__VB21Fixture?.toastMessages.push(message);
    },
  };
}