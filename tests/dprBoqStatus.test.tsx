// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DprBoqStatus } from "../client/src/components/DprBoqStatus";

const baseProps = {
  siteName: "Site A",
  siteId: 1,
  projects: [{ id: 11, name: "Project 11" }, { id: 22, name: "Project 22" }],
  projectId: 11,
  items: [{ id: 101 }],
  projectsLoading: false,
  projectsLoaded: true,
  projectsError: null,
  itemsLoading: false,
  itemsLoaded: true,
  itemsError: null,
  onRetry: vi.fn(),
};

afterEach(cleanup);

describe("DprBoqStatus", () => {
  it("renders an actionable project request failure instead of an empty BOQ", () => {
    const onRetry = vi.fn();
    render(
      <DprBoqStatus
        {...baseProps}
        projects={[]}
        projectsLoaded={false}
        projectsError={new Error("503")}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId("dpr-boq-error")).toHaveTextContent("could not be loaded");
    fireEvent.click(screen.getByTestId("dpr-boq-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("dpr-boq-empty")).not.toBeInTheDocument();
  });

  it("renders item request failure and keeps the selected project visible", () => {
    render(
      <DprBoqStatus
        {...baseProps}
        items={[]}
        itemsError={new Error("504")}
      />,
    );

    expect(screen.getByTestId("dpr-boq-project-name")).toHaveTextContent("Project 11");
    expect(screen.queryByTestId("dpr-boq-project-select")).not.toBeInTheDocument();
    expect(screen.getByTestId("dpr-boq-items-error")).toHaveTextContent("could not be loaded");
  });

  it("does not hide a retained saved project behind an empty project list", () => {
    render(
      <DprBoqStatus
        {...baseProps}
        projects={[]}
        projectId={99}
        items={[]}
        itemsError={new Error("project no longer accessible")}
      />,
    );

    expect(screen.queryByTestId("dpr-boq-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("dpr-boq-project-unavailable")).toHaveTextContent("Saved project unavailable");
    expect(screen.getByTestId("dpr-boq-items-error")).toHaveTextContent("could not be loaded");
    expect(screen.getByTestId("dpr-boq-retry")).toBeInTheDocument();
  });

  it("keeps loading visible for retained project items when the project list is empty", () => {
    render(
      <DprBoqStatus
        {...baseProps}
        projects={[]}
        projectId={99}
        items={[]}
        itemsLoading
        itemsLoaded={false}
      />,
    );

    expect(screen.queryByTestId("dpr-boq-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("dpr-boq-project-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("dpr-boq-items-loading")).toBeInTheDocument();
  });

  it("allows an explicit project switch without implying programme bars", () => {
    const onProjectChange = vi.fn();
    render(
      <DprBoqStatus
        {...baseProps}
        onProjectChange={onProjectChange}
      />,
    );

    fireEvent.click(screen.getByTestId("dpr-boq-project-select"));
    fireEvent.click(screen.getByText("Project 22"));
    expect(onProjectChange).toHaveBeenCalledWith(22);
    expect(screen.queryByTestId("dpr-boq-items-empty")).not.toBeInTheDocument();
  });

  it("does not turn a successful empty item response into a programme error", () => {
    render(
      <DprBoqStatus
        {...baseProps}
        items={[]}
      />,
    );

    expect(screen.getByTestId("dpr-boq-items-empty")).toHaveTextContent("Programme bars are not required");
    expect(screen.queryByTestId("dpr-boq-error")).not.toBeInTheDocument();
  });
});
