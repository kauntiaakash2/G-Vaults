# Phase 1 access-control policy

Authentication establishes the user's identity from a short-lived JWT. The API then performs authorization against current database state.

| Operation | Allowed roles/resources |
| --- | --- |
| List/create users | `ADMIN` |
| List departments | Any authenticated active user |
| Create department | `ADMIN` |
| List cases | `ADMIN`/`AUDITOR`: all; `DEPARTMENT_HEAD`: own department; others: explicit membership |
| Create case | `ADMIN`, `INVESTIGATOR`, `SENIOR_OFFICER`, `DEPARTMENT_HEAD` |
| Read case | Same resource rules as list cases |

The case creator is inserted into `case_members` as `OWNER`. Document permissions are intentionally excluded from JWT claims and will be evaluated from `document_permissions` when document APIs are introduced.
