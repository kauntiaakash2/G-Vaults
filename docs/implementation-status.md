# SIH 26190 — Implementation Status and Technical Report

**Last updated:** 29 August 2026

## 1. Executive summary

SIH 26190 is a permission-scoped case workspace for investigation teams. The repository contains a Next.js web application, NestJS REST API, PostgreSQL/Prisma database, MinIO object storage, and an optional FastAPI OCR worker.

The server-side security flow is:

Request → JWT authentication → role guard → current database resource permission check → operation → audit event.

Implemented core behavior includes authentication, RBAC, cases, departments, explicit case membership, validated document upload/download/preview, AES-256-GCM encryption, SHA-256 integrity checks, application-level append-only versions, document sharing/revocation, audit logging, OCR/text extraction integration, permission-scoped keyword search, prototype summaries, dashboard/case/document/search UI, Swagger, tests, linting and builds.

This is a hardened hackathon MVP under active verification, not a production-ready legal records system. Upload quarantine/malware scanning, storage-enforced WORM, protected audit archives, legal hold, explicit custody provenance, KMS/HSM, MFA/identity federation and tested disaster recovery are not implemented. See [implementation-verification.md](implementation-verification.md) for claim-by-claim evidence.

Semantic search, real LLM integration, distributed processing queues, KMS/Vault and production deployment automation remain future hardening work.

## 2. Repository structure

- apps/api — NestJS API, DTOs, guards, services and Prisma schema.
- apps/web — Next.js and TypeScript frontend.
- packages/shared — shared API-facing TypeScript types.
- services/ocr — FastAPI, PyMuPDF and PaddleOCR worker.
- infra — deployment notes/placeholders.
- docs — access policy, demo runbook and implementation report.
- docker-compose.yml — PostgreSQL, MinIO and optional OCR service.
- .env.example — local configuration template.

## 3. Running locally

Prerequisites: Node.js 20+, npm 10+ and Docker Compose.

    cp .env.example .env
    npm install
    npm run infra:up
    npm run db:generate
    npm run db:deploy
    npm run db:seed
    npm run dev

Open http://localhost:3000. Swagger is at http://localhost:3001/api/docs. MinIO is at http://localhost:9001.

Start PDF/image OCR separately:

    docker compose --profile ocr up -d ocr

Set `OCR_SERVICE_URL=http://localhost:8000` when the worker is running and configure the same 32-character-or-longer `OCR_INTERNAL_TOKEN` for API and worker. Document access remains available if OCR is offline; processing can be retried later.

Useful commands are npm run build, npm test, npm run test:web, npm run lint and npm run infra:down.

## 4. Infrastructure and configuration

Docker Compose provides PostgreSQL and MinIO. PostgreSQL stores metadata; MinIO stores encrypted ciphertext objects, never plaintext document files.

Important variables:

- DATABASE_URL — Prisma PostgreSQL connection.
- JWT_SECRET and JWT_EXPIRES_IN — signed access-token settings.
- ENCRYPTION_KEY — 64 hexadecimal characters for the prototype AES key.
- MINIO_ENDPOINT, MINIO_PORT, credentials and bucket.
- MAX_UPLOAD_BYTES — upload size limit.
- OCR_SERVICE_URL — optional worker endpoint.
- SEED_ADMIN_PASSWORD and SEED_USER_PASSWORD — seed credentials.

Real secrets must not be committed. Production should use managed secret storage and KMS/Vault rather than example values.

## 5. Database implementation

Prisma migrations cover foundation, secure documents and intelligence tables. db:deploy applies checked-in migrations; db:migrate -- --name <name> authors a development migration.

### Foundation

- roles: unique role code, name and description.
- departments: unique code, name and description.
- users: identity, bcrypt password hash, role, optional department and ACTIVE/INACTIVE status.
- cases: unique case number, title, description, department, status and creator.
- case_members: composite case/user key with OWNER, LEAD, MEMBER or VIEWER case role.

### Documents

- documents: case, title, document type, owning department, creator and current-version pointer.
- document_versions: append-only application version number, storage key, SHA-256, size, MIME type, original filename, creator and change description.
- document_permissions: optional user or department target, permission, active/revoked status, grantor and revoke timestamp.

### Audit and intelligence

- audit_events: actor, action, related entities, result, metadata, timestamp, previous hash and event hash.
- processing_jobs: version job type, status, attempts, error and lifecycle timestamps.
- ocr_results: one result per version with status, text, page count and engine.
- ai_summaries: one separate summary per version with model label.

Foreign keys, uniqueness constraints, indexes and cascading rules are defined in apps/api/prisma/schema.prisma. Version numbers are unique per document and storage keys are globally unique.

## 6. Authentication

