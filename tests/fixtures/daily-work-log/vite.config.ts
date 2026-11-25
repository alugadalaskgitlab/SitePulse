import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);
const clientRoot = path.resolve(fixtureRoot, "../../../client/src");

export default defineConfig({
  cacheDir: path.resolve(fixtureRoot, "../../../.cache/daily-work-log-vite"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/lib/auth-context", replacement: path.resolve(fixtureRoot, "mock-auth.ts") },
      { find: "@/lib/queryClient", replacement: path.resolve(fixtureRoot, "mock-query-client.ts") },
      { find: "@/hooks/use-upload", replacement: path.resolve(fixtureRoot, "mock-upload.ts") },
      { find: "@/components/AttachmentViewer", replacement: path.resolve(fixtureRoot, "mock-attachment-viewer.tsx") },
      { find: "@shared", replacement: path.resolve(fixtureRoot, "../../../shared") },
      { find: "@assets", replacement: path.resolve(fixtureRoot, "../../../attached_assets") },
      { find: "@", replacement: clientRoot },
    ],
  },
  root: fixtureRoot,
  server: { fs: { strict: true } },
});
