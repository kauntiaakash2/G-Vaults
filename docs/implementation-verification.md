# Implementation Verification Matrix

**Verification date:** 29 August 2026  
**Scope:** Phase 1 repository, automated-test, and local Docker/runtime verification  
**Source claim set:** [`implementation-status.md`](implementation-status.md)

Documentation is not treated as proof. Statuses below describe the evidence that
was actually located or executed. The existing Jest suites use mocked Prisma and
object storage; those tests are useful API regressions but are not full
PostgreSQL/MinIO integration tests.

| ID | Claim | Claimed status | Code evidence | Test evidence | Runtime evidence | Actual status | Risk | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V-01 | Next.js, NestJS, Prisma/PostgreSQL, MinIO and optional FastAPI OCR compose the MVP | Implemented | Root workspaces; `AppModule`; Prisma schema; `docker-compose.yml` | Build completed | Web/API/PostgreSQL/MinIO/OCR observed running | VERIFIED | Low | Keep modular monolith |
| V-02 | Database migrations and seed work | Complete | Four checked-in migrations and `prisma/seed.ts` | Not covered by Jest | `prisma migrate deploy`: no pending migrations; seed completed | VERIFIED | Low | Add disposable-DB migration test later |
| V-03 | Passwords are bcrypt hashes and login issues JWTs | Complete | `AuthService`, seed script, `JwtStrategy` | Correct/wrong password tests pass | Seeded login and `/auth/me` worked | VERIFIED | Low | Production identity/MFA remains absent |
| V-04 | Missing, malformed and expired JWTs are rejected | Complete | Passport JWT strategy validates signature/type/expiry | Missing, invalid and expired token tests pass | Missing token returned 401 | VERIFIED | Low | Add key-rotation/session-revocation design later |
| V-05 | Inactive users are rejected | Complete | Login and per-request JWT validation query current user status | Inactive-login test passes | Not separately changed in live DB | VERIFIED | Low | Add runtime administration test later |
| V-06 | Roles protect administrative operations | Complete | `RolesGuard`; controller `@Roles` decorators | Admin allowed/investigator denied on users endpoint | Admin login verified | VERIFIED | Medium | Build a full endpoint/role matrix |
| V-07 | Case access is membership/department scoped | Complete | `CasesService.accessFilter` | Member allowed/non-member denied | Investigator dashboard showed only two assigned cases | VERIFIED | Medium | Unauthorized 403 reveals known-case existence |
| V-08 | Non-admin users cannot create cases in another department | Previously undocumented | `CasesService.create` now rejects department mismatch | New cross-department test passes | Not destructively attempted in live data | VERIFIED | Low | Retain regression test |
| V-09 | Document permissions are read from current DB state | Complete | `DocumentAuthorizationService` queries active grants on every call | Grant/revoke regression passes | Live grant allowed access; revoke with same login denied immediately | VERIFIED | Low | Add grant-expiry in Phase 2 |
| V-10 | VIEW does not imply DOWNLOAD | Complete | Strict permission query | VIEW metadata 200/download 403 test passes | Live VIEW user could not download | VERIFIED | Low | Retain regression test |
| V-11 | SHARE does not imply DOWNLOAD | Claimed by “independent capabilities” | Before fix, DOWNLOAD accepted SHARE; fixed to accept only DOWNLOAD | New SHARE-only download-denial test passes | Before fix: SHARE-only produced 200; after fix covered by regression suite | VERIFIED AFTER FIX | High | P1 authorization escalation fixed |
| V-12 | Known document UUID cannot bypass authorization | Complete | Authorization precedes document operations | Outsider-known-ID test passes | Live revoked user received 403 | VERIFIED | Low | Historical-version negative test remains desirable |
| V-13 | Search applies authorization in the database query | Complete | `SearchService` combines scope and query under `AND` | No dedicated DB integration test | Exact secret returned zero results while VIEW was revoked, then returned after restoration | VERIFIED | Medium | Add disposable-DB search integration test |
| V-14 | Search does not reveal unauthorized title/snippet/existence | Complete | Response is produced only from scoped query | No dedicated Jest case | Live exact-secret negative test passed | VERIFIED | Medium | Avoid changing 403/404 semantics without policy decision |
| V-15 | Upload validates size, extension, MIME, signature and filename | Complete | `FileValidationService`; Multer memory/size limits | Invalid signature, oversize and traversal-name tests pass | Normal PDF/text uploads observed | PARTIALLY VERIFIED | High | PDF validation is header-only; DOCX accepts any ZIP; no malware scan/quarantine |
| V-16 | Upload is fully secure against hostile files | Implied “secure document upload” | No quarantine, malware scanner, content disarm, parser sandbox or archive inspection | Controlled 68-byte EICAR antivirus test artifact passed basic text validation | No runtime scanner exists | FALSE | High | Add quarantine/scanner design and scanner-backed EICAR rejection test; do not call pipeline fully secure |
| V-17 | Client filename cannot choose storage path | Complete | Generated UUID key; sanitized filename is metadata only | Traversal-name test passes | Uploaded traversal-like filename normalized | VERIFIED | Low | Retain validation tests |
| V-18 | Document plaintext is not stored in PostgreSQL | Complete | Schema stores metadata/hash/key only | Schema inspection | Database schema/live behavior consistent | VERIFIED | Low | OCR text is intentionally stored and remains sensitive |
| V-19 | MinIO stores AES-256-GCM ciphertext | Complete | `EncryptionService` and `MinioStorageService` | Envelope magic and plaintext-absence mocked-storage test passes | Real object has `SIH1`, 32-byte envelope overhead, AES metadata and ciphertext hash different from plaintext hash | VERIFIED | Medium | KMS/envelope-key production design remains |
| V-20 | AES-256-GCM key/IV/tag handling is sound for MVP | Complete | Exact 32-byte key validation; random 12-byte nonce; 16-byte tag; storage-key AAD | Tampered-envelope path tested | Live verification/download worked | VERIFIED | Medium | Prototype env key lacks KMS, rotation and envelope encryption |
| V-21 | SHA-256 is computed over each original version | Complete | Hash precedes encryption on create/version; verification hashes decrypted bytes | Integrity mismatch test passes | Live verification returned VERIFIED | VERIFIED | Low | Keep terminology as fixity/integrity, not encryption |
| V-22 | Versions are immutable | Complete | New rows/keys are created; no update-bytes API | v1/v2/history/download test passes | UI showed preserved history | PARTIALLY VERIFIED | High | This is application-level append-only behavior, not storage WORM; privileged DB/MinIO actors can alter/delete |
| V-23 | Historical versions remain accessible with authorization | Complete | Version ID is resolved within document after document authorization | Owner downloads v1 and current v2 in test | Historical version UI observed | VERIFIED | Medium | Add outsider historical-version test explicitly |
| V-24 | Storage paths are never exposed | Claimed “no public storage URL” | No presigned URL, but old response spread `storageKey`; response now allowlists fields | New response-redaction assertions pass | Live API confirms internal fields absent after fix | VERIFIED AFTER FIX | Medium | P1 internal topology leak fixed |
| V-25 | Failed DB operations clean stored objects | Complete | Best-effort `cleanup()` on create/version error | Mock cleanup not failure-injected | Not runtime tested | PARTIALLY VERIFIED | Medium | No reconciliation process or verified lifecycle rule exists |
| V-26 | Audit events are hash chained | Complete | Advisory lock, `previousHash`, stable JSON, SHA-256 event hash | Audit side effects inspected in API tests | Live audit events observed | PARTIALLY VERIFIED | High | No chain verifier, DB append-only enforcement, external archive or WORM; not immutable |
| V-27 | Normal users cannot edit/delete audit events | Complete | No audit mutation controller | No direct endpoint test | No mutation route exposed | VERIFIED AT API LAYER | Medium | Database administrators remain able to alter/truncate |
| V-28 | OCR worker receives bytes, not arbitrary paths | Implemented | Typed base64 request schema | No Python automated suite | Plain-text worker probe succeeded | VERIFIED | Low | Keep internal contract versioned |
| V-29 | OCR worker is an authenticated internal boundary | Previously implied “trusted API worker” | Token header, constant-time compare, 30M-character cap, non-root image | API tests unaffected | Missing/wrong token 401; correct token 200; container user `ocrworker`; localhost bind | VERIFIED AFTER FIX | Medium | Use a generated non-default token outside local development |
| V-30 | OCR failures do not create false completed output | Implemented | Parser exceptions now propagate instead of becoming `paddleocr_unavailable` success | No OCR corpus suite | Malformed image returned 500; valid text returned 200 | VERIFIED FOR FAILURE STATE | High | Add scanned/malformed PDF corpus; document remains usable when job fails |
| V-31 | PDF/image OCR works | Implemented; worker required | PyMuPDF first, PaddleOCR fallback | No checked-in OCR integration test | User observed text PDF failure earlier; text/Markdown worked | PARTIALLY VERIFIED | High | Real PDF/scanned corpus is required before “MVP complete” claim |
| V-32 | AI summary exists | Complete | First 600 extracted characters stored as `extractive-prototype` | Indirectly exercised | UI displayed result | VERIFIED AS PROTOTYPE | Low | It is not an LLM summary and may be poor/inaccurate |
| V-33 | Source evidence is not modified by OCR/summary/search | Complete | Derived DB rows only; source object read/decrypted | Version/integrity regression passes | Source remained downloadable | VERIFIED | Low | Formal derived-artifact provenance is Phase 2 |
| V-34 | Application-layer rate limits protect login/search/download | Implemented | In-memory IP/path limiter | No automated limiter test | Bounded run: login 8×401 + 4×429; search 60×200 + 5×429 | VERIFIED WITH LIMITATIONS | Medium | Per-process memory state; proxy/IP trust and map growth need hardening; not DDoS protection |
| V-35 | MinIO bucket is private | Complete | Init explicitly sets anonymous policy to none | None | Anonymous object request returned 403 | VERIFIED | Low | Default local credentials still must never be deployed |
| V-36 | Infrastructure is locally isolated | Previously broad host binds | Compose binds database, MinIO and OCR to `127.0.0.1` | Compose build tested | All three service ports observed on localhost; DB/MinIO healthy | VERIFIED FOR LOCAL COMPOSE | Medium | Production still requires network policy/TLS |
| V-37 | Tests are end-to-end | Called e2e | Test module overrides Prisma and storage | 20/20 pass | Separate live probes were required | FALSE / DOCUMENTATION DRIFT | Medium | Rename/augment with real Docker-backed integration tests |
| V-38 | Browser login works | Complete | Playwright config/login spec | Previously executed: 1/1 pass | User used dashboard | VERIFIED | Low | Expand browser authorization flows |
| V-39 | Build and lint pass | Complete | npm scripts | Lint pass; API 22/22; Playwright 1/1; production build pass | Apps running | VERIFIED | Low | Keep in release gate |
| V-40 | System is production ready | Remaining production work acknowledged | No KMS, MFA/IdP, malware scan, protected audit archive, DR proof, SIEM or production deployment | Not applicable | Local Docker only | NOT IMPLEMENTED | Critical if misrepresented | Classify as hardened hackathon MVP at most after Phase 1 |

