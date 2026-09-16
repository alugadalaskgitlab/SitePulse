// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows a site-directory failure separately and retries the site lookup", () => {
    const onRetrySites = vi.fn();
    render(
      <DprBoqStatus
        {...baseProps}
        sitesLoaded={false}
        sitesError={new Error("503")}
        onRetrySites={onRetrySites}
      />,
    );

    expect(screen.getByTestId("dpr-boq-sites-error")).toHaveTextContent("Sites could not be loaded");
    fireEvent.click(screen.getByTestId("dpr-boq-sites-retry"));
    expect(onRetrySites).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("dpr-boq-error")).not.toBeInTheDocument();
  });

  it("shows a failed site lookup even before a new form has a site name", () => {
    const onRetrySites = vi.fn();
    render(
      <DprBoqStatus
        {...baseProps}
        siteName=""
        sitesLoaded={false}
        sitesError={new Error("network down")}
        onRetrySites={onRetrySites}
      />,
    );

    expect(screen.getByTestId("dpr-boq-sites-error")).toHaveTextContent("Sites could not be loaded");
    fireEvent.click(screen.getByTestId("dpr-boq-sites-retry"));
    expect(onRetrySites).toHaveBeenCalledTimes(1);
  });

  it("shows site-directory loading before a new form has a site name", () => {
    render(
      <DprBoqStatus
        {...baseProps}
        siteName=""
        sitesLoading
        sitesLoaded={false}
      />,
    );

    expect(screen.getByTestId("dpr-boq-sites-loading")).toHaveTextContent("Loading sites");
  });

  it("keeps a restored recovery target while the site lookup resolves", async () => {
    const onProjectChange = vi.fn();
    const onRecoveryPendingChange = vi.fn();
    const view = render(
      <DprBoqStatus
        {...baseProps}
        siteId={null}
        projectId={null}
        projects={[]}
        projectsLoading
        projectsLoaded={false}
        sitesLoading
        sitesLoaded={false}
        onProjectChange={onProjectChange}
        onRecoveryPendingChange={onRecoveryPendingChange}
        pendingRecoveryProjectId={11}
        projectRecoveryRequired
      />,
    );

    expect(screen.queryByTestId("dpr-boq-project-recovery-confirm")).not.toBeInTheDocument();
    view.rerender(
      <DprBoqStatus
        {...baseProps}
        siteId={1}
        projects={baseProps.projects}
        projectId={null}
        projectsLoaded
        sitesLoaded
        onProjectChange={onProjectChange}
        onRecoveryPendingChange={onRecoveryPendingChange}
        pendingRecoveryProjectId={11}
        projectRecoveryRequired
      />,
    );

    await waitFor(() => expect(screen.getByTestId("dpr-boq-project-recovery-confirm")).toBeInTheDocument());
    expect(onRecoveryPendingChange).not.toHaveBeenCalledWith(null);
  });

  it("does not hide a requested site that is absent from a loaded directory", () => {
    render(
      <DprBoqStatus
        {...baseProps}
        siteId={null}
        projects={[]}
        sitesLoaded
      />,
    );

    expect(screen.getByTestId("dpr-boq-site-missing")).toHaveTextContent("could not be found");
    expect(screen.queryByTestId("dpr-boq-empty")).not.toBeInTheDocument();
  });

  it("clears a recovery target when the project options change", () => {
    const onProjectChange = vi.fn();
    const view = render(
      <DprBoqStatus
        {...baseProps}
        projectId={null}
        items={[]}
        onProjectChange={onProjectChange}
        projectRecoveryRequired
      />,
    );

    fireEvent.click(screen.getByTestId("dpr-boq-project-select"));
    fireEvent.click(screen.getByText("Project 11"));
    expect(screen.getByTestId("dpr-boq-project-recovery-confirm")).toBeInTheDocument();

    view.rerender(
      <DprBoqStatus
        {...baseProps}
        projects={[{ id: 22, name: "Project 22" }]}
        projectId={null}
        items={[]}
        onProjectChange={onProjectChange}
        projectRecoveryRequired
      />,
    );

    expect(screen.queryByTestId("dpr-boq-project-recovery-confirm")).not.toBeInTheDocument();
    expect(onProjectChange).not.toHaveBeenCalled();
  });

  it("clears a pending target when project changes become disabled", () => {
    const onProjectChange = vi.fn();
    const view = render(
      <DprBoqStatus
        {...baseProps}
        projectId={null}
        items={[]}
        onProjectChange={onProjectChange}
        projectRecoveryRequired
      />,
    );

    fireEvent.click(screen.getByTestId("dpr-boq-project-select"));
    fireEvent.click(screen.getByText("Project 11"));
    expect(screen.getByTestId("dpr-boq-project-recovery-confirm")).toBeInTheDocument();

    view.rerender(
      <DprBoqStatus
        {...baseProps}
        projectId={null}
        items={[]}
        onProjectChange={onProjectChange}
        projectRecoveryRequired
        projectChangeDisabled
      />,
    );

    expect(screen.queryByTestId("dpr-boq-project-recovery-confirm")).not.toBeInTheDocument();
    expect(onProjectChange).not.toHaveBeenCalled();
  });
});
