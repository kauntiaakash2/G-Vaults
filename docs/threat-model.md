# Threat Model

**Method:** STRIDE, asset analysis, abuse cases and trust boundaries  
**Scope:** Local MVP as verified 29 August 2026

## Assets

- Authoritative original/version bytes and their SHA-256 fixity records.
- Encryption key, JWT secret, MinIO credentials and seeded account secrets.
- Identity, roles, departments, case membership and document grants.
- Sensitive case/document metadata, OCR text, summaries and search snippets.
- Audit events, hash links and processing history.
- Availability of API, PostgreSQL, MinIO and OCR/parser resources.

## Security assumptions

- The local host and Docker daemon are trusted for development.
- `.env` is not committed and production replaces all example credentials.
- TLS, reverse proxy behavior and infrastructure DDoS mitigation do not exist in
  the local Compose proof and must not be inferred.
- PostgreSQL and MinIO administrators can bypass application policy.
- OCR text and summaries are derived data, not authoritative evidence.

## Trust boundaries

| Boundary | Untrusted input | Required control | Verified state |
| --- | --- | --- | --- |
| Browser → Web/API | Credentials, IDs, text, files | Validation, authentication, authorization | Partial: strong API checks; session token is browser-accessible |
| JWT → identity | Forged/expired token | Signature/type/expiry and current active-user lookup | Verified |
| API → PostgreSQL | User filters/IDs | Prisma parameterization and scoped predicates | Verified for reviewed paths |
| API → MinIO | Object key/content | Generated keys, private bucket, authenticated encryption | Partial; privileged storage actor remains |
| MinIO → API | Missing/tampered bytes | GCM authentication plus SHA-256 comparison | Verified in regression test |
| API → OCR | CPU-heavy parser input | Service credential, size limit, isolation/timeouts | Partial; token/non-root/local bind fixed, resource limits absent |
| OCR → API/UI | Untrusted extracted text | Store as derived text; escaped rendering; no evidence mutation | Code verified; explicit XSS browser test pending |

## STRIDE analysis

| Category | Threat/abuse case | Existing mitigation | Evidence/status | Residual risk/action |
| --- | --- | --- | --- | --- |
| Spoofing | Wrong password, malformed/altered/expired JWT | bcrypt; JWT signature/type/expiry; generic 401 | Automated tests pass | Add MFA/IdP and token revocation for production |
| Spoofing | Reuse token after user deactivation/role change | Current user/role loaded on every request | Code/test for inactive user | Add runtime administration test |
| Spoofing | Client calls OCR worker directly | Shared service token, constant-time compare, localhost binding | Runtime missing/wrong 401, correct 200 | Rotate token; private network/TLS in deployment |
| Tampering | Modify encrypted object | AES-GCM tag and per-version SHA-256 | Tampered object yields MISMATCH in test | Add controlled real-MinIO tamper test and recovery procedure |
| Tampering | Overwrite/delete historical version | No normal API; unique version/key | Application tests preserve v1/v2 | No storage object lock/WORM; privileged actors can tamper |
| Tampering | Modify/reorder audit rows | Hash links on append | Code inspected | No verifier/protected archive; privileged DB actor can rewrite chain |
| Repudiation | User denies grant/download/failed access | Actor/action/result/time/related IDs logged | Runtime audit observed | IP can be proxy-sensitive; no signed export or custody workflow |
| Information disclosure | Known UUID / IDOR/BOLA | Resource authorization before read/download/process | Outsider/revocation tests pass | 403 versus 404 can reveal existence for known IDs |
| Information disclosure | Unauthorized exact-secret search | Permission scope inside DB query | Live negative search returned zero | Add Docker-backed automated search test |
| Information disclosure | Leak MinIO key/public URL | No public URL; response DTO allowlist | Runtime internal-field probe passes after fix | Keep response schemas explicit |
| Information disclosure | Anonymous object storage | Anonymous policy disabled | Runtime request returned 403 | Protect credentials and console in deployment |
| Information disclosure | Secrets in source/frontend/logs | `.env` ignored; no document body logging found | Repository/config inspection | No secret scanner/CI; example credentials must remain local only |
| Denial of service | Password guessing/login flood | 10/IP/path/minute in-memory limit | Bounded run produced 429 | Per-process only; proxy trust, distributed state and account policy absent |
| Denial of service | Search flood | 60/IP/path/minute; 200-char query cap | 60×200 then 5×429 | Contains queries may become expensive at scale |
| Denial of service | Repeated OCR/parser work | API requires EDIT; worker auth/size/timeout | Partial | No process-route limiter, lease, idempotency or container CPU/memory limit |
| Denial of service | Oversized upload | Multer and validator maximum | Oversize test passes | Memory buffering consumes API RAM; concurrent upload controls absent |
| Elevation of privilege | SHARE user downloads evidence | Previously broader implication list | Demonstrated before fix; new regression passes | Fixed P1 |
| Elevation of privilege | Investigator creates cross-department case | Previously allowed | New service rule and regression | Fixed P1 |
| Elevation of privilege | Platform admin attempts evidence access | ADMIN bypass removed; classification and explicit grants apply | API regression returns 403 | Monitor policy changes; add real-DB matrix |
| Elevation of privilege | Frontend hidden button invoked directly | Backend guards/service checks | Direct API negative tests | Expand endpoint/permission matrix |

