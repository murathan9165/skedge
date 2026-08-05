# Kenyon Academic Knowledge Map for a Natural-Language Student Interface

**Research date:** 2026-08-04  
**Scope:** Kenyon College public web content related to academic navigation: catalog and policies, courses and sections, schedules, prerequisites, registration, advising, degree progress, graduation, program requirements, transfer/AP/IB credit, and pre-professional planning.

## Executive conclusion

Kenyon’s curriculum knowledge is highly suitable for an LLM interface when the task is retrieval, explanation, comparison, parsing, arithmetic, or schedule simulation. It becomes a copilot problem when the task combines a student’s private academic record with rules, term availability, and competing constraints. It remains a human-decision problem when the student must choose among values, tolerate uncertainty, request an exception, or obtain an official interpretation from an advisor, instructor, department chair or Registrar.

The product should therefore behave like a cited academic navigator, not an autonomous academic authority:

1. retrieve the current rule or term data;
2. show the reasoning and the source/effective term;
3. distinguish “the rules appear to say…” from “you are officially eligible…”;
4. surface conflicts, missing inputs and human approvals;
5. produce an advisor/Registrar-ready next action when it cannot safely decide.

## What was mapped

The site map produced **657 unique URLs** across four topical discovery passes. The relevant spine was concentrated in:

| Area | Discovery footprint | What it contains |
|---|---:|---|
| Registrar course catalog and policies | 41 mapped URLs; 24 department/program requirement pages | Permanent course listings, degree rules, major/minor requirements, capstones, honors, transfer/AP/IB policies, grading and enrollment rules |
| Registration and Plan Ahead | 8 mapped pages plus linked Registrar pages | Plan Ahead rounds, alternate PIN, prerequisites, corequisites, overrides, reserved seats, deadlines and registration troubleshooting |
| Academic advising | 38 mapped URLs | First-year course planning, advising expectations, academic processes, conditional enrollment, progress support and campus resources |
| Departments and majors | 145 mapped URLs; 48 academic-program pages | Program-specific requirements, course lists, sequencing, honors, capstones, research, placement and off-campus-study guidance |
| Academic/career planning | 11 mapped URLs | Pre-health curricula, sample schedules, postgraduate timelines, entrance exams and advisor touchpoints |
| Term schedule/prerequisite feeds | 14 schedule/prerequisite endpoints scraped | Fall 2026 and Spring 2027 sections, instructors, rooms, times, enrollment/seats, attributes, special topics, reserved seats, QR, CEL and current-year prerequisites |

The scrape intentionally excludes pages that match “academic” lexically but do not help a student navigate curriculum, such as athletics news, alumni stories, historical archives and faculty profile pages. Linked PDFs and authenticated MyBanner/Plan Ahead screens should be treated as additional source adapters in a production system.

## The knowledge layers

| Layer | Canonical question | Data characteristics | Recommended product behavior |
|---|---|---|---|
| Student record | What has this student actually completed, declared, attempted or received credit for? | Private, personalized, authoritative for the student | Import only with consent; preserve provenance; never infer missing credit or declaration status |
| Catalog rules | What does a course, program or degree require? | Relatively stable but versioned by catalog year | Cite the catalog version and explain the rule in plain language |
| Term offerings | What is offered this term, in which section, at what time, with what seats/attributes? | Volatile and term-specific | Refresh frequently; show “as of” timestamp; never use an old schedule as current fact |
| Prerequisite logic | What must be completed, with what minimum grade, and may it be concurrent? | Volatile, structured logic with AND/OR and overrides | Parse into a rule graph; show the exact missing condition and distinguish override from enrollment |
| Degree audit | How do the student’s courses map to degree/major requirements? | Personalized computation plus institutional rules | Provide an explainable simulation; defer official clearance to Degree Evaluation/Registrar |
| Advising context | What fits the student’s interests, workload, health, commitments and goals? | Human context, partly unobservable | Ask targeted questions; offer options and trade-offs, not a single “best” answer |
| Exceptions and approvals | Can a rule be waived, substituted or interpreted differently? | Case-specific institutional judgment | Route to the named approver; draft the request and evidence packet |

