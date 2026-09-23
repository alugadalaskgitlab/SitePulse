export function useToast() {
  return {
    toast: (message: { title?: string; description?: string; variant?: string }) => {
      window.dispatchEvent(new CustomEvent("mat02-toast", { detail: message }));
    },
  };
}