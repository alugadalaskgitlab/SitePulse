import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "node", include: ["client/src/__tests__/uxFix01Frontend.test.tsx"] },
  resolve: { alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") } },
});