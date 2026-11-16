// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SnlNormResultCard } from "./BoqItemRecipes";

describe("Map to Norm result descriptions", () => {
  it("exposes the full description on hover and expands it in place", () => {
    const description = "Full workbook description including all work method, material, and location wording.";
    render(
      <SnlNormResultCard
        item={{
          id: 12,
          itemCode: "4.12",
          shortLabel: "Wet mix macadam",
          description,
          unit: "cum",
          workCategory: "ROAD",
          sourceName: "MoRTH",
          sourceCode: "MORTH_SDB_2019",
          shiftOutput: null,
          outputUnit: null,
          hasGradingVariants: false,
          isMixSpecific: false,
        }}
        selected={false}
        onSelect={() => {}}
      />,
    );

    const title = screen.getByText("Wet mix macadam");
    expect(title.getAttribute("title")).toBe(description);
    fireEvent.click(screen.getByRole("button", { name: "Show more for 4.12" }));
    expect(screen.getByText(description)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show less for 4.12" })).toBeTruthy();
  });
});
