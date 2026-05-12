# ADR 001 — LLM Provider Selection

**Date:** May 2026  
**Status:** Decided

---

## Context

DataLens requires an LLM for two features: a chat interface where users ask 
natural language questions about their data, and an executive summary generator. 
Both features require the LLM to call backend functions (tool-calling / 
function-calling) to retrieve actual data before responding — so the LLM cannot 
just hallucinate answers. It must support structured tool-calling reliably.

We needed to pick one provider and commit early because the tool-calling 
integration is deeply embedded in the backend chat endpoint.

---

## Options Considered

**Option A — OpenAI GPT-4o**
- Mature, well-documented function-calling API
- Reliable JSON tool responses with strong structured output
- Widely used, large community, easy to debug
- Cost: paid API, approximately $0.005 per 1K tokens

**Option B — Google Gemini 1.5 Pro**
- Free tier available via university Gemini subscription
- Tool-calling support added recently, less battle-tested
- Documentation less mature than OpenAI
- Risk: inconsistent tool response formatting in early testing

**Option C — Anthropic Claude**
- Excellent reasoning quality
- Tool-use support available but API structure differs from OpenAI
- Would require more custom integration code
- Cost: paid API

---

## Decision

We chose **OpenAI GPT-4o**.

The primary reason is reliability of the function-calling response format. 
GPT-4o consistently returns well-structured tool_calls objects that are easy 
to parse and route to our backend query functions. Given the 2-feature 
requirement (chat + summary) and tight timeline, we prioritized a provider 
with the most stable and documented tool-calling behavior.

---

## Trade-offs

- **We gave up:** Free access (Gemini would have been free via university subscription)
- **We gained:** Reliable, well-documented tool-calling that reduced integration time significantly
- **Risk accepted:** API cost if usage scales up; mitigated by limiting max_tokens and caching profile data
- **Future consideration:** If cost becomes an issue, Gemini's tool-calling has matured and could be a drop-in replacement