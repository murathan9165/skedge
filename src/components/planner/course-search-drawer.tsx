"use client";

import { useState } from "react";

import snapshot from "@/data/fall-2026.json";
import { searchSections } from "@/lib/courses/search";
import type { CourseSection, CourseSnapshot } from "@/lib/courses/types";

import { CourseCard } from "./course-card";

const snapshotSections = (snapshot as CourseSnapshot).sections;

interface CourseSearchDrawerProps {
  sections?: CourseSection[];
  onAdd?: (section: CourseSection) => void;
  selectedCrns?: readonly string[];
}

export function CourseSearchDrawer({
  sections = snapshotSections,
  onAdd,
  selectedCrns = [],
}: CourseSearchDrawerProps) {
  const [query, setQuery] = useState("");
  const results = searchSections(sections, query);
  const isBrowseState = query.trim() === "";

  return (
    <aside className="course-search-drawer" aria-label="Course search">
      <div className="course-search-drawer__heading">
        <p className="eyebrow">Fall 2026</p>
        <h2>Find a course</h2>
      </div>
      <label className="course-search-drawer__label" htmlFor="course-search">
        Search Fall 2026 courses
      </label>
      <input
        id="course-search"
        className="course-search-drawer__input"
        type="search"
        role="searchbox"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Subject, course, title, or instructor"
      />
      {isBrowseState ? <p>Browse all Fall 2026 sections</p> : null}
      {results.length ? (
        <>
          <p aria-live="polite">{results.length} {results.length === 1 ? "section" : "sections"}</p>
          <div className="course-search-drawer__results">
            {results.map((section) => (
              <CourseCard
                key={section.crn}
                section={section}
                onAdd={onAdd}
                selected={selectedCrns.includes(section.crn)}
              />
            ))}
          </div>
        </>
      ) : (
        <p role="status">No Fall 2026 sections match &quot;{query}&quot;.</p>
      )}
    </aside>
  );
}
