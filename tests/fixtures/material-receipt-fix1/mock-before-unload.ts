export function useBeforeUnload(_isDirty: boolean) {
  return { confirmLeave: (callback: () => void) => callback() };
}