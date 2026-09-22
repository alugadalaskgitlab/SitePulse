import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);
const clientRoot = path.resolve(fixtureRoot, "../../../client/src");
const sharedMocks = path.resolve(fixtureRoot, "../dpr-site-entry");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/lib/auth-context", replacement: path.resolve(sharedMocks, "mock-auth.ts") },
      { find: "@/lib/featureFlags", replacement: path.resolve(sharedMocks, "mock-feature-flags.ts") },
      { find: "@/hooks/use-origin", replacement: path.resolve(fixtureRoot, "mock-origin.ts") },
      { find: "@/hooks/use-toast", replacement: path.resolve(sharedMocks, "mock-toast.ts") },
      { find: "@shared", replacement: path.resolve(fixtureRoot, "../../../shared") },
      { find: "@assets", replacement: path.resolve(fixtureRoot, "../../../attached_assets") },
      { find: "@", replacement: clientRoot },
    ],
  },
  root: fixtureRoot,
  server: { port: 4193, strictPort: true, fs: { strict: true } },
});