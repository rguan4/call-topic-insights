# Architecture and conventions

## Layout
- `shared/src/*.ts` — type-only contracts. `index.ts` holds core types and re-exports one file per service.
- `backend/src/` — Express API. `routes/<service>.ts` + `services/<service>.ts` per service, mounted in `app.ts`.
- `frontend/src/` — React app. One page per route in `pages/`, feature components in `components/<service>/`, one CSS file per service in `styles/`.

## Services and ownership
| Service | Shared types | Backend | Frontend | CSS |
|---|---|---|---|---|
| Core (overview, meta, auth, filters) | `index.ts` | `routes/core.ts`, `services/overview.ts`, `services/metrics.ts`, `filters.ts`, `auth.ts` | `pages/Overview.tsx`, `components/*` (shared) | `app.css` |
| Notes & topics | `notes.ts` | `routes/notes.ts`, `services/notes.ts`, `services/topics.ts`, `services/search.ts` | `pages/Topics.tsx`, `pages/TopicDetail.tsx`, `pages/Notes.tsx`, `pages/Search.tsx`, `components/topics/*`, `components/notes/*` | `styles/notes.css` |
| AI insights | `insights.ts` | `routes/insights.ts`, `services/insights.ts`, `services/llm.ts` | `components/ai/*` | `styles/ai.css` |
| Emerging topics | `emerging.ts` | `routes/emerging.ts`, `services/emerging.ts` | `pages/Emerging.tsx`, `components/emerging/*` | `styles/emerging.css` |
| Label management | `labels.ts` | `routes/labels.ts`, `services/labels.ts` | `pages/Labels.tsx`, `components/labels/*` | `styles/labels.css` |

State lives in `backend/src/data/state.ts`; each service owns one slice (see the comment there).

## Cross-service contracts
- Note drawer: `useNoteDrawer().openNote(id, { version })` from `components/NoteDrawer.tsx`; API `GET /api/notes/:id`, `POST /api/notes/:id/reports`.
- AI → Notes: "View all supporting notes" links to `/notes?topic=&sub=&insight=<id>&issue=<index>`; the notes list calls `findingNoteIds()` from `services/insights.ts`.
- Topic detail renders `<AiInsightsPanel scope={...} />` from `components/ai/AiInsightsPanel.tsx`.
- Emerging → Labels: candidate decisions call `addDraftChange()`; removing a draft change calls listeners registered with `onDraftChangeRemoved()`.
- Overview / sidebar: `candidatesNeedingReview()` (emerging) and `draftChangeCount()` (labels). After any mutation that changes them, the UI invalidates the `['meta']` and `['overview']` queries.

## Conventions
- Filters (`range`, `version`, `team`) come from `useFilters()` and stay in the URL. Every API call that depends on scope passes them; the backend validates with `parseFilters()` (viewers are limited to their team).
- Errors: throw `HttpError(status, code, message)`; the UI shows `ErrorState`, `EmptyState`, `PageSkeleton` from `components/States.tsx`.
- Editors only: wrap mutating routes with `requireEditor`; hide or disable edit actions for viewers in the UI.
- Confirm before publishing, activating or reprocessing (`components/ConfirmDialog.tsx`). Use `useToast()` for completion feedback.
- Units: always "support notes"; label denominators ("41% of 400 sampled notes") and comparison periods.
- Accessibility: real buttons and links, labels on every control, visible focus, dialogs trap focus and restore it.
- Tests: Vitest + Supertest in `backend/tests/<service>.test.ts`. Run `npm test` and `npm run typecheck` from the repo root.
