# G-Vaults — SIH 26190 Secure Case Workspace

G-Vaults is a secure document, evidence and case-management prototype for **SIH 2026 Problem Statement 26190**. It provides a permission-scoped workspace for investigation and legal records, with encrypted object storage, document fixity verification, preserved versions, access grants, provenance, legal holds, OCR and authorized search.

The repository is a **hardened hackathon MVP**, not a production-ready government records system. Controls such as KMS/HSM key management, malware quarantine, storage-enforced WORM retention, federated identity/MFA, protected audit archives and tested disaster recovery remain future production work.

## Current implementation

### Identity and authorization

- JWT authentication with bcrypt password hashes and inactive-user rejection.
- Role-based API guards plus case membership and document-resource authorization.
- User/department grants for `VIEW`, `DOWNLOAD`, `EDIT`, `SHARE` and `APPROVE`.
- Grant activation, optional expiry, grant reason, revoker and revocation reason.
- Immediate revocation because permissions are read from PostgreSQL on every request, not embedded in JWTs.
- Permission-scoped search that filters in the database before returning titles, snippets or metadata.
- Separation of duties: `ADMIN` manages the platform but does not automatically access or upload evidence.

### Evidence and records

- AES-256-GCM encryption before document bytes enter MinIO.
- SHA-256 fixity recorded independently for every version.
- Generated storage keys; client filenames never determine object paths.
- Application-level append-only versions with `ORIGINAL`, `REVISION`, `DERIVED` and `REDACTED` semantics.
- Parent/source version relationships and authoritative/non-authoritative metadata.
- Prototype classifications: `INTERNAL`, `RESTRICTED`, `CONFIDENTIAL` and `HIGHLY_RESTRICTED`.
- Controlled document-type taxonomy for investigation/legal records.
- Logical record lifecycle from draft through declared record, archive and disposition.
- Legal holds that block disposition and record the denied attempt.
- Technical custody/provenance events kept distinct from the security audit trail.

### Retrieval and intelligence

- Protected preview and download without exposing public MinIO URLs.
- Historical-version preview, download, verification and text processing.
- Text and Markdown extraction.
- PyMuPDF/PaddleOCR worker integration for PDF and image processing.
- Search across titles, case numbers and current/historical OCR text.
- Separate extractive prototype summaries that never modify source evidence.
- OCR/summary failures do not prevent access to the original file.

### Audit and interface

- Hash-linked security audit events for login, access, denial, upload, version, download, integrity, grant/revoke, OCR and record actions.
- Next.js operational interface for dashboards, cases, documents, versions, access, provenance, legal holds, audit and search.
- Responsive navigation and permission-aware controls; backend authorization remains authoritative.
- Swagger/OpenAPI contract at `/api/docs`.

## Architecture

```text
Browser
   ↓
Next.js Web
   ↓ Bearer JWT / JSON / multipart
NestJS API
   ├── Prisma → PostgreSQL
   ├── StorageService → private MinIO bucket
   ├── EncryptionService → AES-256-GCM
   ├── AuditService / CustodyService
   └── OCR client → FastAPI → PyMuPDF / PaddleOCR
```

PostgreSQL is authoritative for identities, current permissions, metadata, lifecycle state, fixity, OCR text, audit and provenance. MinIO stores encrypted source objects. The OCR worker extracts derived text but does not make user-authorization decisions.

## Repository layout

```text
.
├── apps/
│   ├── api/                 NestJS API, Prisma schema and tests
│   └── web/                 Next.js application and Playwright tests
├── packages/
│   └── shared/              Shared API-facing TypeScript types
├── services/
│   └── ocr/                 Token-authenticated FastAPI OCR worker
├── docs/                    Architecture, security and phase reports
├── infra/                   Deployment notes/placeholders
├── docker-compose.yml       PostgreSQL, MinIO and optional OCR services
├── .env.example             Local configuration template
└── package.json             Monorepo scripts
```

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Docker Engine or Docker Desktop with Compose

The project has been exercised with Node.js 24, but the configured minimum is Node.js 20.

## Local setup

From the repository root:

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

| Service | Address |
| --- | --- |
| Web application | http://localhost:3000 |
| Swagger/OpenAPI | http://localhost:3001/api/docs |
| MinIO API | http://localhost:9000 |
| MinIO console | http://localhost:9001 |

The default local credentials come from `.env`:

- Administrator: `admin@sih.local`
- Department Head: `head@sih.local`
- Investigator A: `investigator.a@sih.local`
- Investigator B: `investigator.b@sih.local`
- Auditor: `auditor@sih.local`
- Default example password: `ChangeMe123!`

