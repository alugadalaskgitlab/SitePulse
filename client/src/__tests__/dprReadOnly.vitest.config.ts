import { mergeConfig, defineConfig } from "vitest/config";
import baseConfig from "../../../vitest.config";

export default mergeConfig(baseConfig, defineConfig({
  test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "client/src/__tests__/**/*.test.tsx"] },
}));