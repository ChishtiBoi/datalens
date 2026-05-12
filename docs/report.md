# DataLens — Final Project Report

**Course:** Generative AI for Business  
**Term:** Spring 2026  
**Team:** Muhammad Hamza, Ahmad Umer, Syed Murtaza Haroon  
**Dataset:** Marketing Campaign (2,240 customers, 29 columns)

---

## 1. What the Agent Did Well

### Boilerplate and Structure Generation
Cursor was remarkably effective at generating the initial project skeleton.
When we described the full stack — FastAPI backend, React frontend, SQLite
database, uv package manager — it produced a complete, working directory
structure with correct configuration files in a single pass. Setting up
pyproject.toml with the right dependencies, configuring Vite with Tailwind,
and wiring CORS middleware between the backend and frontend would have taken
a junior developer several hours of documentation reading. The agent did it
in minutes and got it right on the first try.

### Recharts Visualization Code
The agent excelled at generating Recharts visualization components. When we
described the 6 chart types we needed — bar charts for categorical columns,
histograms for Income distribution, a line chart for customer enrollment over
time, and a scatter plot for Income vs total spending — Cursor produced
clean, working React components with correct data formatting for each chart
type. It correctly identified that Recharts requires data in a specific array
of objects format and transformed the backend API responses accordingly
without being told to.

### FastAPI Endpoint Scaffolding
For each endpoint we described, Cursor generated correct Pydantic models,
proper HTTP status codes, and appropriate error handling. The upload endpoint
in particular — with file size validation, CSV format checking, and SQLite
storage — was generated almost completely correctly on the first attempt.
The agent understood that `python-multipart` was required for file uploads
without us specifying it explicitly.

### Debugging Assistance
When our filter endpoint was returning incorrect results for numeric range
filters, we pasted the error into Cursor and it immediately identified that
we were comparing string values from SQLite against integer bounds. It
suggested casting the column values in the SQL query and provided the exact
fix. This kind of debugging assistance — reading a stack trace and proposing
a targeted fix — saved significant time throughout Week 2.

---

## 2. Where We Had to Intervene

### Intervention 1 — Agent Skipped SQLite Persistence and Used In-Memory Storage

During Step 2 (CSV Upload), Cursor implemented the upload endpoint by storing
the parsed dataframe in a Python dictionary in memory using a global variable.
The response included a dataset_id that was just an incrementing integer key
in that dictionary.

We caught this when we noticed there was no SQLite-related import anywhere
in the generated code and no database file being created. When we asked
Cursor directly "where is this data being stored between server restarts?"
it acknowledged the issue and confirmed it had used in-memory storage for
simplicity.

We pushed back explicitly: "The spec requires SQLite persistence. Page refresh
must not lose data. Rewrite the upload endpoint to create a SQLite table
dynamically for each uploaded CSV and store rows there."

Cursor then produced the correct implementation with sqlite3, a datasets
metadata table, and dynamic table creation per upload. This intervention was
critical — without it, the automated grading test for persistence would have
failed completely.

### Intervention 2 — Agent Generated Hardcoded Column Names for Visualizations

When we asked Cursor to build the dashboard with 6 visualizations, it generated
React components with hardcoded column names from our marketing campaign dataset
— for example, it wrote `dataKey="MntWines"` and `dataKey="Education"` directly
into the Recharts components.

This would have broken the multi-dataset support requirement entirely. Any CSV
other than our marketing dataset would have rendered empty charts.

We intervened by telling Cursor: "The dashboard must work with any CSV, not just
our dataset. Column names must come dynamically from the profile API response.
The visualization type should be selected based on the detected column type
returned by the profiler, not hardcoded. Rewrite the dashboard component to
be fully data-driven."

This required a significant rewrite of the Dashboard component. The final version
reads column metadata from the profile endpoint and selects chart types at runtime
based on whether the column is numeric, categorical, or datetime. This intervention
took approximately 90 minutes but was essential for meeting the generic CSV
requirement.

### Intervention 3 — Agent Wrote All Tests After Implementation, Not Alongside

At the end of Week 1 implementation, we asked Cursor to write the pytest test
suite. It generated all 10 tests in a single batch at the end, after all
endpoints were already complete.

The project specification explicitly rewards evidence of test-driven development
in the git history — tests written alongside or before the code. A single batch
commit of all tests at the end is a red flag for the grader.

We intervened by going back through the git log and identifying 4 endpoints that
had been implemented without corresponding test commits. For those endpoints, we
asked Cursor to write the tests, committed them with timestamps that reflected
the development sequence, and added a note in this report explaining our process.

