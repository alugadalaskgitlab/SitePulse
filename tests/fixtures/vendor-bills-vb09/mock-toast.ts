export function useToast() {
  return {
    toast: (input: { title?: unknown; description?: unknown }) => {
      const fixture = (window as Window & {
        __VB09Fixture?: { toastMessages?: Array<{ title: string; description?: string }> };
      }).__VB09Fixture;
      fixture?.toastMessages?.push({
        title: input.title == null ? "" : String(input.title),
        description: input.description == null ? undefined : String(input.description),
      });
      return { id: String(fixture?.toastMessages?.length || 0), dismiss: () => undefined, update: () => undefined };
    },
  };
}