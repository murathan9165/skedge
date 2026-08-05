import { describe, expect, it } from "vitest";

import {
  initialPlannerState,
  plannerReducer,
} from "@/lib/courses/planner-state";

describe("plannerReducer", () => {
  it("starts every planner session with no selected CRNs", () => {
    expect(initialPlannerState).toEqual({ selectedCrns: [] });
  });

  it("adds a CRN once when the same section is selected repeatedly", () => {
    const selected = plannerReducer(initialPlannerState, {
      type: "add",
      crn: "80565",
    });

    expect(plannerReducer(selected, { type: "add", crn: "80565" })).toEqual({
      selectedCrns: ["80565"],
    });
  });

  it("removes only the requested CRN", () => {
    const state = { selectedCrns: ["80565", "80336"] };

    expect(plannerReducer(state, { type: "remove", crn: "80565" })).toEqual({
      selectedCrns: ["80336"],
    });
  });
});
