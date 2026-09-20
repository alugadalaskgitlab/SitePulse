export function useToast() {
  return {
    toast: (message: { title?: string; description?: string; variant?: string }) => {
      window.__VB20Fixture?.toastMessages.push(message);
      window.dispatchEvent(new CustomEvent("vb20-toast", { detail: message }));
    },
  };
}