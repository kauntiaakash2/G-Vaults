# Frontend UI Audit

**Audited:** 29 August 2026  
**Scope:** Every route and shared frontend module under `apps/web`

## Executive assessment

The current frontend is functional, consistent and comparatively easy to
maintain. Its strongest qualities are the small App Router surface, predictable
React Query usage, straightforward forms, semantic labels, and preservation of
backend authorization. It should be improved in place rather than replaced.

The primary weaknesses are information architecture and operational density.
Most screens use the same generic panel/list pattern; security facts and actions
are not always precise; desktop layouts underuse available space while mobile
navigation removes account/sign-out context; loading and error states are plain
text; and version, access and audit data lack table semantics.

## Screen audit

| Screen | Keep | Improve | Replace | Remove | Missing |
| --- | --- | --- | --- | --- | --- |
| Login | Existing form, Zod validation, autocomplete, mutation flow | Institutional context, error association, demo separation, responsive composition | Decorative radial background and generic card treatment | Prefilled credentials | Authorized-use notice, security context |
| App shell | Protected layout, current-user query, three implemented routes | Compact hierarchy, context bar, breadcrumbs, account/department context, mobile navigation, keyboard shortcut | Wide static sidebar and mobile horizontal nav | Hidden mobile account/sign-out | Skip link, menu control, global search entry, route context |
| Dashboard | Real cases/security API data | Make work/attention primary, compact metrics, precise security wording, table density | Three oversized generic statistic cards | “Integrity verified per document” claim | Processing attention, localized loading/error states |
| Cases | Working create flow and case API | Search/filter, role-aware create action, updated timestamps, responsive data presentation | Loose link rows | None | Table semantics, meaningful empty/loading state |
| Case detail | Case/document queries, upload flow, members | Workspace hierarchy, tabs, compact metadata, document table, role-aware upload | Two-card summary plus generic list | Repeated “encrypted evidence” decoration | Clear overview/documents/access navigation |
| Document detail | All working document actions, version selection, audit/access/intelligence queries | Inspection workspace, capability-aware actions, precise integrity/processing states, structured tabs/tables, deliberate revoke | Card grid and long mixed-content page | “AI Summary” as a primary security concept | Capability metadata, confirmation dialog, persistent failure notices |
| Search | Secure backend query, same-query refetch, linked results | Filters, result count/context, historical-version clarity, loading skeleton | Card-like results | Uppercase discovery decoration | Initial guidance and secure empty/error states |

## Cross-cutting findings

### Keep

- Next.js App Router and protected route group.
- `AppShell`, `Providers`, API helpers and shared API types.
- Existing route URLs and backend contracts where possible.
- React Query for server state and mutation confirmation.
- Native form controls and current no-icon-library dependency policy.

### Improve

- Replace hard-coded visual values with semantic CSS tokens.
- Establish compact page-header, status, table, notice, skeleton and empty/error
  patterns.
- Use state color only for status/severity; use borders rather than shadows for
  ordinary surfaces.
- Make all focus states keyboard-visible and meet 44px mobile touch targets.
- Keep OCR text escaped as text and constrain very long content.
- Provide responsive sidebar overlay instead of removing account controls.

### Replace

- Generic nested cards with tables, split workspaces and flat sections.
- Excessively large mobile statistic cards with compact summary rows.
- Loose timeline rows for version/access/audit data with structured tables.

### Remove

- Decorative radial login gradient.
- Misleading “integrity verified per document” dashboard statement.
- Default credential prepopulation.
- Excessive all-caps/pill treatment for ordinary metadata.

### Missing but not to be faked

Legal holds, classification, provenance kinds, derived/redacted version kinds,
retention, audit explorer and administration routes are not implemented by the
backend. The redesign must leave clean extension points but expose no functional
controls for them.

## Design direction

- **Tone:** calm, authoritative, precise and information-dense.
- **Structure:** My Work → Cases → Document → Version/action.
- **Palette:** neutral slate surfaces, deep institutional navy, restrained teal
  accent, semantic green/amber/red only for meaningful state.
- **Type:** system sans-serif with compact 14–16px operational text and modest
  30–36px page headings.
- **Geometry:** 6–10px controls/panels; minimal shadow; strong one-pixel borders.
- **Interaction:** backend-confirmed mutations, visible focus, localized loading,
  persistent critical errors and deliberate destructive confirmation.

