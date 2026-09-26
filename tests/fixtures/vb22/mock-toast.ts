import { useToast as useProductionToast } from "../../../client/src/hooks/use-toast";

export function useToast() {
  const production = useProductionToast();
  return {
    ...production,
    toast: (message: { title?: string; description?: string; variant?: string }) => {
      window.__VB22Fixture?.toastMessages.push(message);
      window.dispatchEvent(new CustomEvent("fixture-toast", { detail: {
        ...message,
        time: performance.now(),
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
      } }));
      if (new URLSearchParams(window.location.search).get("scenario") === "draft-rates") {
        production.toast({ ...message, variant: message.variant === "destructive" ? "destructive" : "default" });
      }
    },
  };
}