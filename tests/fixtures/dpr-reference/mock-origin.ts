export function useOrigin() {
  return {
    origin: "field",
    appendOrigin: (path: string) => path,
    getBackLink: (fallback: string) => fallback,
    getPlantBackLink: () => "/plant",
  };
}