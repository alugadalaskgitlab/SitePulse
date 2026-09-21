import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const fixtureRoot = path.resolve(import.meta.dirname);
const clientRoot = path.resolve(fixtureRoot, "../../../client/src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@shared", replacement: path.resolve(fixtureRoot, "../../../shared") },
      { find: "@", replacement: clientRoot },
    ],
  },
  root: fixtureRoot,
  server: {
    port: 4192,
    strictPort: true,
    fs: { strict: true },
  },
});