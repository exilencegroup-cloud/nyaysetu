# Fast Demo Precedent Search MVP Design

Date: 2026-05-15

## Goal

Build a fast demo MVP for NyaySetu that helps lawyers reduce precedent research time. A lawyer uploads one or more case-related documents, the system extracts the legal profile, searches public case-law sources, and shows ranked matching cases with reasons, important points, differences, and reusable argument value.

This design is intentionally lean. It is not the full case-workspace product yet, but the internal boundaries should leave room for login, case workspaces, saved research, and persistent precedent caching later.

## Approved Product Scope

The MVP should support one impressive workflow:

1. Upload one or more documents for a matter, such as a brief, petition, order, or judgment.
2. Extract the legal issues, key facts, statutes or sections, procedural posture, relief sought, and important arguments.
3. Search public case-law sources live.
4. Fetch top candidate cases.
5. Compare candidates against the uploaded case.
6. Show a research dashboard with ranked matches and explanations.

For the fast demo, the product does not include full login, long-term case workspaces, team accounts, firm libraries, deep persistent caching, or collaboration features.

## Source Scope

The demo targets public-source precedent search across the Supreme Court of India and High Courts.

The first connector should use Indian Kanoon/API-like search where possible because it provides a clearer programmatic search path than brittle page scraping. Court portals can be added later as separate connectors where access and reliability allow.

The UI must not claim exhaustive coverage of all Indian case law. It should say results are based on connected public sources.

## Architecture

The fast demo uses one visible workflow but keeps the internals modular.

### Frontend

The frontend provides:

- Multi-document upload.
- Processing states for extraction, search, comparison, and result preparation.
- A research dashboard with ranked matches on one side and selected-case explanations on the other.
- Empty, loading, partial-success, and error states.

### API Layer

The API layer exposes a research orchestrator endpoint. It receives uploaded documents and coordinates the full research flow:

1. Extract text from uploads.
2. Build the uploaded case profile.
3. Generate public search queries.
4. Search connected public sources.
5. Fetch candidate cases or fragments.
6. Normalize candidate metadata.
7. Rank candidates.
8. Ask AI to explain the strongest matches.
9. Return dashboard-ready JSON.

### AI Layer

AI performs bounded legal-intelligence tasks:

- Extract legal issues, facts, statutes, procedural posture, arguments, relief, and keywords.
- Generate focused public-search phrases from the case profile.
- Compare the uploaded case against candidate cases.
- Explain matching points, differences, important paragraphs, and reusable arguments.

AI should not freely browse or orchestrate the workflow.

### Public Search Connectors

Each source connector should expose a standard interface:

- Accept search queries and optional court filters.
- Return normalized candidate metadata.
- Fetch candidate document text, fragments, or source snippets where available.
- Preserve source URL, source name, court, date, and external document ID.

This lets future connectors be added without changing the dashboard or AI comparison layer.

### Cache

For the demo, caching can be temporary and minimal. It should avoid duplicate fetches within a single run. The module boundaries should make it straightforward to replace this later with a persistent cached precedent database.

## Orchestration Decision

The MVP should use a deterministic backend orchestrator plus bounded AI specialists, not a fully autonomous AI agent.

The orchestrator is normal backend code. It controls ordering, budgets, retries, logging, source tracking, and response shape.

AI is called only for well-scoped tasks:

- Case-profile extraction.
- Search-query generation.
- Candidate comparison.
- Match explanation.

Long term, NyaySetu may add a bounded research-planning agent that can broaden or narrow searches, try alternate legal phrases, or run a second pass. Even then, it should operate through approved connectors, budgets, and logged actions.

## Data Flow

1. User uploads one or more PDFs or text documents.
2. Server extracts text from each document.
3. AI creates a combined `case_profile` containing:
   - facts
   - legal issues
   - statutes or sections
   - procedural posture
   - relief sought
   - important arguments
   - extracted keywords
4. System generates several public-search queries from the profile.
5. Public connector searches the configured source.
6. System fetches top candidate cases or fragments.
7. System normalizes each candidate into:
   - case name
   - court
   - date
   - source name
   - source URL
   - external document ID
   - headline or snippet
   - fetched text or fragments
8. System ranks candidates with hybrid scoring:
   - legal issue similarity
   - factual similarity
   - statute or section overlap
   - court relevance
   - recency where useful
   - reasoning and outcome similarity
9. AI produces match explanations for the top candidates.
10. Frontend renders the research dashboard.

The final result object should include source attribution and confidence warnings.

## Dashboard Output

The dashboard should show:

- Ranked matching cases.
- Overall match score.
- Legal issue match.
- Fact match.
- Statute or section overlap.
- Matching points.
- Differences.
- Important case points.
- Reusable arguments.
- Source links and attribution.
- Confidence or limitation warnings.

The selected match panel should explain why the case is useful, not merely summarize it.

## Error Handling and Limits

If upload or extraction fails, the UI should show a clear error: scanned PDF, corrupted PDF, too large, unsupported file, or extraction failed.

If public search fails, the system should show partial results if any source worked. If no source works, it should show a user-safe failure message and log the technical reason.

If candidate fetch fails, the system should skip that case and continue with the next candidate.

If AI comparison fails for one candidate, the dashboard should still show basic metadata and the search snippet, with the explanation marked unavailable.

For the demo, deep AI comparison should be limited to the top 15 to 30 candidates to control latency and cost.

The dashboard should include a limitation notice: results are based on connected public sources and may not include every relevant precedent.

## Testing

Testing should verify the complete research loop:

- PDF or text upload works for at least one judgment and one lawyer-written brief.
- Extraction creates a structured `case_profile`.
- Search-query generation produces sensible legal search phrases.
- Public-source connector returns candidate cases.
- Candidate normalization creates consistent metadata.
- Ranking selects plausible top matches.
- AI match explanations cite concrete matching points and differences.
- Dashboard renders empty, loading, partial-success, error, and success states.
- Failures in search, fetch, or AI comparison do not crash the whole workflow.

## Demo Success Criteria

The demo succeeds if:

- A lawyer uploads case documents.
- The app finds public Supreme Court or High Court matches from connected sources.
- The top results explain why they match.
- The lawyer can quickly see matching points, important points, differences, and reusable arguments.
- The product feels like it can reduce research time, even while clearly communicating source limits.

## Explicit Non-Goals

The fast demo does not include:

- Full user login.
- Persistent case workspaces.
- Multi-user firm accounts.
- Saved notes and bookmarks.
- Organization-wide precedent libraries.
- Full public-law corpus ingestion.
- Exhaustive nationwide case-law coverage.
- A fully autonomous AI web-browsing agent.

These are candidates for later phases after the demo proves the core research workflow.
