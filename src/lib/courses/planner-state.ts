export interface PlannerState {
  selectedCrns: string[];
}

export type PlannerAction =
  | { type: "add"; crn: string }
  | { type: "remove"; crn: string }
  | { type: "reset" };

export const initialPlannerState: PlannerState = { selectedCrns: [] };

export function plannerReducer(
  state: PlannerState,
  action: PlannerAction,
): PlannerState {
  if (action.type === "add") {
    if (state.selectedCrns.includes(action.crn)) {
      return state;
    }

    return { selectedCrns: [...state.selectedCrns, action.crn] };
  }

  if (action.type === "reset") {
    return initialPlannerState;
  }

  if (!state.selectedCrns.includes(action.crn)) {
    return state;
  }

  return {
    selectedCrns: state.selectedCrns.filter((crn) => crn !== action.crn),
  };
}
