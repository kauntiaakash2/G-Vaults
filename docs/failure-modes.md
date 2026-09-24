# Failure Modes and Recovery

**Last verified:** 24 September 2026

This document describes implemented failure behavior and known recovery gaps. It does not claim high availability or fully autonomous recovery.

## Processing-job lifecycle

```text
QUEUED
  → RUNNING
      → SUCCEEDED
      → RETRY_PENDING
      → FAILED
      → DEAD
```

- `QUEUED`: available to be claimed.
- `RUNNING`: claimed with `lockedAt` and an internal `lockedBy` identifier.
- `SUCCEEDED`: extraction and persistence completed.
- `RETRY_PENDING`: a transient dependency or processing failure occurred before `maxAttempts` was exhausted.
- `FAILED`: a non-retryable failure occurred, currently authenticated-decryption failure.
- `DEAD`: transient failures exhausted the configured attempt limit.

Claims use an atomic conditional database update. A second request that loses the claim does not process the same job. A `RUNNING` lease older than 60 seconds can be reclaimed when processing is triggered again. Retry delay uses exponential backoff metadata beginning at five seconds.

Current limitation: there is no continuously polling background dispatcher. Upload creates a durable `QUEUED` record, and an authorised processing request executes it synchronously. `RETRY_PENDING` and expired leases resume when processing is triggered again. The state model is therefore implemented and tested, while autonomous scheduled execution remains future work.

## Cross-system failure matrix

| Failure | Detection | User impact | Current recovery | Data integrity | Audit |
| --- | --- | --- | --- | --- | --- |
| MinIO write succeeds, DB transaction fails | API catches transaction failure | Upload/version request fails | Best-effort object deletion | DB does not reference the failed object | Operation failure is not yet guaranteed to be audited |
| DB metadata exists, MinIO object is missing | Storage read fails | Preview/download/processing fails safely | Manual restoration or reconciliation required | Metadata remains; source cannot be served | Integrity/read paths record failures where implemented |
| OCR service unavailable | Worker call fails | Source remains available; extracted text is unavailable | Job becomes `RETRY_PENDING`, then `DEAD` after maximum attempts | Source bytes and recorded digest remain unchanged | Retry/termination event recorded |
| Authenticated decryption fails | AES-GCM authentication fails | Processing and document read are denied | Incident review and protected backup restoration required | No unauthenticated plaintext is returned | Processing becomes `FAILED`; integrity paths record failure |
| API process crashes while job is running | Lease remains | Processing appears running temporarily | Expired lease is reclaimable on a later trigger | Source remains unchanged | Crash itself may require operational logs |
| Duplicate process requests | Atomic claim count is zero for losers | One request performs work; others observe current state | No operator action normally required | Prevents concurrent duplicate execution | Processing start recorded by winner |
| Retried mutating HTTP request | Idempotency ledger finds the same user/scope/key | Completed response is replayed; changed input is rejected | Reuse the original key and payload | Prevents duplicate logical mutation during the 24-hour retention window | Original operation owns the audit event |
| Stale lifecycle, legal-hold or revocation request | Conditional update matches zero rows | API returns `409 Conflict` and asks the user to refresh | Reload the latest document/grant/hold revision and make a new decision | Prevents silent last-write-wins overwrite | No success event is written for the rejected mutation |
| Concurrent duplicate active hold or grant | PostgreSQL partial unique index rejects the losing insert | One request succeeds; the other returns `409 Conflict` | Refresh current holds/grants | Preserves one active hold and one active principal/capability grant | Only the committed operation writes success audit/custody events |
| Domain commit succeeds but idempotency completion write fails | Ledger remains `IN_PROGRESS` | Retry receives `409` until reconciliation/expiry | Inspect the committed resource before releasing the key | Fails closed against immediate duplication | Domain audit may exist without completed replay state |
| Maximum processing attempts exhausted | Attempt counter reaches `maxAttempts` | Extraction remains unavailable | Authorised manual requeue creates a fresh job; operator should investigate first | Original remains accessible | Terminal processing event recorded |
| Search indexing/extraction fails | Missing/failed OCR result | Content match is unavailable | Retry processing | Document title/case search and source access remain available | Processing failure recorded |

## Tested behavior

- Successful job claim and lease cleanup.
- Transient failure becomes `RETRY_PENDING`.
- Final transient attempt becomes `DEAD`.
- Authenticated-decryption failure becomes non-retryable `FAILED`.
- Real PostgreSQL persists `SUCCEEDED`, attempt count and cleared lease.
- Real MinIO source remains encrypted throughout processing.
- Existing browser document workflow remains functional after migration.
- Identical upload and processing retries replay without duplicate database/storage records.
- Reusing an idempotency key with changed upload data returns `409 Conflict`.
- A stale document revision returns `409 Conflict` in both mocked API regression and real PostgreSQL integration tests.
- Fresh PostgreSQL migration creates and exercises the active-hold/active-grant constraints.

## Remaining Phase 3 work

- Add a bounded background dispatcher for due jobs.
- Add heartbeat/lease extension for operations legitimately exceeding 60 seconds.
- Add an idempotency reconciliation command for stale claimed keys.
- Add forced crash and dependency-outage tests.
- Add missing-object/orphan-object reconciliation.
- Add structured correlation IDs across API, storage, audit and worker calls.
- Establish measured worker timeouts and resource limits.
