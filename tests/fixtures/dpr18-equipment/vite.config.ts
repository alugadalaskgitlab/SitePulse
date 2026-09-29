import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  cacheDir: path.resolve(fixtureRoot, "../../../.cache/dpr18-equipment-vite"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@shared", replacement: path.resolve(fixtureRoot, "../../../shared") },
      { find: "@assets", replacement: path.resolve(fixtureRoot, "../../../attached_assets") },
      { find: "@", replacement: path.resolve(fixtureRoot, "../../../client/src") },
    ],
  },
  root: fixtureRoot,
  server: { fs: { strict: true } },
});