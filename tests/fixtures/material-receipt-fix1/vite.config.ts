import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);
const clientRoot = path.resolve(fixtureRoot, "../../../client/src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/lib/auth-context", replacement: path.resolve(fixtureRoot, "mock-auth.ts") },
      { find: "@/lib/featureFlags", replacement: path.resolve(fixtureRoot, "mock-feature-flags.ts") },
      { find: "@/hooks/use-origin", replacement: path.resolve(fixtureRoot, "mock-origin.ts") },
      { find: "@/hooks/use-persisted-filters", replacement: path.resolve(fixtureRoot, "mock-persisted-filters.ts") },
      { find: "@/hooks/use-toast", replacement: path.resolve(fixtureRoot, "mock-toast.ts") },
      { find: "@/hooks/use-autosave", replacement: path.resolve(fixtureRoot, "mock-autosave.ts") },
      { find: "@/hooks/use-before-unload", replacement: path.resolve(fixtureRoot, "mock-before-unload.ts") },
      { find: "@/hooks/use-upload", replacement: path.resolve(fixtureRoot, "mock-upload.ts") },
      { find: "@shared", replacement: path.resolve(fixtureRoot, "../../../shared") },
      { find: "@assets", replacement: path.resolve(fixtureRoot, "../../../attached_assets") },
      { find: "@", replacement: clientRoot },
    ],
  },
  root: fixtureRoot,
  server: { fs: { strict: true }, port: 4190, strictPort: true },
});