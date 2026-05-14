# Architecture Decision Records (ADRs)

Short, durable notes on major DataLens design choices. Each ADR follows the same shape: context, options, decision, and trade-offs.

| ADR | Topic |
|-----|--------|
| [001 — LLM provider](001-llm-provider.md) | OpenAI GPT-4o vs alternatives for chat and summary |
| [002 — SQLite schema](002-sqlite-schema.md) | Dynamic per-dataset tables vs blob or EAV storage |
| [003 — Tool-calling pattern](003-tool-use-pattern.md) | Purpose-built tools vs raw SQL from the LLM |

When you change behavior that contradicts an ADR, prefer updating the ADR (status + new section) rather than letting docs drift from the code.
