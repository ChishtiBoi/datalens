# ADR 002 — SQLite Schema Design for Arbitrary CSV Storage

**Date:** May 2026  
**Status:** Decided

---

## Context

DataLens must accept any CSV file — not just our assigned marketing campaign 
dataset. This means we cannot define a fixed database schema ahead of time. 
When a user uploads a CSV with unknown columns, we need to store all rows 
in a way that supports filtering, aggregation, and LLM tool queries without 
rewriting code for each new dataset.

This was one of the first architectural decisions we had to make because 
everything else (profiling, filtering, chat queries) depends on how data 
is stored.

---

## Options Considered

**Option A — Store raw CSV as a binary blob**
- Store the entire CSV file as a blob in a single `datasets` table
- Parse it fresh on every query using pandas
- Simple storage, no schema migration issues
- Problem: Every query reads the full file from disk — slow for large files.
  Filtering requires loading all rows into memory each time.

**Option B — Dynamic table creation per dataset**
- On upload, create a new SQLite table named after the dataset
- Column names taken directly from CSV headers (sanitized)
- Each upload gets its own table: `dataset_1`, `dataset_2`, etc.
- Queries run directly against SQLite — fast, indexable
- Problem: Column name sanitization needed to prevent SQL injection

**Option C — Entity-Attribute-Value (EAV) pattern**
- Single `values` table with columns: dataset_id, row_id, column_name, value
- Completely schema-agnostic, handles any CSV
- Problem: Extremely slow for aggregation queries. Joining EAV tables 
  to compute averages or group-bys is prohibitively complex.

---

## Decision

We chose **Option B — Dynamic table creation per dataset**.

We create a SQLite table for each uploaded CSV using sanitized column names 
(spaces replaced with underscores, special characters stripped, names 
prefixed with `col_` if they start with a digit). A separate `datasets` 
metadata table tracks: dataset_id, filename, table_name, row_count, 
column_count, and uploaded_at timestamp.

This gives us fast SQL queries for filtering and aggregation, while 
remaining fully generic — it works with any CSV structure.

---

## Trade-offs

- **We gave up:** Simplicity of blob storage (Option A was easier to implement)
- **We gained:** Query performance — filters and aggregations run as native 
  SQL instead of in-memory pandas operations on full file loads
- **Risk accepted:** Column name sanitization must be thorough to prevent 
  SQL injection via malicious CSV headers; we address this with a 
  strict header-to-SQL-identifier sanitization that allows alphanumeric 
  characters and underscores (see `datasets.py` in the backend)
- **Lesson learned:** EAV looked attractive initially for its flexibility 
  but the query complexity made it unworkable for a dashboard use case

---

## Related

- [ADR 001 — LLM provider](001-llm-provider.md)
- [ADR 003 — Tool-calling pattern](003-tool-use-pattern.md)

### Implementation note

Column safety is enforced in the backend by sanitization helpers (for example `_sanitize_identifier_preserve_case` and related functions in `backend/app/api/routes/datasets.py`), not a single function named `sanitize_column_name`.