## Mundane → tactical → strategical task table

“Mundane” means mostly deterministic retrieval or transformation. “Tactical” means the system can analyze and recommend with user-provided constraints, but a student or advisor should inspect the result. “Strategical” means the answer depends materially on values, identity, uncertainty, relationships or institutional discretion.

| Level | Student task / natural-language prompt | Knowledge and computation required | LLM role | Human boundary |
|---|---|---|---|---|
| Mundane | “Find all Fall 2026 biology courses taught by Professor X.” | Term schedule, department, instructor, section identity | Search and cite | Verify live section status before acting |
| Mundane | “What days, times, room and instructor does this section meet?” | Section meeting patterns, room key, term | Answer and normalize time data | None beyond freshness |
| Mundane | “Show courses with seats, reserved seats, QR, CEL or an interdisciplinary attribute.” | Seat/enrollment, reserved-seat, QR/CEL and attribute feeds | Filter and explain labels | Seats and restrictions can change; show timestamp |
| Mundane | “What is this course about, and is it a year-long course?” | Catalog description, course number and `Y` designation | Summarize with link | Do not invent workload or instructor expectations not in source |
| Mundane | “What does `0.50 unit / 4 semester hours` mean?” | Unit/semester-hour conversion and course-credit conventions | Explain/convert | Flag catalog-year differences if present |
| Mundane | “What are the prerequisites for ARTS 230? Can I take it concurrently?” | Current prerequisite feed, minimum grade, AND/OR, `YES` concurrent flag, placement data | Parse into a readable checklist | “Likely satisfies” is not official clearance |
| Mundane | “Which requirement does this QR course satisfy?” | Course attribute, QR list, degree rules | Explain the direct mapping | A transfer course may require Registrar equivalency review |
| Mundane | “What does AP/IB credit give me in Biology, Math or language?” | Class-year-specific AP/IB table, placement vs credit distinction | Lookup and compare | Department placement and record posting remain authoritative |
| Mundane | “When is the last day to add, withdraw, change P/D/F or sit exams?” | Academic calendar and schedule-change policy | Answer with exact date and source | Do not rely on a generic deadline when term dates differ |
| Mundane | “Explain the fields in my degree evaluation: KC, Reg, Tran, Test, Met/Not Met.” | Degree Evaluation Information glossary | Translate the report | MyBanner output is the student-specific source |
| Mundane | “What does Plan Ahead do, and what does it not do?” | Plan Ahead instructions and FAQs | Explain workflow | Planning a course is not registration; an override is not enrollment |
| Mundane | “Why does Plan Ahead show my courses alphabetically?” | Plan Ahead sequence-number behavior and save steps | Troubleshoot | Escalate platform errors to Registrar/technology support |
| Mundane | “Give me the official links for my question.” | Source index, authority and freshness metadata | Route to source | Link to the exact page, not a generic search result |
| Mundane | “Build a weekly calendar from these sections and flag conflicts.” | Section meeting instances, time-zone/weekday normalization | Simulate and visualize | Student decides which conflict is acceptable |
| Mundane | “Compare the catalog description with the Fall 2026 section listing.” | Catalog vs term schedule join by course/section | Explain stable vs volatile fields | Treat term schedule as current offering data |
| Tactical | “Do I appear to meet the prerequisites for these three courses?” | Student transcript/test/transfer data joined to prerequisite graph | Run an auditable eligibility pre-check | State “appears to meet”; instructor override/Registrar can decide otherwise |
| Tactical | “What courses unlock my intended sophomore sequence?” | Prerequisite graph, term offerings, year-long sequences, placement | Find paths and bottlenecks | Department may recommend a path not encoded as a formal prerequisite |
| Tactical | “Create three Fall schedules that cover my language, QR and diversification goals.” | Requirement coverage, section times, conflicts, course attributes | Generate feasible candidates and trade-offs | Student/advisor chooses workload and intellectual fit |
| Tactical | “How can I use this term to make progress toward my major and still keep breadth?” | Major requirements, college-wide requirements, course offerings, outside-major rules | Optimize candidate sets | Rules can be complex for interdisciplinary/cross-listed courses; cite every count |
| Tactical | “If I drop this course, do I fall below term/year enrollment minimums?” | Current units, annual units, senior exception, drop/add/WD dates | Calculate scenarios | Financial, athletic, visa, aid and health implications require human confirmation |
| Tactical | “What happens if I take this transfer course or use AP credit?” | Transfer approval rules, AP/IB table, degree/major/QR/language/diversification interactions | Identify possible effects and evidence needed | Pre-approval and final posting belong to Registrar/department |
| Tactical | “Which Plan Ahead alternatives should I prioritize?” | 10–12 course list, priority/alternate order, rounds, time conflicts, seats, prerequisites | Rank alternatives under explicit constraints | Student owns priorities; advisor can review; system must not silently reorder intent |
| Tactical | “Make my advisor meeting agenda from my degree evaluation.” | Not Met items, in-progress courses, major GPA, outside-discipline credits, deadlines | Summarize gaps and draft questions | Advisor interprets options and approves decisions/PIN |
| Tactical | “Run a what-if analysis for a possible major/minor.” | Declared/possible program requirements and term/catalog version | Simulate requirement coverage | Known catalog limitations exist for some programs; official evaluation wins |
| Tactical | “Am I on track to graduate in eight semesters?” | Degree requirements, residency, GPA, credits, program sequence, remaining offerings | Identify risks, dependencies and missing evidence | Cannot guarantee graduation; Registrar/degree review is authoritative |
| Tactical | “Design a pre-health schedule that leaves room for my major.” | HPAC course guides, entrance-exam timing, sample schedules, prerequisites | Generate scenarios and explain trade-offs | HPAC/advisor must validate timing, major fit and professional-school variation |
| Tactical | “What should I do if the course is full, restricted or I lack the prerequisite?” | Reserved seats, class-year restrictions, waitlist, instructor permission, override process | Present permitted next actions and draft outreach | Instructor/Registrar/department decides access |
| Tactical | “Do these two courses jointly satisfy diversification?” | Department/division taxonomy, cross-listings and course-specific exceptions | Explain the rule and show evidence | Interdisciplinary edge cases need Registrar or advisor confirmation |
| Strategical | “Should I major in X, combine X with Y, or keep exploring?” | Program structure, course content, capstone, career goals, student interests and workload | Facilitate comparison and reflective questioning | No authoritative optimization target; decision belongs to student with advising |
| Strategical | “Design my four-year academic path around research, study away, honors and a capstone.” | Multi-year prerequisites, offering frequency, residence/credit limits, capstone timing, uncertain future schedule | Produce several robust plans and identify fragile assumptions | Advisor/department must validate sequencing and exceptions |
| Strategical | “Should I take a difficult prerequisite now, defer it, or choose another route?” | Bottleneck risk, placement, workload, future offering uncertainty and goals | Make trade-offs visible | Student context and faculty judgment dominate |
| Strategical | “Should I study away, and how might it affect language, QR, major or graduation timing?” | Off-campus program rules, transfer pre-approval, language/major equivalencies, residency | Prepare a decision brief and checklist | Program/Registrar approval and personal priorities are decisive |
| Strategical | “Should I take a glide year before medical/graduate school?” | Entrance-exam timing, application cycle, experience goals, HPAC guidance | Compare timelines and consequences | Career choice is personal and external admissions rules change |
| Strategical | “Can my course, transfer credit or circumstance count as an exception?” | Evidence, policy, precedent if available, approver and appeal route | Draft the case, identify missing evidence and likely questions | Human institutional discretion; LLM must never promise approval |
| Strategical | “What is the best balance of grades, breadth, challenge, athletics/work and wellbeing?” | Student values and constraints plus course workload signals | Coach reflection and generate options | The system must not choose on the student’s behalf or infer sensitive needs |
| Strategical | “Am I ready to declare, change, or add a major/minor?” | Progress, interests, requirement fit, capstone/honors timing, opportunity cost | Structure the decision and advisor conversation | Declaration and departmental interpretation are human/official actions |
| Strategical | “Can I graduate?” | Full record, official degree evaluation, catalog version, pending grades, residency and program sign-off | Explain what appears met/not met and produce a verification checklist | Only the College/Registrar can provide final clearance |

