import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const root = path.resolve(import.meta.dirname);
const previous = path.resolve(root, "../dpr-site-report");
export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: [
    { find: "@/lib/auth-context", replacement: path.join(previous, "mock-auth.ts") },
    { find: "@/lib/featureFlags", replacement: path.join(root, "mock-feature-flags.ts") },
    { find: "@/hooks/use-origin", replacement: path.join(previous, "mock-origin.ts") },
    { find: "@/hooks/use-toast", replacement: path.join(previous, "mock-toast.ts") },
    { find: "@before", replacement: path.join(root, "baseline") },
    { find: "@shared", replacement: path.resolve(root, "../../../shared") },
    { find: "@assets", replacement: path.resolve(root, "../../../attached_assets") },
    { find: "@", replacement: path.resolve(root, "../../../client/src") },
  ]},
  server: { fs: { strict: true } },
});