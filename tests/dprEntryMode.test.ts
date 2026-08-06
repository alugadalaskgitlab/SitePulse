/**
 * Guided-DPR-as-default: getDprEntryMode()/roadDprHref() behaviour.
 *
 * Pre-deployment instruction — preference is remembered PER USER:
 * - No stored preference → Guided (the default for every DPR-authorised user).
 * - Explicit "detailed" (deliberate switch to Classic) is honoured for that
 *   user only; another user on the same device still defaults to Guided.
 * - Legacy device-wide key migrates once to the first bound user, then is removed.
 * - localStorage unavailable → Guided, and setDprEntryMode does not throw.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  getDprEntryMode,
  setDprEntryMode,
  roadDprHref,
  bindDprEntryModeUser,
} from "../client/src/lib/dprEntryMode";

const LEGACY_KEY = "sitelog.dprEntryMode";
const keyFor = (id: number) => `sitelog.dprEntryMode.u${id}`;

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

describe("dprEntryMode — guided default, per-user preference", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installLocalStorage();
    bindDprEntryModeUser(null);
  });
  afterAll(() => {
    delete (globalThis as any).localStorage;
  });

  it("no stored preference routes New DPR to Guided", () => {
    bindDprEntryModeUser(7);
    expect(getDprEntryMode()).toBe("guided");
    expect(roadDprHref()).toBe("/site/guided");
    expect(roadDprHref("/site")).toBe("/site/guided?returnTo=%2Fsite");
  });

  it("no bound user (logged out) still defaults to Guided", () => {
    expect(getDprEntryMode()).toBe("guided");
    expect(roadDprHref()).toBe("/site/guided");
  });

  it("an explicit 'detailed' choice routes that user to Classic", () => {
    bindDprEntryModeUser(7);
    store.set(keyFor(7), "detailed");
    expect(getDprEntryMode()).toBe("detailed");
    expect(roadDprHref()).toBe("/site/new?type=road");
    expect(roadDprHref("/")).toBe("/site/new?type=road&returnTo=%2F");
  });

  it("preference is per user — another user on the same device stays Guided", () => {
    bindDprEntryModeUser(7);
    setDprEntryMode("detailed");
    expect(getDprEntryMode()).toBe("detailed");

    bindDprEntryModeUser(8);
    expect(getDprEntryMode()).toBe("guided");
    expect(store.get(keyFor(7))).toBe("detailed"); // untouched

    bindDprEntryModeUser(7);
    expect(getDprEntryMode()).toBe("detailed"); // remembered across re-login
  });

  it("an unknown/corrupt stored value falls back to Guided", () => {
    bindDprEntryModeUser(7);
    store.set(keyFor(7), "banana");
    expect(getDprEntryMode()).toBe("guided");
  });

  it("switching views persists for the bound user, both directions", () => {
    bindDprEntryModeUser(9);
    setDprEntryMode("detailed");
    expect(store.get(keyFor(9))).toBe("detailed");
    expect(getDprEntryMode()).toBe("detailed");

    setDprEntryMode("guided");
    expect(store.get(keyFor(9))).toBe("guided");
    expect(getDprEntryMode()).toBe("guided");
  });

  it("setDprEntryMode without a bound user is a no-op (nothing leaks device-wide)", () => {
    setDprEntryMode("detailed");
    expect(store.size).toBe(0);
    expect(getDprEntryMode()).toBe("guided");
  });

  it("legacy device-wide 'detailed' migrates once to the first bound user, key removed", () => {
    store.set(LEGACY_KEY, "detailed");
    bindDprEntryModeUser(7);
    expect(store.has(LEGACY_KEY)).toBe(false);
    expect(store.get(keyFor(7))).toBe("detailed");
    expect(getDprEntryMode()).toBe("detailed");

    // A second user later on the same device is NOT affected.
    bindDprEntryModeUser(8);
    expect(getDprEntryMode()).toBe("guided");
  });

  it("legacy 'guided' value is simply discarded (guided is the default anyway)", () => {
    store.set(LEGACY_KEY, "guided");
    bindDprEntryModeUser(7);
    expect(store.has(LEGACY_KEY)).toBe(false);
    expect(store.has(keyFor(7))).toBe(false);
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
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => bindDprEntryModeUser(7)).not.toThrow();
    expect(getDprEntryMode()).toBe("guided");
    expect(() => setDprEntryMode("detailed")).not.toThrow();
    expect(roadDprHref()).toBe("/site/guided");
  });
});
