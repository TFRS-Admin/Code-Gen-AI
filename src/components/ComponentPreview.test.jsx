import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentPreview } from "./ComponentPreview";

afterEach(cleanup);

const ORIGINAL_CODE = '<button className="bg-blue-500 text-white">Click</button>';
const ADAPTED_CODE = '<button className="bg-tfrs-red text-tfrs-ink">Click</button>';
const TFRS_CLASSES = ["bg-tfrs-red", "text-tfrs-ink"];

describe("ComponentPreview", () => {
  it("renders the component name and the TFRS classes applied", () => {
    render(
      <ComponentPreview
        componentId="comp-1"
        originalCode={ORIGINAL_CODE}
        adaptedCode={ADAPTED_CODE}
        tfrsClasses={TFRS_CLASSES}
        componentName="CommandButton"
      />
    );
    expect(screen.getByText("CommandButton")).toBeInTheDocument();
    expect(screen.getByText("bg-tfrs-red")).toBeInTheDocument();
    expect(screen.getByText("text-tfrs-ink")).toBeInTheDocument();
    expect(screen.getByText("Component ID: comp-1")).toBeInTheDocument();
  });

  it("shows a placeholder when no TFRS classes were detected", () => {
    render(<ComponentPreview originalCode={ORIGINAL_CODE} adaptedCode={ORIGINAL_CODE} tfrsClasses={[]} />);
    expect(screen.getByText("No TFRS classes detected.")).toBeInTheDocument();
  });

  it("switches between adapted and original code tabs", async () => {
    const user = userEvent.setup();
    render(
      <ComponentPreview originalCode={ORIGINAL_CODE} adaptedCode={ADAPTED_CODE} tfrsClasses={TFRS_CLASSES} />
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("bg-tfrs-red");
    await user.click(screen.getByRole("tab", { name: /original code/i }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("bg-blue-500");
  });

  it("copies the adapted code to the clipboard", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub, replacing anything
    // defined beforehand — spy on it only after setup() runs.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(
      <ComponentPreview originalCode={ORIGINAL_CODE} adaptedCode={ADAPTED_CODE} tfrsClasses={TFRS_CLASSES} />
    );

    await user.click(screen.getByRole("button", { name: /copy adapted code/i }));
    expect(writeText).toHaveBeenCalledWith(ADAPTED_CODE);
  });
});
