# Call Topic Insights

An internal web app that shows **why clients contact support**. Support notes are grouped into topics
(parent topic → subtopic), and teams can follow topic trends, read the underlying notes, generate
AI summaries of a topic, review newly emerging topics, and publish changes to the topic taxonomy.

All data in this repo is deterministic **sample data**: no real client notes. The same note always has
the same ID, date, text and topic, so numbers match across pages and tests.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Test accounts](#test-accounts)
- [Configuration](#configuration)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Authentication](#authentication)
- [API reference](#api-reference)
- [AI Topic Insights](#ai-topic-insights)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Status and roadmap](#status-and-roadmap)

For architecture and a service-by-service breakdown, see [`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md).

## Features

| Page | What you can do |
|---|---|
| **Overview** | Total notes, top topics, fastest-growing subtopics, share of notes without a topic |
| **Topics / Topic detail** | Browse parent topics and subtopics, see trends and example notes, export CSV, subscribe to a digest |
| **Support notes** | Paged list filtered by topic and classification status; open any note in a side drawer; report a wrong classification |
| **Search** | Search notes in plain words |
| **AI Topic Insights** | Generate recurring issues (with exact shares and source notes), a summary and hypotheses for the current topic and filters |
| **Emerging topics** *(editor)* | Watch the unassigned-notes rate, run re-clustering, review candidate topics, inspect and retry failed background tasks |
| **Label management** *(editor)* | Rename, move or merge topics in a draft, review changes, publish a new taxonomy version, activate it |

Every page shares the same filters (**date range**, **taxonomy version**, **team**). They live in the URL,
so a filtered view can be shared or bookmarked.

## Tech stack

| Layer | Libraries |
|---|---|
| Monorepo | npm workspaces: `shared`, `backend`, `frontend` |
| Frontend | React 18, TypeScript 5.6, Vite 5, react-router-dom 6, TanStack Query 5, hand-written CSS with design tokens, SVG charts |
| Backend | Node + Express 4, TypeScript (run with `tsx`), JSON-file persistence |
| AI | OpenAI Chat Completions (optional, default `gpt-4o-mini`); rule-based fallback without a key |
| Tests | Vitest + Supertest (API), Playwright (end-to-end) |

## Quick start

Requires **Node 20.12 or later** (`node -v`). Older Node versions run, but they ignore `backend/.env`.

```bash
npm install
cp backend/.env.example backend/.env   # optional: add OPENAI_API_KEY here
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:4000 (health check: http://localhost:4000/api/health)

The Vite dev server proxies `/api` to the API, so you only need to open the web app.

## Test accounts

Sign in with an email and password. In the dev build the sign-in page also lists these accounts with a
**Use** button that fills them in.

| Name | Role | Email | Password | Data access |
|---|---|---|---|---|
| Alex Chen | Editor | `alex.chen@example.com` | `Editor#2026` | All teams; can review emerging topics and publish taxonomy changes |
| Jordan Lee | Viewer | `jordan.lee@example.com` | `Viewer#2026` | Money Movement only; read-only |

These are local test credentials only. Production sign-in should use company SSO (see [Authentication](#authentication)).

## Configuration

Settings are read from `backend/.env` (copy `backend/.env.example`). `backend/.env` is git-ignored;
never commit it.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `OPENAI_API_KEY` | *(empty)* | Turns on OpenAI for AI Topic Insights. Empty = rule-based summaries |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used for summaries |
| `OPENAI_TIMEOUT_MS` | `20000` | Timeout per OpenAI call |
| `CTI_SESSION_SECRET` | dev default | Secret that signs session tokens. **Required** when `NODE_ENV=production` |
| `CTI_PERSIST` | `true` | `false` keeps state in memory only |

Demo and test switches (all optional):

| Variable | Effect |
|---|---|
| `CTI_AI_DELAY_MS=700` | Delay per AI generation step |
| `CTI_AI_FAIL=1` | Force AI generation to fail |
| `CTI_TASK_TICK_MS=400` | Background task progress interval |
| `CTI_DISCOVERY_FAIL=1` | Make topic discovery fail (`DSC-118`) |
| `CTI_PREP_TICK_MS=1000` | Taxonomy preparation step interval |
| `CTI_PREP_FAIL=1` | Make v8 classifier validation fail (`PRP-207`) |

The frontend dev server reads `API_PORT` (default 4000) and `WEB_PORT` (default 5173) from the environment.

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `npm run dev` | Start API and web app together |
| `npm test` | Backend API tests (Vitest + Supertest) |
| `npm run typecheck` | TypeScript check of backend and frontend |
| `npm run build` | Production build of the web app (`frontend/dist`) |
| `npm run e2e:install` | Once: download the Playwright Chromium browser |
| `npm run e2e` | End-to-end tests; starts its own servers on ports 4300/5300, so it can run next to `npm run dev` |

## Project structure

```
call-topic-insights/
├── shared/src/            Types shared by API and web app (request/response contracts)
├── backend/
│   ├── src/
│   │   ├── index.ts       Loads backend/.env, starts the server
│   │   ├── app.ts         Express app: routes, auth middleware, error handler
│   │   ├── auth.ts        Test accounts, password check, session tokens, role checks
│   │   ├── filters.ts     Validates range / version / team for every request
│   │   ├── data/          Sample data generator, dates, persisted state
│   │   ├── routes/        One router per service (core, notes, insights, emerging, labels)
│   │   └── services/      Business logic per service, plus llm.ts (OpenAI client)
│   ├── tests/             API tests
│   └── data/state.json    Saved state (created on first change; git-ignored)
├── frontend/src/
│   ├── api/client.ts      fetch wrapper, session token storage
│   ├── auth/              AuthContext (sign in / out, session expiry)
│   ├── hooks/             useFilters (URL filters), useMeta
│   ├── pages/             One file per route
│   ├── components/        Layout, drawer, dialogs, charts, and per-feature folders
│   └── styles/            tokens.css + one stylesheet per feature
├── e2e/                   Playwright config and journey tests
└── docs/ARCHITECTURE.md   Service ownership and cross-service contracts
```

## Authentication

1. The sign-in page posts `{ email, password }` to `POST /api/auth/login`.
2. The API checks the password against a stored **scrypt** hash. Wrong password and unknown email return
   the same `401` message. After 5 failed attempts an email is locked for 5 minutes (`429`).
3. On success it returns a session token: `<userId>.<expiresAt>.<HMAC-SHA256 signature>`, valid for 12 hours.
   Tokens are stateless, so they survive API restarts.
4. The web app stores the token in `localStorage` and sends `Authorization: Bearer <token>` on every call.
   Any `401` signs the user out and the sign-in page says the session has ended.
5. `requireEditor` protects editor-only actions. Viewers only see data for their own team; other teams
   return `403 forbidden_team`.

For production, replace the password check with company SSO (OIDC) and keep the same middleware shape:
verify the token, then read the user's role and teams from its claims.

## API reference

All endpoints are under `/api`. Everything except `/health` and `/auth/login` needs a session token.
Most `GET` endpoints accept the shared filters `range`, `version` and `team` as query parameters.

| Area | Endpoints |
|---|---|
| Auth & core | `POST /auth/login` · `GET /me` · `GET /meta` · `GET /overview` |
| Topics & notes | `GET /topics` · `GET /topics/:topicId` · `GET /notes` · `GET /notes/:id` · `POST /notes/:id/reports` · `GET /search` · `POST /exports` · `POST /digests` · `DELETE /digests` |
| AI insights | `GET /insights/scope` · `GET /insights/latest` · `POST /insights` · `GET /insights/:id` · `POST /insights/:id/feedback` · `POST /insights/:id/reports` |
| Emerging topics | `GET /emerging` · `GET /candidates/:id` · `POST /candidates/:id/decision` · `POST /discovery/run` · `GET /tasks` · `POST /tasks/:id/retry` |
| Label management | `GET /taxonomy/tree` · `GET /taxonomy/topics/:id` · `GET /taxonomy/compare` · `GET/POST /drafts` · `PATCH/DELETE /drafts/:id` · `GET /versions` · `POST /versions/publish` · `POST /versions/:id/activate` · `POST /versions/:id/retry-preparation` |
| Dev only | `POST /dev/reset` (not available when `NODE_ENV=production`) |

Errors always look like `{ "error": { "code": "...", "message": "..." } }`.

Example:

```bash
TOKEN=$(curl -s localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alex.chen@example.com","password":"Editor#2026"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:4000/api/overview?range=30d -H "Authorization: Bearer $TOKEN"
```

## AI Topic Insights

1. The user clicks **Generate AI Insights** on a topic. The API starts a job and the page polls it.
2. Notes in scope (topic + filters) are collected. Fewer than 40 notes → "not enough evidence".
3. Up to 400 notes are sampled evenly across the date range.
4. **Recurring issues, their shares and their source notes are computed in code**, never by the model.
5. If `OPENAI_API_KEY` is set, only the issue list and up to 60 redacted excerpts (240 characters each) are
   sent to OpenAI, which writes a 1–2 sentence summary and 2 hypotheses. No note IDs or client details are sent.
   Without a key, the summary and hypotheses are rule-based.
6. Timeouts and API errors show a failed state with a code (`AI-TIMEOUT`, `AI-NETWORK`, `AI-HTTP-xxx`, `AI-PARSE`) and a Retry button.
7. If the filters change afterwards, the result is marked out of date until regenerated.

## Testing

- **API tests** (`npm test`): 62 tests covering auth, filters and permissions, overview totals, topics,
  notes, AI insight jobs, emerging topics and taxonomy publishing.
- **End-to-end tests** (`npm run e2e`): 6 Playwright journeys:
  1. Sign in with email and password, wrong password rejected, session survives reload
  2. Overview → topic → notes → note drawer → report → back
  3. Generate AI insights → open a source note → filters change → regenerate → view supporting notes
  4. Viewer is limited to their team and sees no editing actions
  5. Emerging topic → add to draft → review changes → publish → activate
  6. Failed background task → inspect error → retry

## Troubleshooting

| Problem | Fix |
|---|---|
| "Can't reach the API" on sign-in | Start the API (`npm run dev`) and check port 4000 is free |
| AI insights still look rule-based after adding a key | Check the key is in `backend/.env` (not `.env.example`), restart `npm run dev`, and use Node 20.12+ |
| AI insights fail with `AI-HTTP-401` | The OpenAI key is invalid or revoked |
| "Too many failed attempts" | Wait 5 minutes, or restart the API |
| Want to start from clean data | Stop the API and delete `backend/data/state.json` |
| `npm run e2e` says the browser is missing | Run `npm run e2e:install` once |

## Status and roadmap

- [x] Project setup, sign-in with test accounts, shared filters, Overview
- [x] Topics, topic detail, support notes + note drawer, search, export and digest
- [x] AI Topic Insights (rule-based or OpenAI)
- [x] Emerging topics, background tasks, label management, publish and activate
- [x] API and end-to-end tests for the main journeys
- [ ] Real topic discovery pipeline (embeddings, UMAP, HDBSCAN, KNN classifier)
- [ ] Company SSO instead of test passwords
- [ ] Taxonomy moves and merges applied to note data after activation (today only renames take effect)
- [ ] Frontend component tests (Vitest + React Testing Library)

See [`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md) for the full system overview (architecture, every service and its tech stack)
and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for coding conventions and cross-service contracts.
