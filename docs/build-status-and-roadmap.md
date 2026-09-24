# G-Vaults Build Status and Remaining Roadmap

**Project:** SIH 2026 Problem Statement 26190 — Secure Digital Document Management System for Legal and Investigation Documents  
**Report date:** 29 August 2026  
**Current branch:** `phase-2/evidence-records-hardening`  
**Current maturity:** Hardened hackathon MVP  
**Production readiness:** Not production ready

## 1. Purpose

This document is the consolidated engineering status for the repository. It describes:

- what is implemented;
- what has been independently tested;
- what is only partial or experimental;
- known security and reliability limitations;
- work required in Phase 3 and Phase 4;
- the acceptance gates that must pass before release.

Documentation is not treated as proof. A capability is marked verified only when supporting code and executed test/runtime evidence exist.

## 2. Status definitions

| Status | Meaning |
| --- | --- |
| **VERIFIED** | Implementation exists and relevant automated or runtime evidence passed |
| **IMPLEMENTED** | Code exists and compiles, but important runtime/integration evidence is incomplete |
| **PARTIAL** | Useful behavior exists but required controls or coverage are incomplete |
| **EXPERIMENTAL** | Prototype behavior exists and must not be treated as authoritative |
| **NOT IMPLEMENTED** | No working implementation exists |
| **DEFERRED** | Explicitly postponed until higher-priority security/reliability work is complete |

## 3. Current architecture

```text
Browser
   ↓
Next.js Web
   ↓ Bearer JWT / JSON / multipart
NestJS API
   ├── Prisma → PostgreSQL
   ├── StorageService → private MinIO bucket
   ├── EncryptionService → AES-256-GCM
   ├── AuditService → hash-linked security events
   ├── CustodyService → evidence provenance events
   └── OCR client → FastAPI → PyMuPDF / PaddleOCR
```

### Trust responsibilities

- The browser is not a security boundary.
- The NestJS API authenticates and authorizes every sensitive operation.
- PostgreSQL is authoritative for identities, current permissions, metadata, lifecycle, audit and provenance.
- MinIO stores encrypted source objects; it is never exposed through public document URLs.
- The OCR worker processes derived text and does not make user-authorization decisions.
- OCR text and summaries are derived data and never replace original evidence.

## 4. Completed foundation

### 4.1 Repository and local infrastructure — VERIFIED

- npm workspace monorepo for API, web and shared types.
- PostgreSQL 17 and MinIO through Docker Compose.
- Optional FastAPI OCR worker through the `ocr` Compose profile.
- Local service ports bound to `127.0.0.1`.
- Private MinIO bucket initialization.
- Environment template with database, JWT, encryption, MinIO, OCR and seed settings.
- Root scripts for development, builds, tests, infrastructure, migrations and seed data.

### 4.2 Database and migrations — VERIFIED

Nine Prisma migrations are checked in and were successfully applied both to the local PostgreSQL database and to a disposable integration database. The seed was previously rerun successfully after the Phase 2 migration.

Implemented entity groups:

- identities: roles, departments and users;
- cases: cases and explicit case membership;
- documents: documents, versions and permission grants;
- records: classification, record status and legal holds;
- provenance: custody events;
- security: audit events;
- intelligence: processing jobs, OCR results and summaries.

## 5. Authentication and authorization

### 5.1 Authentication — VERIFIED

- Email/password login through `POST /api/auth/login`.
- bcrypt password hashing.
- Signed and expiring JWT access tokens.
- Missing, malformed and expired JWT rejection.
- Inactive-user rejection at login and protected-request identity loading.
- Current role and department loaded from PostgreSQL.
- Login success/failure auditing.

### 5.2 Role-based authorization — VERIFIED

Roles currently seeded:

- `ADMIN`
- `INVESTIGATOR`
- `SENIOR_OFFICER`
- `DEPARTMENT_HEAD`
- `AUDITOR`

Role guards protect administrative and creation operations.

### 5.3 Case authorization — VERIFIED

- Case lists are scoped by role, department and explicit case membership.
- Case creators become `OWNER` members.
- Non-admin users cannot create cases in another department.
- Known case/document IDs do not bypass backend checks.

### 5.4 Document capabilities — VERIFIED

Implemented resource capabilities:

