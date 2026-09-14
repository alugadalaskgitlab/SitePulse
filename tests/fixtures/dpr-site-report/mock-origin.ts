export function useOrigin() {
  return {
    origin: "field",
    appendOrigin: (path: string) => path,
    getPlantBackLink: () => "/plant",
  };
}