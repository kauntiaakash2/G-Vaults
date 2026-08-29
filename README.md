# SIH 26190 — Case Workspace

The repository provides a runnable TypeScript monorepo with a Next.js frontend, NestJS API, PostgreSQL/Prisma data model, MinIO object storage, JWT authentication, role/resource authorization, document management, OCR/text extraction, permission-scoped search, and prototype summaries. Documents are encrypted with AES-256-GCM before MinIO storage, fixity-checked with SHA-256, append-only by version through normal application APIs, and recorded in a hash-linked audit trail. This is a hackathon MVP, not a production-ready legal records system; see the verification report for limitations.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Docker with Compose

## First run

```bash
cp .env.example .env
npm install
npm run infra:up
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Open:

- Web: http://localhost:3000
- API Swagger: http://localhost:3001/api/docs
- MinIO console: http://localhost:9001

The default development login is `admin@sih.local` / `ChangeMe123!`. Change all example secrets and seed passwords outside local development.

## Useful commands

```bash
npm run build
npm test
npm run test:e2e
npm run test:web
npm run lint
npm run infra:down
```

The Playwright login test expects the database to be migrated and seeded and both applications to be running. Set `PLAYWRIGHT_START_SERVERS=true` to let its configuration start them, or run `npm run dev` in another terminal.

## API routes

| Method | Route | Access |
| --- | --- | --- |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |
| GET/POST | `/api/users` | Admin |
| GET | `/api/departments` | Authenticated |
| POST | `/api/departments` | Admin |
| GET/POST | `/api/cases` | Authenticated / role-limited creation |
| GET | `/api/cases/:id` | Resource permission check |
| GET/POST | `/api/documents` | Case members / permitted roles |
| GET | `/api/documents/:id` | VIEW permission |
| GET | `/api/documents/:id/download` | DOWNLOAD permission |
| POST/GET | `/api/documents/:id/versions` | EDIT permission for create; VIEW for history |
| GET | `/api/documents/:id/verify` | VIEW permission; records integrity result |
| GET/POST | `/api/documents/:id/access` | SHARE permission |
| DELETE | `/api/documents/:id/access/:permissionId` | SHARE permission |
| GET | `/api/documents/:id/audit` | VIEW permission |
| GET | `/api/search?q=...` | Authenticated, database-scoped to authorized documents |
| GET | `/api/documents/:id/intelligence` | VIEW permission |
| POST | `/api/documents/:id/process` | EDIT permission; queues/runs extraction |

See [docs/access-control.md](docs/access-control.md) for the role/resource policy. `npm run db:deploy` applies all checked-in migrations; use `npm run db:migrate -- --name <name>` when authoring a new migration. The optional FastAPI worker lives in [services/ocr](services/ocr); start it with `docker compose --profile ocr up -d` for scanned-PDF/image OCR. The API remains usable when it is unavailable.

Use [docs/demo-runbook.md](docs/demo-runbook.md) for the fictional accounts, acceptance story, tamper demonstration, and production deployment narrative.
See [docs/implementation-verification.md](docs/implementation-verification.md) for independently checked claims and [docs/implementation-status.md](docs/implementation-status.md) for the current factual status.

## Project layout

```text
apps/web          Next.js application
apps/api          NestJS API and Prisma schema
packages/shared   Shared API-facing TypeScript types
services/ocr      Token-authenticated FastAPI OCR/text extraction worker
infra             Deployment notes/placeholders
docs              Verification, architecture, threat model and operating notes
```