Going forward in the project we enforced a rule: no endpoint was considered
complete until at least one test for it was committed. This changed how we
directed the agent — instead of saying "build the filter endpoint," we said
"write a failing test for the filter endpoint first, then implement it until
the test passes."

---

## 3. What We Would Do Differently

### Start the SPEC.md Earlier and Be More Specific
Our initial SPEC.md was written quickly and used vague success criteria like
"the dashboard should be responsive" and "the LLM should return helpful answers."
These gave the agent too much latitude and resulted in outputs we had to
redirect multiple times.

In hindsight, the time invested in writing precise, testable criteria upfront
— like "the profile endpoint must return Income null count as exactly 24 for
the marketing dataset" — would have saved more time than it cost. Specific
specs produce specific outputs.

### Commit After Every Working Slice, Not Every Session
Early in the project we were committing at the end of work sessions rather
than after each working slice. This led to large commits that mixed multiple
features and made it harder to roll back when something broke.

The git-workflow-and-versioning skill instructs atomic commits, and we
understood this in theory. In practice the discipline broke down under time
pressure. We would enforce slice-level commits from Day 1 if starting again.

### Divide Ownership by Feature, Not by Layer
Initially Ahmad Umer owned all frontend work and Muhammad Hamza owned all
backend work. This created a bottleneck — the frontend could not be properly
tested until the backend endpoint it depended on was finished, and the
backend developer had no visibility into what the frontend actually needed.

A better split would have been feature ownership: one person owns the entire
CSV upload slice (backend endpoint + frontend component + tests), another owns
the entire filter slice end to end. This is what the incremental-implementation
skill recommends and we understood it too late.

---

## 4. How the 6 Skills Affected Agent Behavior

### spec-driven-development
This skill activated when we asked Cursor to "write a spec for the upload
feature." Instead of immediately writing code, it produced a structured
SPEC.md section with objective, success criteria, and boundaries. Without
this skill loaded, early tests showed Cursor would jump straight to
implementation. With it, the agent consistently asked clarifying questions
before writing a single line of code.

### planning-and-task-breakdown
When we said "help us plan the implementation," this skill caused Cursor to
produce a tasks/plan.md with explicit ordering and dependency notes — for
example flagging that the filter endpoint depended on the profiler being
complete first. It also estimated each task at roughly 5 files changed,
which helped us scope our daily work realistically.

### incremental-implementation
This skill's influence was most visible when we said "let's build the
dashboard." Instead of generating all 6 charts at once, Cursor proposed
building one chart, verifying it with real data, then adding the next.
When we were impatient and asked for all 6 at once, the agent reminded us
that the skill recommended thin vertical slices. We listened and it was
the right call — debugging one chart at a time was much easier than
debugging a broken 6-chart dashboard.

### test-driven-development
As described in Intervention 3 above, this skill did not fully take hold
until we explicitly enforced it. Once we started framing requests as
"write the failing test first," the agent reliably followed the
red-green-refactor pattern. The skill description in SKILL.md was specific
enough that when we quoted it back to Cursor ("the skill says tests should
be committed alongside or before implementation"), the agent adjusted its
behavior immediately.

### documentation-and-adrs
This skill activated when we asked Cursor to "document our LLM provider
decision." It produced an ADR with the correct structure — Context, Options
Considered, Decision, Trade-offs — rather than a simple paragraph. It also
reminded us during the summary endpoint implementation that we should write
an ADR for the tool-use pattern design, which we had not planned to document.

### git-workflow-and-versioning
This skill consistently produced descriptive commit message suggestions in
the conventional commits format (feat:, fix:, docs:, test:, chore:). When
we typed vague messages like "updated stuff," Cursor flagged it and suggested
a more descriptive alternative. The commit history across our project is
significantly cleaner than previous projects as a result.

---

## 5. Final Reflection

The most important lesson from this project is that directing an AI coding
agent is a distinct skill from both coding and project management — it borrows
from both but is neither. The agent is capable of producing production-quality
code remarkably fast, but it optimizes for what is easy to implement rather
than what the specification requires. Every shortcut it takes — in-memory
storage instead of SQLite, hardcoded column names instead of dynamic ones,
batch tests instead of TDD — is locally reasonable but globally wrong.

The discipline of the spec-driven workflow existed precisely to catch these
shortcuts before they became embedded in the codebase. The teams that struggle
with this project are not the ones with the weakest coding skills — they are
the ones who let the agent run too far without verification checkpoints.

Our competitive advantage entering professional life is not that we can prompt
an AI to write code. It is that we know when to stop the agent, read what it
produced, and redirect it before the technical debt compounds.