## Upload and parser abuse cases

| Case | Current result | Status |
| --- | --- | --- |
| Oversized file | Rejected (Multer/validator) | VERIFIED |
| Extension/MIME mismatch | Rejected | VERIFIED BY CODE; add explicit test |
| Bad basic magic | Rejected | VERIFIED |
| Path traversal/control filename | Basename + NFKC + control/character filtering | VERIFIED |
| Unicode edge name | Normalized/replaced | PARTIAL; corpus test pending |
| Corrupt PDF beginning `%PDF-` | Accepted at ingestion; parser may later fail | GAP |
| Arbitrary ZIP labeled DOCX | ZIP magic can pass | GAP |
| EICAR/safe malware artifact | Controlled 68-byte artifact passed basic text validation, proving no scanner gate | NOT IMPLEMENTED |
| HTML/SVG active content | Types are not accepted | MITIGATED by allowlist |
| Parser resource exhaustion | Size bounded, but pages/complexity/time/resources not sufficiently bounded | GAP |
| ZIP bomb | DOCX ZIP is not expanded by current extractor, but is accepted/stored | GAP; future inspection must be bounded |

The current conceptual pipeline is **validate → encrypt → store → process**. It
does not implement **quarantine → malware scan → content inspection**. ClamAV is
practical as an isolated Compose scanner for a later hardening step, but needs a
clear fail-closed policy, timeout, EICAR test, signature updates and availability
behavior before introduction.

## Authorization abuse matrix

| Attempt | Expected | Evidence |
| --- | --- | --- |
| No JWT / invalid / expired JWT | 401 | Automated PASS |
| Wrong role on users endpoint | 403 | Automated PASS |
| Non-member known case | 403 | Automated PASS |
| Known unauthorized document UUID | 403 | Automated PASS |
| Revoked VIEW reuse with same login | 403 | Automated and live PASS |
| VIEW metadata | 200 | Automated/live PASS |
| VIEW download | 403 | Automated/live PASS |
| SHARE-only download | 403 | Failed before fix; automated PASS after fix |
| Cross-department case creation by investigator | 403 | Automated PASS after fix |
| Unauthorized exact-secret search | zero results | Live PASS |
| Unauthorized historical-version access | deny | NOT TESTED explicitly |
| VIEW attempting SHARE | deny | Covered by permission logic; explicit test pending |
| Grant expiry | deny after expiry | NOT IMPLEMENTED |

## Controlled availability observations

A local bounded test sent 12 invalid login attempts and 65 authenticated search
requests; it did not target any external system. Login produced eight `401` and
four `429`; search produced sixty `200` and five `429`. This proves only
application-layer abuse throttling in the observed single API process, not DDoS
protection.

## Prioritized findings

### P1

- **Fixed:** SHARE implied DOWNLOAD.
- **Fixed:** non-admin cross-department case creation.
- **Fixed:** unauthenticated, host-exposed OCR endpoint.
- **Open:** no quarantine/malware scanning and shallow rich-file validation.
- **Open:** audit hash chain lacks verifier and independent protection.
- **Open:** PDF/scanned OCR correctness lacks a passing corpus.
- **Mitigated in Phase 2:** ADMIN no longer bypasses document authorization or uploads evidence.

### P2

- No real PostgreSQL/MinIO automated integration suite.
- Best-effort orphan cleanup has no reconciler.
- Rate limiting is per-process and vulnerable to proxy/configuration mistakes.
- Processing jobs lack lease/idempotency/backoff/dead-letter semantics.
- Internal worker uses base64 HTTP and lacks container resource limits.
- Case/document existence can be distinguished by some 403/404 paths.

### P3

- Search uses `contains` rather than PostgreSQL full-text indexes.
- Browser session token is stored in `sessionStorage`.
- Default development credentials remain convenient but dangerous if deployed.
