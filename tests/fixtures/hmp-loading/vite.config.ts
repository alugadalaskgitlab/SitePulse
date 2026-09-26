import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  root,
  cacheDir: path.resolve(root, "../../../node_modules/.vite-hmp-loading"),
  plugins: [react()],
  resolve: { alias: {
    "@": path.resolve(root, "../../../client/src"),
    "@shared": path.resolve(root, "../../../shared"),
    "@assets": path.resolve(root, "../../../attached_assets"),
  } },
  server: { fs: { allow: [path.resolve(root, "../../..")] } },
});