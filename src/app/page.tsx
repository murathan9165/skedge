import { PlannerShell } from "@/components/planner/planner-shell";

export default function Home() {
  return (
    <main aria-label="Fall 2026 course planner" className="planner-foundation">
      <p className="planner-disclaimer">
        This app is in beta. If you notice any issues, email{" "}
        <a href="mailto:kocaman1@kenyon.edu">kocaman1@kenyon.edu</a>.
      </p>
      <PlannerShell />
    </main>
  );
}
