import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = path.resolve(import.meta.dirname);
export default defineConfig({
  root,
  cacheDir: path.resolve(root, "../../../.cache/dpr17-materials-vite"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/lib/auth-context", replacement: path.resolve(root, "../dpr-site-report/mock-auth.ts") },
      { find: "@/lib/featureFlags", replacement: path.resolve(root, "../dpr-site-report/mock-feature-flags.ts") },
      { find: "@/hooks/use-origin", replacement: path.resolve(root, "../dpr-site-report/mock-origin.ts") },
      { find: "@/hooks/use-toast", replacement: path.resolve(root, "../dpr-site-report/mock-toast.ts") },
      { find: "@shared", replacement: path.resolve(root, "../../../shared") },
      { find: "@assets", replacement: path.resolve(root, "../../../attached_assets") },
      { find: "@", replacement: path.resolve(root, "../../../client/src") },
    ],
  },
  server: { fs: { strict: true } },
});