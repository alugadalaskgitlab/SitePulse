import { get, set, del, keys } from "idb-keyval";

export interface AutosaveData<T = unknown> {
  formKey: string;
  data: T;
  savedAt: number;
  version: number;
}

const AUTOSAVE_PREFIX = "autosave_";
const DEFAULT_TTL_DAYS = 7;
const CURRENT_VERSION = 1;

function getStorageKey(formKey: string): string {
  return `${AUTOSAVE_PREFIX}${formKey}`;
}

export async function saveFormDraft<T>(formKey: string, data: T): Promise<void> {
  const storageKey = getStorageKey(formKey);
  const autosaveData: AutosaveData<T> = {
    formKey,
    data,
    savedAt: Date.now(),
    version: CURRENT_VERSION,
  };
  
  try {
    await set(storageKey, autosaveData);
  } catch (error) {
    console.warn("Autosave failed, falling back to localStorage:", error);
    try {
      localStorage.setItem(storageKey, JSON.stringify(autosaveData));
    } catch (e) {
      console.error("Autosave localStorage fallback failed:", e);
    }
  }
}

export async function loadFormDraft<T>(formKey: string): Promise<AutosaveData<T> | null> {
  const storageKey = getStorageKey(formKey);
  
  try {
    const data = await get<AutosaveData<T>>(storageKey);
    
    if (data) {
      if (data.version !== CURRENT_VERSION) {
        await clearFormDraft(formKey);
        return null;
      }
      
      const ageInDays = (Date.now() - data.savedAt) / (1000 * 60 * 60 * 24);
      if (ageInDays > DEFAULT_TTL_DAYS) {
        return data;
      }
      
      return data;
    }
  } catch (error) {
    console.warn("IndexedDB load failed, trying localStorage:", error);
  }
  
  try {
    const localData = localStorage.getItem(storageKey);
    if (localData) {
      const parsed = JSON.parse(localData) as AutosaveData<T>;
      if (parsed.version === CURRENT_VERSION) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("LocalStorage fallback load failed:", e);
  }
  
  return null;
}

export async function clearFormDraft(formKey: string): Promise<void> {
  const storageKey = getStorageKey(formKey);
  
  try {
    await del(storageKey);
  } catch (error) {
    console.warn("IndexedDB delete failed:", error);
  }
  
  try {
    localStorage.removeItem(storageKey);
  } catch (e) {
    console.error("LocalStorage delete failed:", e);
  }
}

export async function getAllDraftKeys(): Promise<string[]> {
  try {
    const allKeys = await keys();
    return allKeys
      .filter((key): key is string => typeof key === "string" && key.startsWith(AUTOSAVE_PREFIX))
      .map((key) => key.replace(AUTOSAVE_PREFIX, ""));
  } catch (error) {
    console.warn("Failed to get draft keys:", error);
    return [];
  }
}

export async function cleanupOldDrafts(maxAgeDays: number = DEFAULT_TTL_DAYS): Promise<void> {
  try {
    const draftKeys = await getAllDraftKeys();
    const now = Date.now();
    
    for (const formKey of draftKeys) {
      const draft = await loadFormDraft(formKey);
      if (draft) {
        const ageInDays = (now - draft.savedAt) / (1000 * 60 * 60 * 24);
        if (ageInDays > maxAgeDays) {
          await clearFormDraft(formKey);
        }
      }
    }
  } catch (error) {
    console.error("Cleanup old drafts failed:", error);
  }
}

export function formatDraftAge(savedAt: number): string {
  const now = Date.now();
  const diffMs = now - savedAt;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}