These are fictional development accounts. Replace every example password, JWT secret, MinIO credential, OCR token and encryption key outside local development.

### OCR worker

Start the optional worker:

```bash
docker compose --profile ocr up -d ocr
```

Then configure the API in `.env`:

```env
OCR_SERVICE_URL=http://localhost:8000
OCR_INTERNAL_TOKEN=a-distinct-random-value-at-least-32-characters-long
```

Restart the API after changing `.env`. The API and web application remain usable when OCR is unavailable; failed processing can be retried without altering the source document.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and web development servers |
| `npm run build` | Build shared types, API and web |
| `npm run lint` | Lint API and web |
| `npm test` | Run API regression tests |
| `npm run test:e2e` | Run API test command directly |
| `npm run test:integration` | Start isolated PostgreSQL/MinIO, migrate them and run the real-infrastructure API journey |
| `npm run infra:test:down` | Remove isolated integration containers and their ephemeral data |
| `npm run test:web` | Run Playwright against already-running services |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate -- --name <name>` | Author a development migration |
| `npm run db:deploy` | Apply checked-in migrations |
| `npm run db:seed` | Idempotently create fictional demo data |
| `npm run infra:up` | Start PostgreSQL and MinIO |
| `npm run infra:down` | Stop Compose services |

To let Playwright start API/web servers and avoid parallel tests sharing the intentional login-rate bucket:

```bash
PLAYWRIGHT_START_SERVERS=true npm run test:e2e -w @sih/web -- --workers=1
```

Verified Phase 2 gates on 29 August 2026, rerun during Phase 3 on 24 September 2026:

- API: **31/31 tests passed**
- Browser: **4/4 Playwright tests passed**
- ESLint: **passed**
- Production build: **passed**
- Nine Prisma migrations: **applied successfully**
- Seed after migration: **passed**

The Nest API suites use mocked Prisma/storage providers and are regression tests rather than complete PostgreSQL/MinIO infrastructure E2E tests. The browser journey uses the local migrated stack.

Phase 3 began on 24 September 2026 with an isolated real-infrastructure test environment. Its first journey passed against actual PostgreSQL and MinIO, covering encrypted persistence, owner download, unauthorized direct access and search isolation, VIEW-versus-DOWNLOAD separation, immediate revocation, integrity verification, audit events and custody events. The isolated services use ports `55432`, `59000` and `59001`; run `npm run infra:test:down` after inspection if the test command leaves them running.

Processing jobs now use durable `QUEUED`, `RUNNING`, `SUCCEEDED`, `RETRY_PENDING`, `FAILED` and `DEAD` states with attempt limits, exponential-backoff metadata, atomic claims and reclaimable leases. Processing is still triggered synchronously by an authorised request; an autonomous background dispatcher is not yet implemented.

Mutating document, version, access, hold, lifecycle and processing endpoints accept `Idempotency-Key`. Keys are scoped to the authenticated user and operation, retained for 24 hours, and bound to a SHA-256 request fingerprint. Identical retries replay the recorded response; changed input under the same key returns `409 Conflict`. The web client sends a new UUID for each mutation. External retrying clients must reuse the same key for the same logical request.

Record lifecycle changes, legal-hold placement/release and permission revocation now use integer revision tokens. A mutation made from stale state returns `409 Conflict` instead of silently overwriting a newer decision. PostgreSQL partial unique indexes independently enforce one active hold per document and one active grant per document/principal/capability, including under concurrent requests.

### Phase 3 verification snapshot

The current working tree contains the Phase 3 processing, idempotency and optimistic-concurrency hardening. The verified inventory is **15 Prisma models, 14 enums, 30 API endpoints, 7 frontend routes and 9 migrations**. The audit run passed **36 automated tests**: 31 API regression tests, one real PostgreSQL/MinIO integration journey and four Chromium browser tests. API/web lint and the shared/API/web production build also passed.

The local performance baseline is limited to rate-limit exercises: invalid-login p50/p95 of **231.4/244.7 ms** and a search-burst p50/p95 of **335.0/472.4 ms**. Upload, download, OCR, database saturation and production capacity have not been measured.

## Access-control summary

Document access requires both classification clearance and an allowing resource policy.

| Role | Maximum prototype classification | Evidence behavior |
| --- | --- | --- |
| `ADMIN` | `INTERNAL` | Platform administration; no automatic evidence access |
| `INVESTIGATOR` | `RESTRICTED` | Assigned cases and explicit grants |
| `SENIOR_OFFICER` | `CONFIDENTIAL` | Assigned resources within clearance |
| `DEPARTMENT_HEAD` | `HIGHLY_RESTRICTED` | Department/resource workflows within clearance |
| `AUDITOR` | `CONFIDENTIAL` | Read-only document visibility; no download/edit/share bypass |

This is a prototype taxonomy, not a claim that these are official NCRB/MHA classification labels.

## API overview

All routes are prefixed with `/api`.

| Method | Route | Required access |
| --- | --- | --- |
| `POST` | `/auth/login` | Public |
| `GET` | `/auth/me` | Authenticated active user |
| `GET/POST` | `/users` | `ADMIN` |
| `GET` | `/departments` | Authenticated |
| `POST` | `/departments` | `ADMIN` |
| `GET/POST` | `/cases` | Scoped list / role-limited creation |
| `GET` | `/cases/:id` | Case resource policy |
| `GET` | `/documents?caseId=...` | Document scope and classification |
| `GET` | `/documents/security-stats` | Authorized live metrics |
| `POST` | `/documents` | Authorized case member and upload role |
| `GET` | `/documents/:id` | `VIEW` |
| `GET` | `/documents/:id/content` | `VIEW` |
| `GET` | `/documents/:id/download` | `DOWNLOAD` |
| `GET/POST` | `/documents/:id/versions` | `VIEW` / `EDIT` |
| `GET` | `/documents/:id/verify` | `VIEW` |
| `GET/POST` | `/documents/:id/access` | `SHARE` |
| `DELETE` | `/documents/:id/access/:permissionId` | `SHARE` plus revocation reason |
| `GET` | `/documents/:id/audit` | `VIEW` |
| `GET` | `/documents/:id/provenance` | `VIEW` |
| `GET/POST` | `/documents/:id/holds` | `VIEW` / `APPROVE` |
| `POST` | `/documents/:id/holds/:holdId/release` | `APPROVE` |
| `POST` | `/documents/:id/record-status` | `APPROVE` |
| `GET` | `/documents/:id/intelligence` | `VIEW` |
| `POST` | `/documents/:id/process` | `EDIT` |
| `GET` | `/search?q=...` | Authenticated and database permission-scoped |

Refer to Swagger for DTO fields and responses.

## Evidence lifecycle

### Upload

```text
Authenticate → authorize case → validate file → calculate SHA-256
→ encrypt with AES-256-GCM → store ciphertext → create ORIGINAL version
→ queue processing → write audit and custody events
```

The upload boundary validates extension, MIME type, size, filename and basic signatures. It does **not** yet provide malware quarantine, antivirus scanning, content disarmament or deep parser validation.

### Versions and derived content

- `ORIGINAL`: initial authoritative source.
- `REVISION`: later authoritative content linked to its parent version.
- `DERIVED` / `REDACTED`: non-authoritative content requiring a source version.
- OCR text and summaries are separate derived database records and never overwrite source bytes.

Application routes preserve historical rows/objects, but MinIO/PostgreSQL do not currently enforce WORM immutability against privileged operators.

### Legal holds and disposition

Authorized users can place or release a legal hold with a reason. An active hold prevents transition to `DISPOSED` and records both an audit denial and custody event. `DISPOSED` is currently a logical terminal status; no physical purge API or storage-retention lock is implemented.

## Documentation

- [Consolidated build status and remaining roadmap](docs/build-status-and-roadmap.md)
- [Current implementation status](docs/implementation-status.md)
- [Current implementation deep audit](docs/reports/current-implementation-deep-audit.md)
- [Claim-by-claim verification](docs/implementation-verification.md)
- [Current architecture](docs/architecture.md)
- [Access-control policy](docs/access-control.md)
- [Data model](docs/data-model.md)
- [Records lifecycle](docs/records-lifecycle.md)
- [Provenance and custody](docs/provenance-and-custody.md)
- [Threat model](docs/threat-model.md)
- [Phase 2 hardening report](docs/reports/phase-2-hardening-report.md)
- [Demo runbook](docs/demo-runbook.md)

## Known limitations

- No malware scanner, quarantine or content-disarm pipeline.
- No KMS/HSM, envelope keys or production key-rotation mechanism.
- No object lock/WORM or physical retention/disposition workflow.
- Audit hashes lack an independent verifier and protected external archive.
- Custody tracking is technical provenance, not independently validated legal chain of custody.
- No MFA, federated identity, break-glass access or explicit session revocation.
- OCR accuracy still needs a representative text/scanned/poor-quality PDF corpus.
- Processing remains request-triggered; there is no autonomous dispatcher, lease heartbeat or stale-idempotency reconciliation command yet.
- No tested backup/restore, SIEM integration or production deployment automation.
- Semantic search and real LLM summaries are deferred.

Do not describe this repository as government-production ready until these controls and the applicable legal/organizational requirements have been independently implemented and verified.
