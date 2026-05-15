# NyaySetu Legal Desk Phases 1-5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NyaySetu from the current judgment-analysis assistant into a no-login Legal Desk MVP that supports polished judgment analysis, AI legal triage, prepared case briefs, verified precedent research, and draft-ready legal outputs.

**Architecture:** Keep the current Next.js Pages Router app and add Legal Desk modules beside the existing `lib/ai`, `lib/pdf`, and `components/sections` structure. Early phases store results in browser storage and downloadable files; database-backed login, matter persistence, lawyer marketplace, and team workflows are intentionally excluded until later phases.

**Tech Stack:** Next.js Pages Router, React 18, TypeScript, Tailwind CSS, formidable, pdf-parse, OpenAI chat completions, zod schemas, localStorage/session export, optional public case-law connector, Vitest for unit tests.

---

## Scope Decision

Phases 1-5 are too large for one safe code batch. Implement them as five release slices:

1. **Phase 1:** Current judgment analysis becomes demo-ready.
2. **Phase 2:** AI legal triage.
3. **Phase 3:** Prepared case brief.
4. **Phase 4:** Verified precedent research.
5. **Phase 5:** Drafting assistant.

Do **not** build lawyer marketplace, lawyer profiles, consultation booking, payments, cloud matter tracking, user login, teams, or persistent database-backed workspaces in these phases.

---

## Current Baseline

Already present:

- `pages/index.tsx`: simple home page for judgment upload.
- `pages/upload.tsx`: single PDF upload.
- `pages/api/analyze.ts`: PDF validation, text extraction, AI analysis, and schema validation.
- `pages/results.tsx`: structured judgment result dashboard.
- `components/sections/*`: result sections for facts, issues, arguments, reasoning, risks, reusable arguments.
- `components/sections/ChatPanel.tsx`: Ask AI about analyzed case.
- `pages/compare.tsx` and `pages/comparison-results.tsx`: comparison UI.
- `pages/api/compare.ts`: comparison endpoint exists but uses placeholder PDF extraction and incorrect body parsing.
- `docs/superpowers/specs/2026-05-15-fast-demo-precedent-search-design.md`: precedent-search design exists.

Important constraints:

- No database.
- No auth.
- No persistent matters.
- No real lawyer handoff.
- No implemented precedent-search modules yet.
- No test runner configured yet.

---

## Phase 1: Make Current Judgment Analysis Demo-Ready

**Purpose:** Improve the already-working judgment upload flow so it is credible before adding new Legal Desk features.

**Primary user value:** A junior lawyer can upload one judgment and quickly get a clean, verifiable case note.

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Modify: `pages/index.tsx`
- Modify: `pages/upload.tsx`
- Modify: `pages/results.tsx`
- Modify: `pages/api/analyze.ts`
- Modify: `pages/api/compare.ts`
- Modify: `pages/compare.tsx`
- Modify: `components/sections/ChatPanel.tsx`
- Create: `components/sections/ExportPanel.tsx`
- Create: `components/ui/CopyButton.tsx`
- Create: `lib/export/caseNote.ts`
- Create: `lib/export/__tests__/caseNote.test.ts`
- Create: `pages/api/__tests__/analyze.test.ts`
- Create: `pages/api/__tests__/compare.test.ts`

### Task 1.1: Add Test Tooling

- [ ] Install dev dependencies:

