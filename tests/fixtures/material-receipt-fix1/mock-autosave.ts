export function useAutosave<T>(_options: {
  formKey: string;
  data: T;
  enabled: boolean;
  onRestore: (data: T) => void;
}) {
  return {
    hasDraft: false,
    draftAge: null,
    lastSavedAt: null,
    isDirty: false,
    restoreDraft: () => undefined,
    discardDraft: async () => undefined,
    clearDraft: async () => undefined,
  };
}