# Provenance and custody-event tracking

The system stores explicit `custody_events` in addition to security `audit_events`. This is technical provenance tracking, not a claim of legally sufficient chain of custody.

| Audit | Custody/provenance |
| --- | --- |
| Security/accountability events | Evidence history and lifecycle meaning |
| Hash-linked globally | Relational event history |
| Includes success, denial and failure | Includes upload, access, derivation, verification, holds and status changes |

Recorded custody types include upload, derivation, access, download, verification, access grant/revoke, hold place/release, record status change and blocked disposition. Each event can reference case, document, version, actor and structured details. Mutation events are created in the same transaction as their domain change where supported.

## Version provenance

`DocumentVersion` records kind (`ORIGINAL`, `REVISION`, `DERIVED`, `REDACTED`), parent version, source version, authority flag and optional transformation type. Version 1 is original. Revisions are authoritative by default. Derived/redacted versions require a source version from the same document and are non-authoritative. OCR and summaries remain separate artifacts and never alter source bytes.

## Limitations

Custody rows are not hash linked, signed, externally timestamped or stored in WORM media. Privileged database operators remain in the trust model. Legal sufficiency requires organizational policy and legal review.
