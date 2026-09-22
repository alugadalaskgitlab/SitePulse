export function useToast() {
  return {
    toast: ({ title, description, variant }: any) => {
      const node = document.getElementById("vb23b-toast");
      if (node) node.textContent = [variant, title, description].filter(Boolean).join(": ");
    },
  };
}