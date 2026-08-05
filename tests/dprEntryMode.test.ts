/**
 * Guided-DPR-as-default: getDprEntryMode()/roadDprHref() behaviour.
 *
 * - No stored preference → Guided (the new default).
 * - Explicit "detailed" (deliberate switch to Classic) is honoured, never overridden.
 * - Explicit "guided" unaffected.
 * - Switching persists per device via setDprEntryMode, both directions.
 * - localStorage unavailable → Guided, and setDprEntryMode does not throw.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  getDprEntryMode,
  setDprEntryMode,
  roadDprHref,
} from "../client/src/lib/dprEntryMode";

const KEY = "sitelog.dprEntryMode";

function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

describe("dprEntryMode default flip", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installLocalStorage();
  });
  afterAll(() => {
    delete (globalThis as any).localStorage;
  });

  it("no stored preference routes New DPR to Guided", () => {
    expect(getDprEntryMode()).toBe("guided");
    expect(roadDprHref()).toBe("/site/guided");
    expect(roadDprHref("/site")).toBe("/site/guided?returnTo=%2Fsite");
  });

  it("an existing explicit 'detailed' choice still routes to Classic", () => {
    store.set(KEY, "detailed");
    expect(getDprEntryMode()).toBe("detailed");
    expect(roadDprHref()).toBe("/site/new?type=road");
    expect(roadDprHref("/")).toBe("/site/new?type=road&returnTo=%2F");
  });

  it("an existing explicit 'guided' choice is unaffected", () => {
    store.set(KEY, "guided");
    expect(getDprEntryMode()).toBe("guided");
    expect(roadDprHref()).toBe("/site/guided");
  });

  it("an unknown/corrupt stored value falls back to Guided", () => {
    store.set(KEY, "banana");
    expect(getDprEntryMode()).toBe("guided");
  });

  it("switching views persists per device, both directions", () => {
    setDprEntryMode("detailed");
    expect(store.get(KEY)).toBe("detailed");
    expect(getDprEntryMode()).toBe("detailed");

    setDprEntryMode("guided");
    expect(store.get(KEY)).toBe("guided");
    expect(getDprEntryMode()).toBe("guided");
  });

  it("localStorage unavailable → Guided default, setters don't throw", () => {
    (globalThis as any).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(getDprEntryMode()).toBe("guided");
    expect(() => setDprEntryMode("detailed")).not.toThrow();
    expect(roadDprHref()).toBe("/site/guided");
  });
});
