# ADR 003 — LLM Tool-Calling Pattern for Chat Interface

**Date:** May 2026  
**Status:** Decided

---

## Context

The DataLens chat interface lets users ask natural language questions about 
their uploaded dataset — for example, "which education level spends the most 
on wine?" or "what is the average income of customers who accepted campaign 5?"

The LLM cannot answer these questions from memory — it has no knowledge of 
the user's specific dataset. It must query the actual data. We needed to 
design a tool-calling architecture that lets the LLM retrieve real data 
from our backend before composing its answer.

The project specification explicitly requires the tool-use / function-calling 
pattern, but the design of the tools (how many, what they do, how results 
are returned) was our decision to make.

---

## Options Considered

**Option A — Single generic SQL tool**
- One tool: execute_sql(query: str)
- LLM writes raw SQL, we execute it, return results
- Maximum flexibility
- Problem: LLM-generated SQL is unpredictable and potentially unsafe. 
  Allowing arbitrary SQL execution on user data is a security risk. 
  Also, GPT-4o sometimes generates incorrect SQL for complex aggregations.

**Option B — Three purpose-built tools**
- query_data(dataset_id, filters, group_by, aggregate_column, aggregate_fn)
- get_statistics(dataset_id, column)
- get_top_values(dataset_id, column, n)
- LLM picks the right tool and fills in parameters
- We control the actual query logic in Python/pandas
- Safer, more predictable, easier to test

**Option C — Pre-computed answer cache**
- Pre-compute all likely answers at upload time
- LLM just retrieves from cache
- Problem: Cannot anticipate all possible user questions. 
  Cache would miss any novel question.

---

## Decision

We chose **Option B — Three purpose-built tools**.

Each tool maps to a distinct type of question users ask:
- `get_statistics` handles "what is the average/min/max of X"
- `get_top_values` handles "which category has the most/least of X"
- `query_data` handles grouped aggregations like "X by Y"

The LLM receives tool definitions in OpenAI's function-calling format. 
When it calls a tool, our backend executes the corresponding pandas 
operation against the SQLite dataset and returns structured JSON results. 
The LLM then composes a natural language answer grounded in those results.

---

## Trade-offs

- **We gave up:** Flexibility of raw SQL (a user cannot ask arbitrarily 
  complex queries that fall outside our 3 tool shapes)
- **We gained:** Security (no SQL injection risk), predictability 
  (tool outputs are always well-structured JSON), and testability 
  (each tool function has its own pytest test)
- **Edge case identified:** If a user asks a question that requires 
  joining two columns in a way none of our 3 tools support, the LLM 
  gracefully responds that it cannot compute that specific combination 
  rather than returning wrong data
- **Future improvement:** A fourth tool — compute_correlation(col1, col2) 
  — would handle scatter plot questions more precisely

