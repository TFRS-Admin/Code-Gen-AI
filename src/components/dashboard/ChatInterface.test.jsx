import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInterface from "./ChatInterface";

afterEach(cleanup);

describe("ChatInterface", () => {
  it("shows an empty-state greeting when there are no messages", () => {
    render(<ChatInterface messages={[]} greeting="What are we building today?" />);
    expect(screen.getByText("What are we building today?")).toBeInTheDocument();
  });

  it("renders user and assistant messages", () => {
    render(
      <ChatInterface
        messages={[
          { id: "1", role: "user", content: "Add a login page" },
          { id: "2", role: "assistant", content: "Sure, starting now." },
        ]}
      />
    );
    expect(screen.getByText("Add a login page")).toBeInTheDocument();
    expect(screen.getByText("Sure, starting now.")).toBeInTheDocument();
  });

  it("shows a thinking indicator while isThinking is true", () => {
    render(<ChatInterface messages={[{ id: "1", role: "user", content: "hi" }]} isThinking />);
    expect(screen.getByText(/Blair is thinking/i)).toBeInTheDocument();
  });

  it("renders fenced code blocks with a working copy button", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub, replacing anything
    // defined beforehand — spy on it only after setup() runs.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const markdown = "Here you go:\n\n```js\nconst x = 1;\n```";
    render(<ChatInterface messages={[{ id: "1", role: "assistant", content: markdown }]} />);

    const copyButton = screen.getByRole("button", { name: /copy code/i });
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("const x = 1;");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
