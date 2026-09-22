export function useToast() {
  return { toast: (message: { title?: string; description?: string }) => {
    const output = document.getElementById("fixture-toast");
    if (output) output.textContent = `${message.title || ""} ${message.description || ""}`;
  } };
}