POST /api/auth/login finds a user by email, rejects inactive accounts, verifies the bcrypt hash and issues a signed JWT. GET /api/auth/me validates the Bearer token and loads current identity, role and department.

Passwords are never stored or returned in plaintext. Document permissions are intentionally not embedded in JWT claims; they are checked against current database state so grants and revocations take effect immediately.

The web AppShell checks /auth/me, redirects invalid sessions to /login and provides sign-out. Seed data includes fictional administrator, department-head, investigator and auditor accounts.

## 7. RBAC and resource authorization

Authorization has two layers:

1. RolesGuard checks whether a role may call an operation.
2. Case/document authorization services check the particular resource.

Implemented policy:

- ADMIN manages users/departments and currently bypasses document grants. This requires separation-of-duties review; platform administration should not automatically imply evidence access in a production policy.
- AUDITOR has read-only audit/relevant-record access.
- Investigators and senior officers may create cases subject to resource rules.
- Department heads are scoped to their department.
- Investigators require explicit case membership or document grant.
- VIEW, DOWNLOAD, EDIT and SHARE are independent capabilities.
- REVOKED grants never satisfy an authorization query.

Frontend button visibility is not security. Direct IDs, altered case IDs and unauthorized search queries are checked by the API.

## 8. API surface

All routes are prefixed with /api.

| Method | Route | Behavior |
| --- | --- | --- |
| POST | /auth/login | Public login; audits success/failure |
| GET | /auth/me | Authenticated current user |
| GET/POST | /users | Admin |
| GET | /departments | Authenticated |
| POST | /departments | Admin |
| GET/POST | /cases | Scoped list; role-limited creation |
| GET | /cases/:id | Resource authorization |
| GET | /documents | Authorized document list |
| GET | /documents/security-stats | Live security metrics |
| POST | /documents | Multipart validated/encrypted upload; no malware scanner |
| GET | /documents/:id | Metadata with VIEW |
| GET | /documents/:id/content | Inline preview with VIEW |
| GET | /documents/:id/download | Decrypt/stream with DOWNLOAD |
| POST/GET | /documents/:id/versions | Create with EDIT; history with VIEW |
| GET | /documents/:id/verify | SHA-256 verification with VIEW |
| GET/POST | /documents/:id/access | List/grant with SHARE |
| DELETE | /documents/:id/access/:permissionId | Revoke with SHARE |
| GET | /documents/:id/audit | Authorized audit history |
| GET | /documents/:id/intelligence | OCR/summary/job status |
| POST | /documents/:id/process | Process/retry selected version |
| GET | /search?q=... | Permission-scoped keyword search |

Swagger/OpenAPI is available at /api/docs.

## 9. Secure document lifecycle

### Upload

Authenticate, authorize the case, validate extension/MIME/size/basic signature, generate IDs and a storage key, compute SHA-256 over the original bytes, encrypt using AES-256-GCM, store ciphertext in MinIO, create document/version/job records and append DOCUMENT_UPLOADED.

This is not a complete hostile-file ingestion pipeline: quarantine, malware scanning, content disarm and deep PDF/DOCX validation are not implemented.

Generated keys follow cases/{caseId}/documents/{documentId}/versions/{versionId}. Client filenames are metadata only; path traversal cannot select a filesystem path. Failed operations attempt orphan cleanup where possible.

### Encryption and integrity

EncryptionService centralizes AES-256-GCM. StorageService abstracts MinIO put/get/exists/delete. SHA-256 is an integrity record, not encryption: verification decrypts bytes, hashes them and compares the stored version hash. Mismatches are reported and audited, not silently repaired.

### Download and preview

The API never returns a public storage URL. It authorizes first, reads ciphertext, decrypts in memory and streams with private/no-store and nosniff headers. Current or historical versions may be selected using versionId.

### Versioning

An update inserts version N+1 and updates current_version_id; normal application routes do not overwrite older rows or objects. Historical versions support metadata, preview, download, extraction, summary and verification. This is application-level append-only behavior, not storage-enforced immutability/WORM; privileged database or MinIO operators remain able to alter data.

## 10. Sharing and audit

A caller with SHARE authority can grant a user or department a specific permission. VIEW does not imply DOWNLOAD. Grant and revoke are immediately reflected in authorization queries.

Audit actions include login outcomes, case creation, upload, view, download, version creation, grant/revoke, denied access, integrity results, OCR lifecycle and search. Each event stores `previous_hash` and `event_hash`, creating hash linkage. There is no normal-user audit update/delete endpoint, but no chain verifier or independently protected append-only archive exists. The audit store is therefore not immutable and must not yet be described as independently tamper-evident.

## 11. OCR, extraction and summaries