| Capability | Meaning |
| --- | --- |
| `VIEW` | Open metadata and protected preview |
| `DOWNLOAD` | Export source bytes |
| `EDIT` | Create versions and run extraction |
| `SHARE` | List, grant and revoke access |
| `APPROVE` | Perform record lifecycle and legal-hold actions |

Important verified behavior:

- `VIEW` does not imply `DOWNLOAD`.
- `SHARE`, `EDIT` and `APPROVE` do not imply `DOWNLOAD`.
- Frontend-hidden actions remain protected when called directly.
- Permissions are evaluated from current database state on each request.
- Revocation takes effect without issuing a new JWT.

### 5.5 Separation of duties — VERIFIED

- `ADMIN` no longer receives automatic document/evidence access.
- `ADMIN` cannot upload evidence.
- Platform administration and investigative-content authority are separate.
- `AUDITOR` has read-only document behavior within classification clearance and does not receive download/edit/share authority.

### 5.6 Prototype classification — PARTIAL

Implemented classification values:

- `INTERNAL`
- `RESTRICTED`
- `CONFIDENTIAL`
- `HIGHLY_RESTRICTED`

Implemented role clearance:

| Role | Maximum classification |
| --- | --- |
| `ADMIN` | `INTERNAL` |
| `INVESTIGATOR` | `RESTRICTED` |
| `SENIOR_OFFICER` | `CONFIDENTIAL` |
| `DEPARTMENT_HEAD` | `HIGHLY_RESTRICTED` |
| `AUDITOR` | `CONFIDENTIAL` |

The classification check applies to document authorization, listing and search. This is a prototype role-based taxonomy, not a verified official NCRB/MHA classification model. Per-user clearance, compartments and policy exceptions are not implemented.

## 6. Cases and document management

### 6.1 Cases — VERIFIED

- Scoped case list and case detail.
- Case creation with department validation.
- Explicit membership and case roles.
- Seeded fictional cases across Cyber Crime and Financial Crime departments.
- Case UI with overview, document register and members.

### 6.2 Controlled uploads — PARTIAL

Implemented:

- file-size limit;
- extension validation;
- declared MIME validation;
- basic magic/signature validation;
- sanitized metadata filename;
- generated document/version IDs and object key;
- authorization before storage;
- cleanup attempt when the database transaction fails after object storage;
- controlled document-type list.

Controlled document types include FIR, police report, report, witness statement, charge sheet, court filing, evidence record, forensic report, legal notice, judgment and other.

Not implemented:

- quarantine;
- malware scanning;
- content disarm and reconstruction;
- deep PDF/DOCX parser validation;
- archive-bomb protection;
- storage/object reconciliation after failed cleanup.

The upload pipeline must therefore not be described as fully hostile-file secure.

## 7. Encryption, storage and integrity

### 7.1 Encryption — VERIFIED FOR MVP

- AES-256-GCM centralized in `EncryptionService`.
- Exact 32-byte key validation from a 64-character hexadecimal environment value.
- Random 12-byte nonce per encryption.
- 16-byte authentication tag.
- Storage key used as authenticated additional data.
- Ciphertext stored in MinIO; document plaintext is not stored in PostgreSQL.
- No public or presigned MinIO document URL returned to clients.

Production gap: environment-key storage must move to KMS/Vault/HSM with rotation and envelope-key policy.

### 7.2 SHA-256 fixity — VERIFIED

- SHA-256 is calculated over original plaintext bytes before encryption.
- Each version stores its own digest.
- Verification decrypts, hashes and compares the selected version.
- Tamper/decryption failure produces a controlled mismatch/failure.
- Integrity failure is audited; bytes are never silently replaced.

SHA-256 is treated as fixity/integrity, not encryption.

### 7.3 Storage abstraction — VERIFIED

`StorageService` provides:

- `put`
- `get`
- `exists`
- `delete`

The document services do not construct public MinIO URLs or expose internal storage keys in API version DTOs.

## 8. Evidence versioning and provenance

### 8.1 Preserved versions — VERIFIED

- A new upload creates version 1.
- Updates create version N+1 and update the current-version pointer.
- Prior rows and object keys remain available through normal application APIs.
- Historical versions support preview, download, integrity verification and text processing.
- A unique `(documentId, versionNumber)` constraint catches concurrent number clashes.

This is application-level append-only behavior, not storage-enforced WORM immutability. Privileged PostgreSQL/MinIO operators remain in the trust model.