## Confirmed documentation drift

- “Immutable versions” meant application-level append-only creation, not
  storage-enforced immutability or WORM.
- “Tamper-evident audit chain” is incomplete without a verifier and protected
  archive; hash links are written but can be rewritten by a privileged database
  actor.
- “Secure upload” overstated hostile-file controls because quarantine and
  malware scanning do not exist.
- “API e2e tests” overstated integration depth because Prisma and storage are
  replaced by in-memory mocks.
- “PDF/image extraction implemented” remains only partially demonstrated; a
  representative OCR corpus has not passed.

## Phase 2 verification addendum

The following results were added after the Phase 1 matrix. They are code and mocked-infrastructure API verification until the new migration is deployed to a running local PostgreSQL instance.

| ID | Claim | Evidence | Actual status |
| --- | --- | --- | --- |
| P2-01 | ADMIN has no automatic evidence access | Bypass removed; known-ID ADMIN request test returns 403 | VERIFIED IN API TEST |
| P2-02 | Expired grants do not authorize | Time predicate in authorization/search/list; expired-grant request test returns 403 | VERIFIED IN API TEST |
| P2-03 | Original and revisions are distinguishable | Schema/DTO response; upload ORIGINAL and v2 REVISION lineage assertions | VERIFIED IN API TEST |
| P2-04 | Derived/redacted artifacts identify a source | Service requires same-document `sourceVersionId` and sets non-authoritative | IMPLEMENTED; NEGATIVE TEST PENDING |
| P2-05 | Active legal hold blocks disposition | Hold/status API test returns 409, source status unchanged, audit/custody denial present | VERIFIED IN API TEST |
| P2-06 | Custody events are separate from audit | `custody_events`, service/API and provenance response assertions | VERIFIED IN API TEST |
| P2-07 | Classification limits evidence access | Central clearance predicate applied to resource/list/search | IMPLEMENTED; MATRIX TEST PARTIAL |
| P2-08 | Phase 2 migration works on PostgreSQL | Fifth migration applied to local PostgreSQL; seed rerun completed | VERIFIED AT LOCAL RUNTIME |
