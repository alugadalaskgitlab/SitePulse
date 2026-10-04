import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";

export default defineConfig({
  ...base,
  test: { ...base.test, include: ["client/src/__tests__/dprManagement.test.tsx", "client/src/__tests__/dprEquipmentReadOnly.test.tsx"] },
});