## What the LLM can safely automate

### High-confidence automation

- Search/filter/sort catalog and term schedule data.
- Convert units and semester hours.
- Explain course descriptions, policy language and system terminology.
- Parse prerequisite expressions into AND/OR/concurrent/ minimum-grade conditions.
- Join courses to sections, times, rooms, instructors, attributes and current seats.
- Build candidate calendars and detect time conflicts.
- Calculate requirement coverage from a supplied, versioned rule set.
- Generate checklists, advisor agendas, comparison tables and outreach drafts.
- Cite the source page, catalog year, term and scrape timestamp in every answer.

### Copilot automation

- Degree-audit simulation.
- What-if major/minor analysis.
- Course-sequence and bottleneck planning.
- Plan Ahead alternative ranking.
- Transfer/AP/IB impact analysis.
- Pre-health and postgraduate timeline planning.
- Graduation-risk detection.

These should expose assumptions, show the courses/rules used, and let the student change constraints. A good output is “Here are three feasible interpretations and the question to ask your advisor,” not “This is your plan.”

### Human-only final decisions

- Official enrollment eligibility, graduation clearance and degree exceptions.
- Permission of instructor, prerequisite overrides and reserved-seat decisions.
- Transfer-credit equivalency and whether credit satisfies a major, QR, language or diversification requirement.
- Interpretation of interdisciplinary/cross-listed edge cases not explicitly encoded.
- Medical/health, disability, financial-aid, visa or athletic-load implications.
- Major/minor choice, workload/wellbeing trade-offs and career strategy.

