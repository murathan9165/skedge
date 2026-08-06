import { PlannerShell } from "@/components/planner/planner-shell";

export default function Home() {
  return (
    <main aria-label="Fall 2026 course planner" className="planner-foundation">
      <p className="planner-disclaimer">
        *disclaimer: the app is in alpha, and does not support live Schedule of Courses updates.
      </p>
      <PlannerShell />
    </main>
  );
}
