import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComponentHarvester from "./ComponentHarvester";
import { BlairAPI } from "@/api/blair";

vi.mock("@/api/blair", () => ({
  BlairAPI: { getRegistryComponents: vi.fn(), adaptComponent: vi.fn() },
}));

afterEach(cleanup);

const COMPONENTS = [
  { id: "row-1", name: "CommandButton", source: "internal", category: "form", description: "Primary CTA button." },
  { id: "row-2", name: "button", source: "shadcn", category: "form", description: "Button primitive." },
  { id: "row-3", name: "TacticalCard", source: "internal", category: "data-display", description: "Bordered panel." },
];

describe("ComponentHarvester", () => {
  it("loads and lists registry components", async () => {
    BlairAPI.getRegistryComponents.mockResolvedValue(COMPONENTS);
    render(<ComponentHarvester />);

    expect(await screen.findByText("CommandButton")).toBeInTheDocument();
    expect(screen.getByText("button")).toBeInTheDocument();
    expect(screen.getByText("TacticalCard")).toBeInTheDocument();
  });

  it("filters the component list by search query", async () => {
    const user = userEvent.setup();
    BlairAPI.getRegistryComponents.mockResolvedValue(COMPONENTS);
    render(<ComponentHarvester />);

    await screen.findByText("CommandButton");
    await user.type(screen.getByPlaceholderText(/search components/i), "tactical");

    expect(screen.getByText("TacticalCard")).toBeInTheDocument();
    expect(screen.queryByText("CommandButton")).not.toBeInTheDocument();
    expect(screen.queryByText("button")).not.toBeInTheDocument();
  });

  it("shows a placeholder before any component is selected", async () => {
    BlairAPI.getRegistryComponents.mockResolvedValue(COMPONENTS);
    render(<ComponentHarvester />);

    await screen.findByText("CommandButton");
    expect(screen.getByText(/select a component to preview/i)).toBeInTheDocument();
  });

  it("adapts and previews the selected component", async () => {
    const user = userEvent.setup();
    BlairAPI.getRegistryComponents.mockResolvedValue(COMPONENTS);
    BlairAPI.adaptComponent.mockResolvedValue({
      adaptedCode: '<button className="bg-tfrs-red text-tfrs-ink">Click me</button>',
      tfrsClasses: ["bg-tfrs-red", "text-tfrs-ink"],
    });
    render(<ComponentHarvester />);

    await user.click(await screen.findByText("CommandButton"));

    expect(await screen.findByText("bg-tfrs-red")).toBeInTheDocument();
    expect(BlairAPI.adaptComponent).toHaveBeenCalledWith(expect.any(String), "row-1");
  });

  it("shows an error message when the registry fails to load", async () => {
    BlairAPI.getRegistryComponents.mockRejectedValue(new Error("Registry unavailable"));
    render(<ComponentHarvester />);

    expect(await screen.findByText("Registry unavailable")).toBeInTheDocument();
  });
});