## Knowledge graph / data model for the product

The minimum useful model is not a document chatbot over webpages. It is a versioned graph with documents attached:

```text
Student ──has──> AcademicRecord ──contains──> CourseAttempt / Credit / TestScore
Student ──declared──> Program ──has──> RequirementGroup ──requires──> Course / Attribute
Course ──offered_as──> Section ──has──> Meeting / Instructor / Room / SeatStatus
Course ──requires──> PrerequisiteExpression ──may_have──> Corequisite / Override
Course ──has──> Attribute (QR, CEL, division, department, interdisciplinary)
Course ──counts_toward──> RequirementGroup
RequirementGroup ──belongs_to──> CatalogVersion / EffectiveTerm
Action ──requires_approval_from──> Advisor / Instructor / Department / Registrar
```

Every rule or fact should carry:

- `source_url`
- `source_type` (`catalog`, `registrar_feed`, `department_page`, `advising`, `student_record`)
- `catalog_year` or `effective_term`
- `retrieved_at`
- `authority_level`
- `volatility` (`stable`, `term`, `daily`, `student-specific`)
- `applies_to` (entering cohort, class year, program, course, section)
- `human_approval_required`

Recommended internal tools/functions:

```text
search_catalog(query, catalog_year)
search_schedule(query, term, filters)
get_course(course_id, catalog_year)
get_section(section_id, term)
explain_prerequisite(course_or_section, student_record)
simulate_schedule(section_ids, constraints)
audit_degree(student_record, catalog_version, what_if_program?)
explain_degree_gap(audit_result)
compare_programs(program_ids, student_goals)
build_plan_ahead_options(priority_courses, alternatives, term)
prepare_advisor_agenda(student_record, proposed_plan)
route_human_review(question, evidence)
```

