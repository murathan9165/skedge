import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home", () => {
  it("renders the planner landmark and simplified course search", () => {
    render(<Home />);

    expect(
      screen.getByRole("main", { name: /fall 2026 course planner/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /weekly schedule/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search fall 2026 courses/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /fall 2026 class schedule planner/i })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /course search/i })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: /monday through friday class schedule/i })).toBeInTheDocument();
  });
});