```powershell
npm.cmd install --save-dev vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] Create `vitest.config.ts` with aliases for `@`.

- [ ] Run:

```powershell
npm.cmd run test
```

Expected: test runner starts successfully. It may report no tests until the next task.

- [ ] Commit:

```powershell
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest setup"
```

### Task 1.2: Stabilize Existing Analysis API

- [ ] Add tests for invalid method, missing file, invalid PDF type, and AI failure response in `pages/api/__tests__/analyze.test.ts`.
- [ ] Refactor `pages/api/analyze.ts` so temp file cleanup happens in a `finally` block.
- [ ] Ensure all error responses use one shape:

```ts
{
  success: false,
  error: string,
  message: string,
  retryable: boolean
}
```

- [ ] Run:

```powershell
npm.cmd run test -- pages/api/__tests__/analyze.test.ts
npm.cmd run build
```

- [ ] Commit:

```powershell
git add pages/api/analyze.ts pages/api/__tests__/analyze.test.ts
git commit -m "fix: stabilize judgment analysis API"
```

### Task 1.3: Fix Case Comparison Backend

- [ ] Replace placeholder `extractTextFromPDF` in `pages/api/compare.ts` with formidable + existing `extractPdfText`, `cleanExtractedText`, and `truncateForAI`.
- [ ] Disable Next body parser for `pages/api/compare.ts`.
- [ ] Add tests for two-PDF requirement and successful comparison response.
- [ ] Run:

```powershell
npm.cmd run test -- pages/api/__tests__/compare.test.ts
npm.cmd run build
```

- [ ] Commit:

```powershell
git add pages/api/compare.ts pages/api/__tests__/compare.test.ts
git commit -m "fix: parse PDFs in case comparison API"
```

### Task 1.4: Add Exportable Case Note

- [ ] Create `lib/export/caseNote.ts` to convert `LegalAnalysis` into a clean plain-text/HTML case note.
- [ ] Include sections: snapshot, facts, issues, arguments, reasoning, risks, reusable arguments, and source references.
- [ ] Create `components/sections/ExportPanel.tsx` with copy, print, and download `.txt` controls.
- [ ] Add `ExportPanel` to `pages/results.tsx`.
- [ ] Add `lib/export/__tests__/caseNote.test.ts`.
- [ ] Run:

```powershell
npm.cmd run test -- lib/export/__tests__/caseNote.test.ts
npm.cmd run build
```

- [ ] Commit:

```powershell
git add lib/export components/sections/ExportPanel.tsx pages/results.tsx
git commit -m "feat: export judgment case note"
```

### Task 1.5: Polish Result Usability

- [ ] Add `components/ui/CopyButton.tsx`.
- [ ] Add copy buttons to reusable arguments, risk flags, and key takeaways.
- [ ] Improve `ChatPanel` prompt so it can answer with section references and explicitly says when the answer is not in the analyzed material.
- [ ] Update `pages/index.tsx` to introduce “Analyze Judgment” and “Prepare Legal Desk” as separate future-facing paths, with unbuilt paths disabled or marked as coming next only if needed.
- [ ] Run:

```powershell
npm.cmd run build
```

- [ ] Commit:

```powershell
git add components/ui/CopyButton.tsx components/sections pages/index.tsx pages/results.tsx
git commit -m "feat: improve judgment analysis workflow"
```

**Phase 1 acceptance criteria:**

- Upload judgment flow still works.
- Results are more useful for a real lawyer.
- Case comparison no longer uses placeholder extraction.
- A user can export a usable case note.
- Build passes.

---

## Phase 2: AI Legal Triage

**Purpose:** Let a user explain a legal problem or upload initial documents and receive a structured first-pass triage.

**Primary user value:** “I understand what kind of legal problem I have, what is urgent, what documents are needed, and what to do next.”

**Files:**

- Create: `lib/legal-desk/types.ts`
- Create: `lib/legal-desk/prompts.ts`
- Create: `lib/legal-desk/ai.ts`
- Create: `lib/legal-desk/storage.ts`
- Create: `lib/legal-desk/__tests__/types.test.ts`
- Create: `pages/api/triage.ts`
- Create: `pages/api/__tests__/triage.test.ts`
- Create: `pages/triage.tsx`
- Create: `pages/triage-results.tsx`
- Create: `components/legal-desk/TriageForm.tsx`
- Create: `components/legal-desk/TriageDashboard.tsx`

### Task 2.1: Define Triage Data Contract

- [ ] Create zod schemas for:
  - `TriageInput`
  - `TriageResult`
  - `LegalCategory`
  - `UrgencyLevel`
  - `DocumentChecklistItem`
  - `NextStep`
- [ ] Required triage result fields:
  - summary
  - legal category
  - urgency
  - jurisdiction clues
  - limitation/deadline warnings
  - required documents
  - missing information questions
  - recommended next steps
  - whether lawyer help is recommended
  - confidence warnings
- [ ] Test valid and invalid triage payloads.

### Task 2.2: Add Triage AI Helper

- [ ] Create `lib/legal-desk/prompts.ts` with a bounded triage prompt.
- [ ] Rules:
  - no legal advice guarantee
  - no fabricated law or deadlines
  - state uncertainty clearly
  - output strict JSON
  - recommend lawyer help for urgent/high-risk matters
- [ ] Create `lib/legal-desk/ai.ts` with `generateTriage(input)`.

### Task 2.3: Add Triage API

- [ ] Create `pages/api/triage.ts`.
- [ ] Accept JSON input first:

```ts
{
  problem: string,
  location?: string,
  language?: "english" | "hindi" | "mixed"
}
```

- [ ] Add optional document upload in a later task if needed; do not block text triage.
- [ ] Return:

```ts
{
  success: true,
  data: TriageResult
}
```

### Task 2.4: Add Triage UI

- [ ] Create `/triage` with a plain-language form.
- [ ] Create `/triage-results` with:
  - category card
  - urgency badge
  - document checklist
  - next steps
  - missing questions
  - lawyer help recommendation
  - “Create case brief from this” button for Phase 3
- [ ] Store triage result in `localStorage`.

**Phase 2 acceptance criteria:**

- A user can describe a problem and receive structured triage.
- The output does not pretend to replace a lawyer.
- Triage can become the input to a case brief.
- Build and tests pass.

---

## Phase 3: Prepared Case Brief

**Purpose:** Convert messy documents and triage into a lawyer-facing brief.

**Primary user value:** “Before I speak to a lawyer or senior, I have a clean matter brief.”

**Files:**

- Create: `components/ui/MultiFileUpload.tsx`
- Create: `lib/legal-desk/documentText.ts`
- Modify: `lib/legal-desk/types.ts`
- Modify: `lib/legal-desk/prompts.ts`
- Modify: `lib/legal-desk/ai.ts`
- Create: `pages/api/case-brief.ts`
- Create: `pages/brief.tsx`
- Create: `pages/brief-results.tsx`
- Create: `components/legal-desk/BriefDashboard.tsx`
- Create: `lib/export/legalBrief.ts`
- Create: `lib/export/__tests__/legalBrief.test.ts`

### Task 3.1: Add Multi-Document Text Extraction

- [ ] Build reusable multi-file upload component.
- [ ] Build `extractUploadedDocuments(files)` helper for PDF text extraction and text normalization.
- [ ] Support PDFs first.
- [ ] Return per-document extraction errors instead of failing the whole run where possible.

### Task 3.2: Define Case Brief Schema

- [ ] Add `CaseBriefSchema` with:
  - matter summary
  - parties
  - facts timeline
  - legal issues
  - relief/remedy sought
  - documents reviewed
  - missing documents
  - risk points
  - questions for client
  - questions for lawyer
  - first-call agenda
  - next action checklist
  - source references

### Task 3.3: Add Case Brief API

- [ ] Create `pages/api/case-brief.ts`.
- [ ] Accept:
  - optional triage JSON
  - one or more uploaded documents
- [ ] Generate source-grounded brief.
- [ ] Include warnings for scanned/unreadable documents.

### Task 3.4: Add Case Brief UI

- [ ] Create `/brief` for upload + optional triage import.
- [ ] Create `/brief-results` with a lawyer-facing dashboard.
- [ ] Add export:
  - copy brief
  - print brief
  - download `.txt`

**Phase 3 acceptance criteria:**

- A user can upload documents and get a structured case brief.
- The brief clearly lists missing documents and questions.
- The brief can be exported and shared manually.
- No login or cloud matter storage is required.

---

## Phase 4: Verified Precedent Research

**Purpose:** Add public-source precedent research that connects case facts/issues to similar Indian cases with verification.

**Primary user value:** “I can find helpful, harmful, distinguishable, and landmark cases with reasons and source links.”

**Files:**

- Create: `lib/research/types.ts`
- Create: `lib/research/prompts.ts`
- Create: `lib/research/ai.ts`
- Create: `lib/research/ranking.ts`
- Create: `lib/research/sources/types.ts`
- Create: `lib/research/sources/indianKanoon.ts`
- Create: `lib/research/orchestrator.ts`
- Create: `pages/api/research.ts`
- Create: `pages/research.tsx`
- Create: `pages/research-results.tsx`
- Create: `components/research/ResearchDashboard.tsx`
- Create: `lib/research/__tests__/types.test.ts`
- Create: `lib/research/__tests__/ranking.test.ts`
- Create: `lib/research/__tests__/orchestrator.test.ts`
- Create: `lib/research/sources/__tests__/indianKanoon.test.ts`

### Task 4.1: Implement Research Types

- [ ] Define:
  - `CaseProfile`
  - `CandidateCase`
  - `ResearchMatch`
  - `ResearchResult`
  - `MatchClassification`
- [ ] Match classifications:
  - helpful
  - harmful
  - distinguishable
  - landmark
  - uncertain

### Task 4.2: Add Source Connector Interface

- [ ] Implement source connector interface:

```ts
interface CaseLawSource {
  search(query: string): Promise<CandidateCase[]>;
  fetch(id: string): Promise<CandidateCase>;
}
```

- [ ] Add Indian Kanoon-style connector behind `INDIAN_KANOON_API_TOKEN`.
- [ ] Preserve source URL, title, court, date, snippets, and external ID.

### Task 4.3: Add Deterministic Ranking

- [ ] Score candidates using:
  - legal issue overlap
  - facts overlap
  - statute overlap
  - court relevance
  - recency where useful
- [ ] Limit expensive AI comparison to top candidates.

### Task 4.4: Add Research Orchestrator

- [ ] Inputs:
  - case brief
  - uploaded documents
  - optional triage
- [ ] Steps:
  - build case profile
  - generate search queries
  - search connector
  - deduplicate cases
  - rank candidates
  - explain top matches
  - classify helpful/harmful/distinguishable/landmark

### Task 4.5: Add Research UI

- [ ] Create `/research`.
- [ ] Create `/research-results`.
- [ ] Show:
  - ranked list
  - classification badges
  - why useful
  - why risky
  - differences
  - reusable argument
  - source links
  - confidence warning

**Phase 4 acceptance criteria:**

- User can run precedent research from a brief or documents.
- Results are source-attributed.
- Helpful/harmful/distinguishable split is visible.
- UI does not claim exhaustive legal coverage.

---

## Phase 5: Drafting Assistant

**Purpose:** Generate draft-ready legal material from triage, case brief, and verified research.

**Primary user value:** “I can turn prepared facts and verified cases into a usable first draft.”

**Files:**

- Create: `lib/drafting/types.ts`
- Create: `lib/drafting/prompts.ts`
- Create: `lib/drafting/ai.ts`
- Create: `lib/drafting/templates.ts`
- Create: `lib/drafting/__tests__/types.test.ts`
- Create: `pages/api/draft.ts`
- Create: `pages/api/__tests__/draft.test.ts`
- Create: `pages/draft.tsx`
- Create: `pages/draft-results.tsx`
- Create: `components/drafting/DraftIntentPicker.tsx`
- Create: `components/drafting/DraftPreview.tsx`
- Create: `components/drafting/CitationChecklist.tsx`
- Create: `lib/export/draft.ts`

### Task 5.1: Define Draft Types and Supported Drafts

- [ ] Support first document intents:
  - legal notice
  - reply to legal notice
  - bail argument note
  - cheque bounce notice/reply
  - consumer complaint outline
  - short hearing note
- [ ] Define `DraftResult` with:
  - title
  - draft sections
  - citations used
  - citations needing manual verification
  - missing facts
  - risk warnings
  - suggested lawyer review checklist

### Task 5.2: Add Drafting Prompt Rules

- [ ] Draft only from supplied triage, brief, and verified research.
- [ ] Mark unsupported claims as “needs verification.”
- [ ] Never invent citations.
- [ ] Keep draft practical, editable, and jurisdiction-aware.
- [ ] Include disclaimer that final filing should be reviewed by an advocate.

### Task 5.3: Add Draft API

- [ ] Create `pages/api/draft.ts`.
- [ ] Accept:

```ts
{
  intent: DraftIntent,
  triage?: TriageResult,
  brief?: CaseBrief,
  research?: ResearchResult,
  userInstructions?: string
}
```

- [ ] Return strict `DraftResult`.

### Task 5.4: Add Draft UI

- [ ] Create `/draft`.
- [ ] Let user choose draft type.
- [ ] Let user use stored triage/brief/research from browser storage.
- [ ] Create `/draft-results`.
- [ ] Add:
  - editable preview
  - copy section
  - export text
  - citation checklist
  - missing facts warnings

**Phase 5 acceptance criteria:**

- User can generate draft-ready material from prepared data.
- Draft distinguishes verified citation-supported points from unverified content.
- Draft is exportable.
- Build and tests pass.

---

## Suggested Release Order

1. Ship Phase 1.
2. Demo and collect feedback.
3. Ship Phase 2.
4. Ship Phase 3.
5. Connect Phase 3 output into Phase 4.
6. Add Phase 5 only after brief and research outputs are stable.

The product should feel useful after each phase. Do not wait until Phase 5 to demo.

---

## Later Phases Explicitly Deferred

### Phase 6: Matter Lite Without Login

- Browser-based saved matter bundles.
- Export/import matter JSON.
- Downloadable case packets.
- No account system.

### Phase 7: Lawyer Handoff

- Prepared brief for lawyer.
- Manual pilot lawyer list.
- Request review.
- Fixed-scope consult packages.
- No open marketplace yet.

### Phase 8: Login and Persistent Matters

- Auth.
- Cloud matter storage.
- Client/lawyer roles.
- Team workspace.
- Hearing reminders.
- Payment flow.

---

## Verification Before Each Phase Completion

- [ ] Run unit tests for the phase.
- [ ] Run:

```powershell
npm.cmd run build
```

- [ ] Manually test the main flow in browser.
- [ ] Confirm no UI claims that NyaySetu replaces a lawyer.
- [ ] Confirm source/citation warnings are visible where relevant.
- [ ] Confirm no lawyer marketplace, login, payment, or cloud persistence has slipped into Phases 1-5.

---

## Implementation Recommendation

Use separate detailed execution plans per phase:

- `2026-05-15-legal-desk-phase-1-judgment-analysis.md`
- `2026-05-15-legal-desk-phase-2-triage.md`
- `2026-05-15-legal-desk-phase-3-case-brief.md`
- `2026-05-15-legal-desk-phase-4-precedent-research.md`
- `2026-05-15-legal-desk-phase-5-drafting.md`

Start with Phase 1. It improves the current product and creates the testing/export foundation needed by all later phases.
