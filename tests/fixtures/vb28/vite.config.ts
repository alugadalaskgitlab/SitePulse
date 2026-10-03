import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  plugins: [react()],
  root,
  resolve: { alias: [
    ...[
      ["@/lib/auth-context", "../vb22/mock-auth.ts"],
      ["@/lib/featureFlags", "../vb22/mock-feature-flags.ts"],
      ["@/hooks/use-origin", "../vb22/mock-origin.ts"],
      ["@/hooks/use-persisted-filters", "../vb22/mock-persisted-filters.ts"],
      ["@/hooks/use-toast", "../vb22/mock-toast.ts"],
      ["@shared", "../../../shared"],
      ["@assets", "../../../attached_assets"],
      ["@", "../../../client/src"],
    ].map(([find, target]) => ({ find, replacement: path.resolve(root, target) })),
  ] },
});