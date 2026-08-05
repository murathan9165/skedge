import { PlannerShell } from "@/components/planner/planner-shell";

export default function Home() {
  return (
    <main aria-label="Fall 2026 course planner" className="planner-foundation">
      <section className="planner-intro" aria-labelledby="planner-title">
        <p className="eyebrow">Kenyon College</p>
        <h1 id="planner-title">Fall 2026 class schedule planner</h1>
        <p>
          Build a clear weekly view from the official Fall 2026 snapshot. Nothing
          is registered or saved.
        </p>
      </section>
      <PlannerShell />
    </main>
  );
}
