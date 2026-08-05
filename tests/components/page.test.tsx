import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home", () => {
  it("renders the Fall 2026 planner landmark", () => {
    render(<Home />);

    expect(
      screen.getByRole("main", { name: /fall 2026 course planner/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /fall 2026/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /course search/i })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: /monday through friday class schedule/i })).toBeInTheDocument();
  });
});