### 8.2 Version semantics — IMPLEMENTED / PARTIALLY TESTED

Implemented kinds:

- `ORIGINAL`
- `REVISION`
- `DERIVED`
- `REDACTED`

Implemented metadata:

- parent version;
- source version;
- authoritative flag;
- transformation type;
- creator and change description.

Verified:

- v1 is `ORIGINAL` and authoritative;
- v2 defaults to `REVISION` and points to the prior version;
- historical v1 remains available after v2.

Still needed:

- explicit automated negative tests for derived/redacted versions without a source;
- cross-document source rejection test;
- valid derived/redacted version creation browser/API acceptance test;
- redaction-specific transformation review.

### 8.3 Custody/provenance tracking — VERIFIED AS TECHNICAL PROVENANCE

Custody events are stored separately from security audit events. Implemented types cover:

- upload and derivation;
- view/access and download;
- integrity verification;
- access grant and revoke;
- legal-hold placement and release;
- record-status change;
- blocked disposition.

This is not claimed to be legally sufficient chain of custody. Events are not independently signed, externally timestamped or stored in WORM media.

## 9. Grant lifecycle

### 9.1 Grants and revocation — VERIFIED

Grants record:

- user or department principal;
- capability;
- grantor;
- reason;
- activation time;
- optional expiry time;
- status;
- revoker, revoke time and revoke reason.

Authorization requires an active, already-started, non-expired grant for the current principal. Expired grants do not authorize documents or search results. Duplicate active grants are rejected.

### 9.2 Remaining grant work

- concurrency test for simultaneous duplicate grants;
- scheduled cleanup/status normalization for expired grants;
- better UI reason capture for revocation instead of a fixed workspace reason;
- optional access-request/approval workflow;
- user-principal grant UI in addition to current department-focused form.

## 10. Record lifecycle and legal holds

### 10.1 Record lifecycle — VERIFIED AS LOGICAL WORKFLOW

Implemented states:

```text
DRAFT
  → FINAL
  → DECLARED_RECORD
  → ARCHIVED or DISPOSITION_DUE
  → DISPOSED
```

Allowed transitions are enforced by the API. Every transition requires `APPROVE` and a reason and creates audit and custody events.

`DISPOSED` is currently a logical terminal state only. It does not physically delete database rows or MinIO objects.

### 10.2 Legal holds — VERIFIED

- Place a hold with reason and optional reference.
- Reject a second active hold through the service.
- Release an active hold with actor/time/reason.
- Active hold blocks transition to `DISPOSED`.
- Blocked disposition leaves the record unchanged.
- Audit contains `RECORD_DISPOSITION_BLOCKED`.
- Provenance contains `DISPOSITION_BLOCKED`.

Remaining work:

- database-level single-active-hold protection for concurrency;
- case-wide legal holds if required;
- official retention policy integration;
- storage object lock/retention enforcement;
- reviewed physical disposition workflow and approvals.

## 11. Audit trail

### 11.1 Implemented — PARTIAL

- Audit events for authentication, case, upload, version, view, download, grant/revoke, denial, verification, processing, hold and lifecycle actions.
- Actor, entity, case/document/version, result, metadata and timestamp.
- `previousHash` and `eventHash` linkage.
- Advisory transaction lock serializes normal append operations.
- No normal-user update/delete API.

### 11.2 Remaining work

- audit-chain verification command/service;
- database append-only controls or restricted writer role;
- independently protected remote archive;
- digital signature or trusted timestamp strategy if required;
- truncation/reordering detection across backups;
- audit explorer page for authorized auditors;
- SIEM export and alerting.

The current audit chain must not be described as immutable.

## 12. OCR, search and summaries

### 12.1 OCR/text extraction — PARTIAL

Implemented:

- text and Markdown extraction;
- FastAPI internal worker with service token;
- PyMuPDF extraction for text PDFs;
- rendered-page PaddleOCR fallback for scanned PDFs/images;
- worker does not accept arbitrary client filesystem paths;
- non-root OCR container;
- failed processing does not alter or block source access;
- stale raw `%PDF-` results can be cleared and retried.

Still needed:

- repeatable corpus for text PDF, scanned PDF, image, poor scan and multi-page PDF;
- accuracy and language measurements;
- processing time/resource limits under hostile input;
- durable asynchronous worker model;
- page-level OCR records if required.

