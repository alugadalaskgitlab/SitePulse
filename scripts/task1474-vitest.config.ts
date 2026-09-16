import baseConfig from "../vitest.config";

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["scripts/task1474-real-regression.test.ts"],
  },
};