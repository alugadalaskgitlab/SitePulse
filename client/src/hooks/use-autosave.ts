import { useState, useEffect, useCallback, useRef } from "react";
import {
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  formatDraftAge,
  type AutosaveData,
} from "@/lib/autosave";
import { useToast } from "@/hooks/use-toast";

interface UseAutosaveOptions<T> {
  formKey: string;
  data: T;
  enabled?: boolean;
  debounceMs?: number;
  /** Existing server-backed forms should not create a browser draft until edited. */
  saveInitialData?: boolean;
  onRestore?: (data: T, metadata: AutosaveMetadata) => void;
  validateRestore?: (data: T, metadata: AutosaveMetadata) => boolean;
}

type AutosaveMetadata = Pick<AutosaveData, "savedAt" | "formKey" | "version">;

interface UseAutosaveReturn<T> {
  isLoading: boolean;
  hasDraft: boolean;
  draftAge: string | null;
  lastSavedAt: Date | null;
  isDirty: boolean;
  restoreDraft: () => void;
  discardDraft: () => void;
  clearDraft: () => Promise<void>;
}

export function useAutosave<T>({
  formKey,
  data,
  enabled = true,
  debounceMs = 1000,
  saveInitialData = true,
  onRestore,
  validateRestore,
}: UseAutosaveOptions<T>): UseAutosaveReturn<T> {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftAge, setDraftAge] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [restoredData, setRestoredData] = useState<T | null>(null);
  const [restoredMetadata, setRestoredMetadata] = useState<AutosaveMetadata | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>("");
  const hasRestoredRef = useRef(false);
  const initialDataRef = useRef<string | null>(null);
  const validateRestoreRef = useRef(validateRestore);
  validateRestoreRef.current = validateRestore;

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    hasRestoredRef.current = false;
    initialDataRef.current = null;
    lastSavedDataRef.current = "";
    setHasDraft(false);
    setRestoredData(null);
    setRestoredMetadata(null);
    setDraftAge(null);
    setLastSavedAt(null);
  }, [formKey]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    async function checkForDraft() {
      try {
        const draft = await loadFormDraft<T>(formKey);
        if (draft && !hasRestoredRef.current) {
          const metadata = {
            savedAt: draft.savedAt,
            formKey: draft.formKey,
            version: draft.version,
          };
          if (validateRestoreRef.current && !validateRestoreRef.current(draft.data, metadata)) {
            await clearFormDraft(formKey);
            setHasDraft(false);
            setRestoredData(null);
            setRestoredMetadata(null);
            return;
          }
          setRestoredData(draft.data);
          setRestoredMetadata(metadata);
          setHasDraft(true);
          setDraftAge(formatDraftAge(draft.savedAt));
        }
      } catch (error) {
        console.error("Error loading draft:", error);
      } finally {
        setIsLoading(false);
      }
    }

    checkForDraft();
  }, [formKey, enabled]);

  useEffect(() => {
    if (!enabled || isLoading || hasDraft || lastSavedAt !== null) {
      if (!enabled) initialDataRef.current = null;
      setIsDirty(false);
      return;
    }

    const currentStr = JSON.stringify(data);

    if (initialDataRef.current === null) {
      initialDataRef.current = currentStr;
      setIsDirty(false);
      return;
    }

    setIsDirty(currentStr !== initialDataRef.current);
  }, [data, enabled, isLoading, hasDraft, lastSavedAt]);

  useEffect(() => {
    if (!enabled || isLoading || hasDraft) return;

    const currentDataStr = JSON.stringify(data);

    if (!saveInitialData && initialDataRef.current === currentDataStr) {
      if (lastSavedDataRef.current && lastSavedDataRef.current !== currentDataStr) {
        clearFormDraft(formKey).catch((error) => console.error("Error clearing reverted draft:", error));
        lastSavedDataRef.current = "";
        setLastSavedAt(null);
      }
      return;
    }
    
    if (currentDataStr === lastSavedDataRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveFormDraft(formKey, data);
        lastSavedDataRef.current = currentDataStr;
        setLastSavedAt(new Date());
      } catch (error) {
        console.error("Error saving draft:", error);
      }
    }, debounceMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formKey, data, enabled, debounceMs, isLoading, hasDraft, saveInitialData]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden" && !hasDraft) {
        const currentData = JSON.stringify(data);
        if (!saveInitialData && initialDataRef.current === currentData) return;
        try {
          await saveFormDraft(formKey, data);
          lastSavedDataRef.current = currentData;
          setLastSavedAt(new Date());
        } catch (error) {
          console.error("Error saving on visibility change:", error);
        }
      }
    };

    const handleBeforeUnload = async () => {
      if (!hasDraft) {
        if (!saveInitialData && initialDataRef.current === JSON.stringify(data)) return;
        try {
          await saveFormDraft(formKey, data);
        } catch (error) {
          console.error("Error saving before unload:", error);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [formKey, data, enabled, hasDraft, saveInitialData]);

  const restoreDraft = useCallback(() => {
    if (restoredData && restoredMetadata && onRestore) {
      onRestore(restoredData, restoredMetadata);
      hasRestoredRef.current = true;
      setHasDraft(false);
      setRestoredData(null);
      setRestoredMetadata(null);
      toast({
        title: "Draft restored",
        description: "Your previous work has been restored.",
      });
    }
  }, [restoredData, restoredMetadata, onRestore, toast]);

  const discardDraft = useCallback(async () => {
    try {
      await clearFormDraft(formKey);
      hasRestoredRef.current = true;
      setHasDraft(false);
      setRestoredData(null);
      setRestoredMetadata(null);
      toast({
        title: "Draft discarded",
        description: "Starting with a fresh form.",
      });
    } catch (error) {
      console.error("Error discarding draft:", error);
    }
  }, [formKey, toast]);

  const clearDraft = useCallback(async () => {
    try {
      await clearFormDraft(formKey);
      lastSavedDataRef.current = "";
      setHasDraft(false);
      setRestoredData(null);
      setRestoredMetadata(null);
      setLastSavedAt(null);
    } catch (error) {
      console.error("Error clearing draft:", error);
    }
  }, [formKey]);

  return {
    isLoading,
    hasDraft,
    draftAge,
    lastSavedAt,
    isDirty,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
