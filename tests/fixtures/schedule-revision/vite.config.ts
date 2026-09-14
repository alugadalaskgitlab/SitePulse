import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);
const clientRoot = path.resolve(fixtureRoot, "../../../client/src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": clientRoot,
      "@shared": path.resolve(fixtureRoot, "../../../shared"),
      "@assets": path.resolve(fixtureRoot, "../../../attached_assets"),
    },
  },
  root: fixtureRoot,
  server: {
    fs: { strict: true },
  },
});