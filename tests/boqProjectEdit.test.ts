import { describe, expect, it } from "vitest";
import {
  boqProjectUpdateErrorMessage,
  prepareBoqProjectUpdate,
  PROGRAM_SETTINGS_START_DATE_MESSAGE,
} from "../client/src/lib/boqProjectEdit";

const form = {
  name: "UPGRADATION FROM ALLADURG PWD ROAD TO PAMPAD",
  contractNo: "",
  client: "",
  contractor: "",
  siteId: "",
  roadLengthKm: "",
  startDate: "2026-08-24",
  totalMonths: "3",
  status: "draft",
};

describe("BOQ Project edit payload", () => {
  it("saves ordinary changes without sending the protected startDate property", () => {
    const result = prepareBoqProjectUpdate("2026-08-24", form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.totalMonths).toBe(3);
    expect(result.payload).not.toHaveProperty("startDate");
  });

  it("blocks a changed start date before an API request can be made", () => {
    const result = prepareBoqProjectUpdate("2026-08-23", form);
    expect(result).toEqual({
      ok: false,
      message: PROGRAM_SETTINGS_START_DATE_MESSAGE,
    });
  });

  it("shows the server-provided message instead of swallowing it", () => {
    const error = new Error(`409: ${JSON.stringify({
      error: "PROJECT_START_SETTING_REQUIRED",
      message: PROGRAM_SETTINGS_START_DATE_MESSAGE,
    })}`);
    expect(boqProjectUpdateErrorMessage(error)).toBe(PROGRAM_SETTINGS_START_DATE_MESSAGE);
  });
});