PDF/image OCR should remain classified as partial until the representative corpus passes consistently.

### 12.2 Permission-scoped search — VERIFIED FOR MVP

- Searches title, case number and OCR text.
- Searches current and historical versions.
- Returns the newest matching historical version and snippet.
- Applies user/department grant, time validity and classification scope inside the database query.
- Unauthorized exact-secret tests return no result.

Remaining work:

- expand the real PostgreSQL/MinIO journey beyond its current exact-secret isolation coverage;
- PostgreSQL full-text index/ranking instead of `contains` scans;
- pagination and query performance with a larger dataset;
- hybrid/semantic search only after keyword search is stable.

### 12.3 Summary — EXPERIMENTAL

- Separate summary record per version.
- Current model is `extractive-prototype` using up to 600 characters of extracted text.
- UI labels the result as experimental.
- Summary never modifies original/OCR source data.

Not implemented:

- real LLM integration;
- constrained structured summary schema;
- provider/model/prompt/source-hash provenance;
- reviewer approval state;
- entity extraction confidence workflow.

## 13. Frontend status

### 13.1 Implemented — VERIFIED

Routes:

- `/login`
- `/dashboard`
- `/cases`
- `/cases/[id]`
- `/documents/[id]`
- `/search`

Implemented UI behavior:

- institutional login screen;
- responsive application shell and navigation;
- operational dashboard with live data;
- dense case/document tables;
- upload form with type and classification;
- document workspace with preview, integrity, metadata and processing;
- structured version history with kind/authority;
- access-grant table with reason and expiry;
- provenance and audit tables;
- legal-hold and record-status controls;
- permission-aware action visibility;
- actionable loading, empty and error states;
- protected deep-link denial;
- no page-level horizontal overflow at tested widths.

### 13.2 Remaining UI work

- dedicated audit explorer route for auditors;
- records/holds list across cases;
- administration pages for users/departments;
- user-principal access grant workflow;
- better confirmation/reason dialogs for revocation and hold release;
- richer status-transition guidance instead of listing invalid next states;
- pagination/filtering for large tables;
- deeper keyboard/screen-reader audit;
- visual regression testing.

## 14. Current automated evidence

### 14.1 API regression tests

Latest execution on 29 August 2026:

```text
Test suites: 3 passed
Tests:       26 passed
```

Coverage includes authentication, roles, case scope, file validation, encrypted lifecycle, permission separation, revocation, expiry, version lineage, administrator evidence denial, integrity mismatch, legal holds, record transitions, provenance and search-query scoping.

Limitation: these Nest tests replace Prisma and MinIO with in-memory mocks. They are API regression tests, not complete infrastructure E2E tests.

### 14.2 Browser tests

Latest verified result:

```text
Playwright: 4 passed
```

Coverage includes login, mobile navigation, responsive overflow and an investigator golden path through upload, versioning, extraction, sharing, revocation, search isolation, audit, provenance and legal-hold disposition denial.

Run serially because parallel tests can share the intentional in-memory login-rate bucket:

```bash
PLAYWRIGHT_START_SERVERS=true npm run test:e2e -w @sih/web -- --workers=1
```

### 14.3 Quality gates

- ESLint: passed.
- Shared TypeScript build: passed.
- NestJS production build: passed.
- Next.js production build: passed.
- Phase 2 migration deployment: passed.
- Seed after migration: passed.
- `git diff --check`: passed.
- Isolated PostgreSQL/MinIO integration journey: passed on 24 September 2026.

## 15. Worktree and release status

The current Phase 2 implementation is on:

```text
phase-2/evidence-records-hardening
```

At the time of this report, Phase 2 code, migration, tests, frontend and documentation remain working-tree changes and have not yet been committed in this branch. Phase 3 has started with an isolated real PostgreSQL/MinIO integration harness. Before sharing:

1. review the complete diff;
2. run the final test gates;
3. separate or clearly review the Phase 2 and initial Phase 3 changes before committing;
4. push the branch;
5. open/review a pull request;
6. merge only after another person verifies the acceptance flow.

## 16. Remaining work by priority

### P0 — none demonstrated in the tested scope

No currently demonstrated critical authorization/integrity bypass remains from the tested Phase 1/2 scope. This does not mean the system is vulnerability-free.

