/**
 * Field Home as the universal default landing page — workspaceMode behaviour.
 *
 * Instruction: which landing page a user sees must NOT depend on role
 * (the old `!isAdmin && isFieldEngineer` rule in Home.tsx). Field Home is the
 * default for every user with no saved preference; a deliberate switch to the
 * Classic Dashboard is remembered PER USER, never device-wide.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  getWorkspaceMode,
  setWorkspaceMode,
  bindWorkspaceModeUser,
} from "../client/src/lib/workspaceMode";

const keyFor = (id: number) => `sitelog.workspaceMode.u${id}`;

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

describe("workspaceMode — Field Home default, per-user preference", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installLocalStorage();
    bindWorkspaceModeUser(null);
  });
  afterAll(() => {
    delete (globalThis as any).localStorage;
  });

  it("any user with no saved preference lands on Field Home (admin, PM alike — role is irrelevant here)", () => {
    bindWorkspaceModeUser(1); // e.g. the admin
    expect(getWorkspaceMode()).toBe("field");
    bindWorkspaceModeUser(42); // e.g. a PM who is not a field engineer
    expect(getWorkspaceMode()).toBe("field");
  });

  it("no bound user (logged out) still defaults to Field Home", () => {
    expect(getWorkspaceMode()).toBe("field");
  });

  it("a deliberate switch to Classic is remembered for the next login", () => {
    bindWorkspaceModeUser(7);
    setWorkspaceMode("classic");
    // simulate logout/login
    bindWorkspaceModeUser(null);
    bindWorkspaceModeUser(7);
    expect(getWorkspaceMode()).toBe("classic");
  });

  it("switching back to Field Home is remembered the same way", () => {
    bindWorkspaceModeUser(7);
    setWorkspaceMode("classic");
    setWorkspaceMode("field");
    expect(store.get(keyFor(7))).toBe("field");
    bindWorkspaceModeUser(null);
    bindWorkspaceModeUser(7);
    expect(getWorkspaceMode()).toBe("field");
  });

  it("a second user on the same device is unaffected by the first user's choice", () => {
    bindWorkspaceModeUser(7);
    setWorkspaceMode("classic");
    bindWorkspaceModeUser(8);
    expect(getWorkspaceMode()).toBe("field");
    expect(store.get(keyFor(7))).toBe("classic"); // untouched
    bindWorkspaceModeUser(7);
    expect(getWorkspaceMode()).toBe("classic");
  });

  it("an unknown/corrupt stored value falls back to Field Home", () => {
    bindWorkspaceModeUser(7);
    store.set(keyFor(7), "banana");
    expect(getWorkspaceMode()).toBe("field");
  });

  it("setWorkspaceMode without a bound user is a no-op (nothing leaks device-wide)", () => {
    setWorkspaceMode("classic");
    expect(store.size).toBe(0);
    expect(getWorkspaceMode()).toBe("field");
  });

  it("explicit userId works before/without the auth-context binding (first-render path)", () => {
    // Home.tsx passes user.id directly — the bound id is only a fallback.
    setWorkspaceMode("classic", 7);
    expect(store.get(keyFor(7))).toBe("classic");
    expect(getWorkspaceMode(7)).toBe("classic");  // no bindWorkspaceModeUser call at all
    expect(getWorkspaceMode(8)).toBe("field");    // other user unaffected
    expect(getWorkspaceMode(null)).toBe("field"); // logged out → default
  });

  it("localStorage unavailable → Field Home default, setters don't throw", () => {
    (globalThis as any).localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => bindWorkspaceModeUser(7)).not.toThrow();
    expect(getWorkspaceMode()).toBe("field");
    expect(() => setWorkspaceMode("classic")).not.toThrow();
  });
});