The FastAPI worker receives service-token-authenticated base64 bytes and a version identifier; it never accepts arbitrary client filesystem paths. Compose binds the worker to localhost and the container runs as a non-root user.

For PDFs, PyMuPDF extracts embedded page text first. Empty or PDF-container-like output beginning with %PDF- is rejected as false text; pages are rendered and PaddleOCR is attempted. Text/Markdown uses UTF-8 extraction and images use PaddleOCR.

The API stores results in ocr_results and lifecycle state in processing_jobs. A stale raw %PDF-1.7 result is detected and removed before retry. Extract text & summarize requeues completed jobs so an older stale result can be replaced after the worker starts.

The current summary is an extractive prototype: up to 600 characters of extracted text stored in ai_summaries with model extractive-prototype. It is separate from the original file and searchable text and never modifies source bytes.

Not complete yet: real LLM summaries, entity confidence workflows, embeddings/pgvector, semantic ranking, page-level OCR records and a durable distributed queue. If OCR fails, source access, versions, permissions, audit and integrity remain usable.

## 12. Permission-scoped search

GET `/api/search` searches document title, case number and OCR text across current and historical versions, with optional case, department, document-type and date filters. It returns the newest version whose OCR text matches. Authorization scope is included in the database query before results are returned, preventing unauthorized titles, existence and snippets from leaking.

## 13. Frontend

- /login — credential form and session bootstrap.
- /dashboard — active cases, authorized documents, jobs, live security metrics and recent cases.
- /cases — case list and creation.
- /cases/:id — summary, members and upload.
- /documents/:id — metadata, preview, download, verify, share, new version, history, extraction, summary and audit.
- /search — permission-scoped search and snippets.

AppShell provides navigation, active-route semantics and sign-out. The UI was restructured around a slate canvas, white surfaces, navy navigation, indigo actions, teal security states, accessible focus rings and responsive grids. Security values come from the database.

## 14. Tests and quality

API regression tests cover correct/wrong login, inactive users, missing/invalid/expired tokens, roles, case membership, cross-department case denial, upload validation, path-like filenames, encrypted lifecycle, permission separation, grants, downloads, versions, revocation and tamper-detected integrity mismatch. These suites start the Nest application but replace Prisma and MinIO with mocks, so they are not full infrastructure end-to-end tests.

Playwright covers an admin login and dashboard flow. Standard checks:

    npm test
    npm run test:web
    npm run lint
    npm run build

Build and lint pass in the project environment. A restricted sandbox may produce Jest listen EPERM when local listeners are forbidden; this is an environment restriction.

## 15. Demo acceptance story

1. Log in as Investigator A and open CYB-2026-001.
2. Upload a fictional PDF or Markdown report.
3. Show SHA-256, AES-256-GCM and version 1.
4. Run extraction and show searchable text plus the separate prototype summary.
5. Search for a concept.
6. Upload version 2 and show v1 preserved and v2 current.
7. Grant Department B VIEW and switch users.
8. Revoke access and show subsequent requests denied.
9. Show grant, revoke and denied events in the audit trail.
10. Verify integrity and optionally demonstrate a controlled mismatch.

Only fictional data should be used.

## 16. Remaining production work

- KMS/Vault key storage, rotation and envelope-key policy.
- Managed PostgreSQL/S3, backups, retention and object lock.
- Malware scanning and content disarmament.
- Durable queue, retries, idempotency and isolated OCR/AI workers.
- Real LLM integration with constrained prompts and model/output audit metadata.
- Embeddings, pgvector and hybrid search if stable.
- Centralized logs/SIEM, metrics, alerting and shared rate limiting.
- Session revocation, privacy/compliance and chain-of-custody review.
- CI OCR corpus tests, deployment manifests, disaster recovery and restore drills.

## 17. Completion matrix

| Area | Status |
| --- | --- |
| Foundation, migrations and seeds | MVP complete; disposable-DB migration test absent |
| Authentication and RBAC | MVP complete; MFA/IdP/session revocation absent |
| Cases, departments and membership | MVP complete |
| Encrypted document storage | MVP complete; KMS/envelope keys absent |
| SHA-256 verification | MVP complete |
| Append-only versions | MVP complete at application layer; WORM absent |
| Grant/revoke | MVP complete; expiry/reason metadata absent |
| Hash-linked audit | Partial; verifier/protected archive absent |
| PDF/text/image extraction integration | Partial; representative PDF/OCR corpus not yet passing |
| Permission-scoped keyword search | MVP complete; real-DB automated isolation test absent |
| Prototype extractive summary | Experimental |
| Malware scanning/quarantine | Not implemented |
| Legal hold/provenance/record lifecycle | Not implemented |
| Semantic search/embeddings | Deferred |
| Production key management/deployment/DR | Production hardening required |