### P1 — security and evidence protection

1. Implement quarantine and malware scanning with bounded safe fixtures.
2. Add deeper file-content validation and parser isolation.
3. Expand real PostgreSQL/MinIO authorization and search-isolation integration coverage. The initial owner/grant/revoke/exact-secret journey is complete.
4. Add an audit-chain verifier and protected audit export/archive design.
5. Add storage object lock/WORM and reviewed retention/disposition design.
6. Complete representative PDF/image OCR corpus verification.
7. Review classification taxonomy and access policy with the intended organization.
8. Design KMS/Vault envelope encryption and key rotation.

### P2 — reliability and adversarial hardening

1. Upgrade processing jobs to explicit queued/running/succeeded/retry/dead states. **COMPLETED.**
2. Add leases, retry backoff and maximum attempts. **COMPLETED for request-triggered processing; autonomous dispatch and heartbeat remain.**
3. Add idempotency for upload completion, version creation, grants, revocations and processing. **COMPLETED for API request replay; stale-claim reconciliation remains.**
4. Add optimistic concurrency or controlled 409 behavior for lifecycle/hold/grant changes. **COMPLETED for lifecycle changes, hold placement/release, duplicate active grants and grant revocation.**
5. Add orphan-object and missing-object reconciliation.
6. Add failure-injection tests for PostgreSQL, MinIO and OCR outages.
7. Add request correlation IDs and structured logging.
8. Add security-header, CORS, CSP, cache and XSS tests.
9. Add bounded load/abuse baselines for login, search, download, upload and processing.
10. Review committed dependencies and resolve compatible security advisories.

### P3 — production and operations

1. Managed database/object-storage architecture.
2. HTTPS/reverse proxy/API gateway configuration.
3. Central identity provider, MFA and session revocation.
4. KMS/HSM, key recovery and rotation.
5. Centralized logging, metrics, alerts and SIEM.
6. Backup/restore implementation and tested recovery drill.
7. Production deployment pipeline and health/readiness checks.
8. Incident-response and operations runbooks.
9. Independent security review and penetration testing in authorized staging.
10. Applicable legal, privacy, retention and government-policy validation.

### Deferred until security/reliability is stable

- semantic/vector search;
- real LLM summaries;
- chatbot/assistant features;
- large message brokers or distributed event platforms;
- blockchain.

## 17. Phase 3 implementation plan

Phase 3 should be executed in this order:

1. Establish real PostgreSQL/MinIO integration-test infrastructure. **COMPLETED (initial harness and journey).**
2. Model durable processing states, leases, retries and dead jobs. **COMPLETED for the current request-triggered worker model.**
3. Add idempotency and concurrency protection. **COMPLETED for current mutating document/record routes, processing claims and lifecycle/access revision checks; stale-key reconciliation remains follow-up work.**
4. Add cross-system failure injection and reconciliation.
5. Harden OCR isolation and temporary-file/resource handling.
6. Add quarantine/malware scanning if practical for the MVP.
7. Add request correlation and structured logging.
8. Review web security headers, token storage, XSS rendering and CORS.
9. Run bounded load/abuse tests and record a measured baseline.
10. Review secrets/key handling and document backup/DR.

Required Phase 3 documentation:

- `docs/failure-modes.md`
- updated `docs/performance-baseline.md`
- `docs/backup-and-disaster-recovery.md`
- `docs/reports/phase-3-reliability-security-report.md`

## 18. Phase 4 implementation plan

Phase 4 should focus on release readiness rather than new MVP features:

- current versus target production architecture;
- architecture decision records;
- complete API and data-model documentation;
- security architecture and system design specification;
- requirement-to-test traceability;
- security test report;
- deployment documentation;
- operations and incident-response runbooks;
- final factual implementation status;
- final production-readiness scoring;
- rehearsed golden demo and backup recording.

## 19. Final acceptance flow

Before calling the MVP ready for demo/review, execute:

```text
Investigator login
→ open authorized case
→ upload fictional evidence
→ validate, hash and encrypt
→ confirm ORIGINAL v1 and custody event
→ process OCR/text
→ permission-scoped exact-secret search
→ create REVISION v2
→ confirm v1 remains accessible
→ grant Department B VIEW
→ confirm VIEW succeeds and DOWNLOAD fails
→ revoke VIEW
→ confirm direct URL and search immediately deny/leak nothing
→ verify integrity
→ controlled tamper test and mismatch detection
→ place legal hold
→ transition to DISPOSITION_DUE
→ confirm DISPOSED is blocked and audited
→ review audit and provenance separately
```

