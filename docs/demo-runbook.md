# Phase 4 demo runbook

## Start

```bash
cp .env.example .env
npm install
npm run infra:up
npm run db:deploy
npm run db:seed
npm run dev
```

Use the configured seed password with these fictional accounts:

| Account | Role | Department |
| --- | --- | --- |
| `investigator.a@sih.local` | Investigator | Cyber Crime Unit |
| `investigator.b@sih.local` | Investigator | Financial Crime Unit |
| `head@sih.local` | Department Head | Cyber Crime Unit |
| `auditor@sih.local` | Auditor | All records (read-only) |
| `admin@sih.local` | Administrator | All records |

## Story

1. Log in as Investigator A and open `CYB-2026-001`.
2. Upload a fictional PDF or Markdown report. The API validates its signature,
   hashes the plaintext, encrypts the bytes with AES-256-GCM, stores only the
   encrypted object in MinIO, creates version 1, and queues OCR.
3. Select **Extract text & summarize**. Text extraction and the clearly marked
   prototype summary are stored separately from the source file.
4. Search for a concept in **Search**. The database applies the permission
   scope before returning titles or snippets.
5. Upload a second version and show v1 preserved and v2 current.
6. Grant Department B `VIEW`, switch to Investigator B, and demonstrate that
   download remains denied until `DOWNLOAD` is granted (or the appropriate
   access policy is selected). Revoke the grant and retry to show 403.
7. Run **Verify**. Explain that SHA-256 detects changed bytes; it does not
   prevent a modification. A controlled object tamper produces `MISMATCH` and
   an audit event.

## Failure guarantees

If OCR or summary processing fails, the encrypted source, versions, normal
download, permissions, audit trail, and metadata remain available. Logs contain
IDs and timings only; document contents are never logged.

For production, replace the local Docker services with managed PostgreSQL and
S3-compatible storage, KMS/Vault-backed keys, and dedicated OCR/AI workers
behind the existing storage and processing interfaces.
