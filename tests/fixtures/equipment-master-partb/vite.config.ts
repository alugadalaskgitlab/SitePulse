import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);
const workspaceRoot = path.resolve(fixtureRoot, "../../..");

export default defineConfig({
  cacheDir: path.resolve(workspaceRoot, ".cache/equipment-master-partb-vite"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@shared", replacement: path.resolve(workspaceRoot, "shared") },
      { find: "@assets", replacement: path.resolve(workspaceRoot, "attached_assets") },
      { find: "@", replacement: path.resolve(workspaceRoot, "client/src") },
    ],
  },
  root: fixtureRoot,
  server: { fs: { strict: true } },
});