## Source authority and freshness rules

| Source | Use it for | Authority/freshness rule |
|---|---|---|
| [Kenyon College Course Catalog](https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/) | Permanent listings and institutional policies | Version by catalog year; preferred source for degree and program rules |
| [Requirements for the Degree](https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/academic-policies-and-procedures/requirements-for-the-degree) | Major/capstone, credits, residency, GPA, outside-major credits, diversification, language, QR | Canonical degree-rule source; keep exact effective version |
| [Department/program requirements](https://www.kenyon.edu/offices-and-services/registrar/kenyon-college-course-catalog/requirements-for-departments-and-programs/) | Major/minor/concentration requirements, honors, capstones and special rules | Program-specific; department pages can add guidance but cannot silently override the catalog |
| [Schedule of Courses](https://www.kenyon.edu/offices-and-services/registrar/schedule-of-courses/) | Term offerings and links to section feeds | Term-specific; refresh for each term and show timestamp |
| [Fall 2026 schedule by department](https://registrar.kenyon.edu/sep26_dept.htm) | Current section-level schedule snapshot | Volatile; use for Fall 2026 only |
| [Prerequisites for courses](https://registrar.kenyon.edu/prereqs_next.htm) | Current prerequisite/corequisite/placement logic | Volatile and structured; parse AND/OR and concurrent flags; cite retrieval time |
| [Plan Ahead Instructions](https://www.kenyon.edu/offices-and-services/registrar/registration/plan-ahead/) | Registration planning mechanics | Operational procedure; do not confuse with actual registration |
| [Tips for Registration](https://www.kenyon.edu/offices-and-services/registrar/registration/tips-for-registration/) | Overrides, reserved seats, restrictions, conflicts and timing | Operational guidance; route exceptions to human approvers |
| [Academic Calendar](https://www.kenyon.edu/academics/academic-calendar/academic-calendar-2026-2027) | Exact 2026–27 deadlines and milestones | Term-specific; use the matching academic year |
| [Degree Evaluation Information](https://www.kenyon.edu/offices-and-services/registrar/degree-evaluation-information/) | How to read MyBanner evaluations and what-if analysis | Student-specific output is more authoritative than an LLM simulation |
| [Graduation Requirement Review](https://www.kenyon.edu/offices-and-services/registrar/forms/graduation-requirement-review) | Registrar-facing graduation review/checklist workflow | Use as a completion checkpoint; do not treat a chatbot audit as clearance |
| [Academic Processes & Policies](https://www.kenyon.edu/academics/advising-resources/office-of-academic-advising/academic-processes-policies/) | Advising-oriented links to enrollment, conduct and withdrawal policies | Navigation layer; follow links to the canonical policy |
| [Advising Syllabus](https://www.kenyon.edu/academics/advising-resources/office-of-academic-advising/advising-syllabus/) | Human advising responsibilities and decision context | Use to frame questions and handoffs, not as a rule engine |
| [Pre-health curriculum planning](https://www.kenyon.edu/careers-outcomes/career-development-office/career-advising/prepare-for-postgraduate-education/health-professions-advising/planning-for-a-health-professions-career/planning-your-pre-health-curriculum) | Sample schedules and professional-school prerequisites | Planning guidance; external professional-school rules must also be verified |

## Important rule facts surfaced in the scrape

These are useful for testing an LLM interface, but must remain versioned facts rather than hard-coded assumptions:

- The degree rules describe **16.00 units / 128 semester hours** total, with at least **8.00 units / 64 semester hours earned at Kenyon on a letter-grade basis**.
- The degree requires **eight semesters of full-time enrollment**, with at least four semesters, including the senior year, completed at Kenyon’s Gambier campus.
- The overall Kenyon GPA and each major GPA must be at least **2.00** for graduation.
- Students must earn credits outside the major/discipline, satisfy diversification across four divisions, demonstrate second-language proficiency and complete at least **0.50 unit / 4 semester hours of QR**.
- AP credit does not satisfy diversification or QR; AP can affect placement, prerequisites or major progress depending on the department.
- The catalog describes a normal semester load of **2.00 units / 16 semester hours**, with minimum/maximum rules and senior exceptions. The Plan Ahead instructions separately describe a **2.25-unit / 18-semester-hour web-registration maximum during processing**; the interface must represent the phase-specific rule rather than flattening both into one number.
- The first seven class days are the principal drop/add period. Late adds, withdrawals and Pass/D/Fail changes have later but distinct windows, signatures and sometimes fees.
- Plan Ahead uses five rounds, expects primary choices before alternates, preserves processing order through saved sequence numbers, requires the alternate PIN in the Round 1 note, and recommends a list of 10–12 courses.
- An instructor override does not itself register a student; the course still must be placed in Plan Ahead or otherwise enrolled through the official process.
- The 2026–27 calendar has term-specific dates for orientation, classes, drop/add, late add, withdrawal/P/D/F, exams, grades and commencement; every answer should carry the academic year.
- The prerequisite feed explicitly encodes minimum grades, AND/OR logic and whether a course can be taken concurrently. This is a strong candidate for structured extraction rather than raw document retrieval.

## Guardrails for the chatbot

1. **Never present a simulation as an official decision.** Use “appears to,” “based on the catalog version,” and “confirm with…” where appropriate.
2. **Ask for missing inputs before making a claim.** At minimum: entering cohort/catalog year, term, declared/possible program, current credits, grades, AP/IB/transfer credit, and special constraints.
3. **Keep catalog and schedule separate.** A course can exist in the catalog without being offered in the requested term; a section can have term-specific restrictions not visible in a permanent description.
4. **Preserve logic, not just prose.** Prerequisites, degree groups, cross-listings, departments/divisions, and exclusions need structured representations.
5. **Make volatility visible.** Seats, waitlists, reserved seats, Plan Ahead processing windows and current-year prerequisites should show a retrieval timestamp.
6. **Use the student’s official degree evaluation as the reconciliation source.** If the audit simulation differs from MyBanner, show the difference and route the student to the Registrar.
7. **Do not take irreversible actions by default.** The first product should search, explain, simulate, draft and link. Registration, schedule changes, approvals and submissions require explicit confirmation and appropriate authentication.
8. **Protect private academic data.** Treat transcripts, grades, test scores, degree evaluations, health context and advising notes as sensitive; minimize retention and provide deletion/export controls.
9. **Route ambiguity to a named human.** Advisor for planning/PIN and choices; instructor for course permission; department chair for program/major interpretation; Registrar for degree, transfer and official record questions.
10. **Cite every answer.** The citation should identify the exact page, catalog/effective term and “as of” retrieval time, with a short quote or structured field when the stakes are high.

## Best first product slices

1. **Natural-language course and section search** with cited catalog descriptions, term sections, meeting times, seats, attributes and prerequisite explanation.
2. **Schedule simulator** that produces several conflict-aware weekly schedules without registering the student.
3. **Requirement-aware planner** that uses the student’s exported degree evaluation to show remaining college-wide and major requirements, with every mapping explained.
4. **Plan Ahead copilot** that turns a student’s priorities into rounds, alternates and an advisor agenda, while leaving the final ordering to the student.
5. **Human-handoff generator** that drafts an instructor/department/Registrar question with the relevant course, rule, record evidence and exact uncertainty.

The differentiator is not a generic “ask Kenyon anything” chatbot. It is a system that knows which facts are stable, which are term-sensitive, which are student-specific, and which require institutional judgment—and says so clearly in the conversation.
