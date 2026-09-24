# Access-control policy

**Verified:** 29 August 2026

## Model

The API implements deny-by-default authorization using four current-state inputs:

1. JWT authentication reloads the active user and current role from PostgreSQL.
2. Role guards limit administrative and creation operations.
3. Case membership/department policy scopes cases.
4. Document creator authority, auditor read policy, classification clearance and explicit user/department grants scope documents.

Document grants are not stored in JWTs. Activation, expiry and revocation are evaluated against PostgreSQL on every request.

## Separation of duties

`ADMIN` is a platform-administration role. It can manage users and departments and retains the existing case-administration policy, but it no longer receives automatic document/evidence access and cannot upload evidence. An administrator needs an explicit resource grant and must still satisfy classification clearance; the current prototype maps `ADMIN` only to `INTERNAL` content. This deliberately separates platform administration from investigative-content authority.

`AUDITOR` receives read-only document visibility within its classification clearance. It does not receive download, edit, share or approval authority.

Document creators receive document capabilities only while their role clearance covers the document classification. No role may bypass the classification check.

## Classification clearance

| Role | Maximum classification |
| --- | --- |
| ADMIN | INTERNAL |
| INVESTIGATOR | RESTRICTED |
| SENIOR_OFFICER | CONFIDENTIAL |
| DEPARTMENT_HEAD | HIGHLY_RESTRICTED |
| AUDITOR | CONFIDENTIAL |

These labels are a prototype taxonomy, not verified NCRB/MHA classifications.

## Document capabilities

| Required capability | Satisfying grant |
| --- | --- |
| VIEW | VIEW, DOWNLOAD, EDIT, SHARE or APPROVE |
| DOWNLOAD | DOWNLOAD only |
| EDIT | EDIT only |
| SHARE | SHARE only |
| APPROVE | APPROVE only |

VIEW is implied by a stronger capability so a user can inspect metadata needed to exercise it. Export remains independent: EDIT, SHARE and APPROVE never imply DOWNLOAD.

## Grant lifecycle

Each grant records its principal, capability, grantor, reason, `validFrom`, optional `validUntil`, status, revision, and—on revocation—the revoker, time and reason. A grant authorizes only when active, already started, not expired and matched to the current user or department. PostgreSQL partial unique indexes prevent concurrent duplicate active principal/capability grants. Revocation checks the latest grant revision and returns `409 Conflict` for stale state. Expired rows do not authorize access. Successful revocation is immediate for new requests using the same JWT.

## Record controls

Legal holds and record-status changes require `APPROVE`. Provenance and hold history require `VIEW`. An active hold blocks transition to `DISPOSED`; denial is written to audit and custody history.

## Known limitations

- Case administration still permits `ADMIN` to see all case metadata; evidence bytes remain separately protected.
- Classification is role-based; per-user clearance and compartments are not implemented.
- No break-glass workflow exists.
- Case membership management is not yet a complete API/UI workflow.
- Unauthorized known resources return 403, so existence may be inferable when an ID is already known.
