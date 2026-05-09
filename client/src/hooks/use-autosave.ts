import { useState, useEffect, useCallback, useRef } from "react";
import { saveFormDraft, loadFormDraft, clearFormDraft, formatDraftAge } from "@/lib/autosave";
import { useToast } from "@/hooks/use-toast";

interface UseAutosaveOptions<T> {
  formKey: string;
  data: T;
  enabled?: boolean;
  debounceMs?: number;
  onRestore?: (data: T) => void;
}

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
  onRestore,
}: UseAutosaveOptions<T>): UseAutosaveReturn<T> {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftAge, setDraftAge] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [restoredData, setRestoredData] = useState<T | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>("");
  const hasRestoredRef = useRef(false);
  const initialDataRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    async function checkForDraft() {
      try {
        const draft = await loadFormDraft<T>(formKey);
        if (draft && !hasRestoredRef.current) {
          setRestoredData(draft.data);
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
  }, [formKey, data, enabled, debounceMs, isLoading, hasDraft]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden" && !hasDraft) {
        try {
          await saveFormDraft(formKey, data);
          lastSavedDataRef.current = JSON.stringify(data);
          setLastSavedAt(new Date());
        } catch (error) {
          console.error("Error saving on visibility change:", error);
        }
      }
    };

    const handleBeforeUnload = async () => {
      if (!hasDraft) {
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
  }, [formKey, data, enabled, hasDraft]);

  const restoreDraft = useCallback(() => {
    if (restoredData && onRestore) {
      onRestore(restoredData);
      hasRestoredRef.current = true;
      setHasDraft(false);
      setRestoredData(null);
      toast({
        title: "Draft restored",
        description: "Your previous work has been restored.",
      });
    }
  }, [restoredData, onRestore, toast]);

  const discardDraft = useCallback(async () => {
    try {
      await clearFormDraft(formKey);
      hasRestoredRef.current = true;
      setHasDraft(false);
      setRestoredData(null);
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
