import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    // PGlite fixtures and full route imports are memory-heavy. Unbounded
    // parallel workers can time out setup and report runnable tests as skipped.
    maxWorkers: 2,
    hookTimeout: 60_000,
    include: [
      "tests/**/*.test.ts", "tests/**/*.test.tsx",
      "client/src/**/*.test.ts", "client/src/**/*.test.tsx",
    ],
    exclude: [".cache/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
});
