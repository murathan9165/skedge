import { PlannerShell } from "@/components/planner/planner-shell";

export default function Home() {
  return (
    <main aria-label="Fall 2026 course planner" className="planner-foundation">
      <PlannerShell />
    </main>
  );
}
