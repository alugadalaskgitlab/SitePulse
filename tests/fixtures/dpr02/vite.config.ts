import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);
const clientRoot = path.resolve(fixtureRoot, "../../../client/src");
const sharedFixtureRoot = path.resolve(fixtureRoot, "../dpr-site-entry");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/lib/auth-context", replacement: path.resolve(sharedFixtureRoot, "mock-auth.ts") },
      { find: "@/lib/featureFlags", replacement: path.resolve(sharedFixtureRoot, "mock-feature-flags.ts") },
      { find: "@/hooks/use-origin", replacement: path.resolve(sharedFixtureRoot, "mock-origin.ts") },
      { find: "@/hooks/use-toast", replacement: path.resolve(sharedFixtureRoot, "mock-toast.ts") },
      { find: "@shared", replacement: path.resolve(fixtureRoot, "../../../shared") },
      { find: "@assets", replacement: path.resolve(fixtureRoot, "../../../attached_assets") },
      { find: "@", replacement: clientRoot },
    ],
  },
  root: fixtureRoot,
  server: {
    fs: { strict: true },
  },
});