## 20. Commands for a clean verification run

```bash
npm run infra:up
npm run db:generate
npm run db:deploy
npm run db:seed
npm test
npm run test:integration
npm run infra:test:down
npm run lint
npm run build
PLAYWRIGHT_START_SERVERS=true npm run test:e2e -w @sih/web -- --workers=1
```

## 21. Overall capability matrix

| Capability | Current status |
| --- | --- |
| Local monorepo/infrastructure | VERIFIED |
| JWT authentication | VERIFIED |
| RBAC and case scope | VERIFIED |
| Resource-scoped document authorization | VERIFIED |
| Admin/evidence separation of duties | VERIFIED |
| Grant activation/expiry/revocation | VERIFIED |
| Prototype classification | PARTIAL |
| AES-256-GCM storage encryption | VERIFIED FOR MVP |
| KMS/envelope encryption | NOT IMPLEMENTED |
| SHA-256 version fixity | VERIFIED |
| Application-level preserved versions | VERIFIED |
| Storage-enforced WORM | NOT IMPLEMENTED |
| Original/revision lineage | VERIFIED |
| Derived/redacted lineage | IMPLEMENTED; TEST COVERAGE PARTIAL |
| Hash-linked audit creation | PARTIAL |
| Independent protected audit archive | NOT IMPLEMENTED |
| Custody/provenance events | VERIFIED AS TECHNICAL PROVENANCE |
| Legal holds | VERIFIED AS APPLICATION CONTROL |
| Logical record lifecycle | VERIFIED |
| Physical retention/disposition | NOT IMPLEMENTED |
| Controlled upload validation | PARTIAL |
| Malware quarantine/scanning | NOT IMPLEMENTED |
| Text/Markdown extraction | VERIFIED |
| PDF/image OCR | PARTIAL |
| Permission-scoped keyword search | VERIFIED FOR MVP |
| Semantic search | DEFERRED |
| Extractive prototype summary | EXPERIMENTAL |
| Real LLM summary | DEFERRED |
| Durable processing | PARTIAL: STATES, LEASES AND RETRIES VERIFIED; NO BACKGROUND DISPATCHER |
| Operation idempotency | VERIFIED FOR MUTATING DOCUMENT/RECORD ROUTES; RECONCILIATION REQUIRED |
| Optimistic record concurrency | VERIFIED FOR LIFECYCLE, HOLDS AND REVOCATION; ACTIVE HOLD/GRANT UNIQUENESS ENFORCED IN POSTGRESQL |
| Responsive operational UI | VERIFIED |
| API regression suite | VERIFIED, MOCKED INFRASTRUCTURE |
| Browser golden journey | VERIFIED |
| Real DB/storage integration suite | INITIAL JOURNEY VERIFIED; EXPANSION REQUIRED |
| Backup/disaster recovery | NOT TESTED / NOT IMPLEMENTED |
| Government production readiness | NOT READY |

## 22. Related documentation

- [Project README](../README.md)
- [Implementation status](implementation-status.md)
- [Implementation verification](implementation-verification.md)
- [Architecture](architecture.md)
- [Access control](access-control.md)
- [Data model](data-model.md)
- [Records lifecycle](records-lifecycle.md)
- [Provenance and custody](provenance-and-custody.md)
- [Threat model](threat-model.md)
- [Performance baseline](performance-baseline.md)
- [Phase 1 verification report](reports/phase-1-verification-report.md)
- [Phase 2 hardening report](reports/phase-2-hardening-report.md)
- [Demo runbook](demo-runbook.md)

## 23. Final engineering statement

The repository now contains a demonstrably functional and security-conscious hackathon MVP with strong resource authorization, encrypted source storage, per-version fixity, evidence lineage, time-bounded grants, technical provenance and legal-hold enforcement. It is suitable for continued controlled development and SIH demonstration using fictional data.

It must not be represented as government-production ready until hostile-file controls, protected audit/retention, KMS-backed key management, durable processing, real infrastructure integration tests, backup/recovery, production identity and applicable legal/organizational requirements are independently completed and verified.
