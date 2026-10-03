import { mergeConfig, defineConfig } from "vitest/config";
import base from "./vitest.config";
export default mergeConfig(base, defineConfig({
  test: { setupFiles: ["./tests/boqLink01ReadinessParity.setup.ts"] },
}));