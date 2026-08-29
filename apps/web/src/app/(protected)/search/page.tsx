'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CaseSummary } from '@sih/shared';
import { api } from '@/lib/api';
import { Icon, PageHeader, SkeletonRows, StateMessage, StatusBadge } from '@/components/ui';

type Department = { id: string; name: string; code: string };
type SearchFilters = { q: string; caseId: string; departmentId: string; documentType: string; createdFrom: string; createdTo: string };
type Result = { id: string; title: string; documentType: string; case: { caseNumber: string; title: string }; version: { id: string; number: number } | null; matchedText: string | null; ocrStatus: string };

const emptyFilters: SearchFilters = { q: '', caseId: '', departmentId: '', documentType: '', createdFrom: '', createdTo: '' };

export default function SearchPage() {
  const [draft, setDraft] = useState<SearchFilters>(emptyFilters);
  const [submitted, setSubmitted] = useState<SearchFilters | null>(null);
  const cases = useQuery({ queryKey: ['cases'], queryFn: () => api<CaseSummary[]>('/cases') });
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<Department[]>('/departments') });
  const searchUrl = useMemo(() => submitted ? buildSearchUrl(submitted) : '', [submitted]);
  const results = useQuery({ queryKey: ['search', searchUrl], queryFn: () => api<Result[]>(searchUrl), enabled: Boolean(searchUrl) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = { ...draft, q: draft.q.trim() };
    if (!next.q) return;
    if (submitted && buildSearchUrl(next) === searchUrl) void results.refetch();
    else setSubmitted(next);
  };

  const clear = () => { setDraft(emptyFilters); setSubmitted(null); };
  const set = (key: keyof SearchFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return <>
    <PageHeader eyebrow="Records discovery" title="Search documents" description="Search titles, case references, and extracted text within your current access scope."/>
    <section className="section-surface search-workspace" aria-labelledby="search-heading">
      <div className="section-heading"><div><p className="section-kicker">Permission-scoped retrieval</p><h2 id="search-heading">Find an authorised record</h2></div><div className="secure-scope"><Icon name="lock"/><span>The API applies access policy before returning results.</span></div></div>
      <form className="search-form" onSubmit={submit} role="search">
        <label className="search-control search-control-large" htmlFor="document-search"><span className="sr-only">Search documents</span><Icon name="search"/><input autoFocus id="document-search" value={draft.q} onChange={(event) => set('q', event.target.value)} placeholder="Search document title, case number, or extracted text" required maxLength={200}/></label>
        <button className="button primary" type="submit" disabled={!draft.q.trim() || results.isFetching}>{results.isFetching ? 'Searching…' : 'Search'}</button>
        <div className="search-filters">
          <label><span>Case</span><select value={draft.caseId} onChange={(event) => set('caseId', event.target.value)}><option value="">All accessible cases</option>{cases.data?.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} — {item.title}</option>)}</select></label>
          <label><span>Department</span><select value={draft.departmentId} onChange={(event) => set('departmentId', event.target.value)}><option value="">All departments</option>{departments.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Document type</span><input value={draft.documentType} onChange={(event) => set('documentType', event.target.value)} placeholder="e.g. REPORT" maxLength={100}/></label>
          <label><span>Created from</span><input type="date" value={draft.createdFrom} onChange={(event) => set('createdFrom', event.target.value)}/></label>
          <label><span>Created to</span><input type="date" value={draft.createdTo} onChange={(event) => set('createdTo', event.target.value)}/></label>
          <button className="text-button filter-clear" type="button" onClick={clear} disabled={!submitted && Object.values(draft).every((value) => !value)}>Clear</button>
        </div>
      </form>
    </section>

    <section className="section-surface search-results-section" aria-labelledby="results-heading">
      <div className="section-heading"><div><p className="section-kicker">Results</p><h2 id="results-heading">Authorised documents</h2></div>{results.data && <span className="result-count" aria-live="polite">{results.data.length} {results.data.length === 1 ? 'result' : 'results'}</span>}</div>
      {!submitted ? <StateMessage title="Enter a search term to begin" detail="Results will include only documents you are currently permitted to discover."/> : results.isPending ? <SkeletonRows rows={4}/> : results.error ? <StateMessage tone="danger" title="Search could not be completed" detail={results.error.message} action={<button className="button secondary" onClick={() => results.refetch()}>Try again</button>}/> : results.data?.length ? <div className="search-results">{results.data.map((item) => <Link className="search-result" href={`/documents/${item.id}`} key={`${item.id}-${item.version?.id ?? 'current'}`}><div className="search-result-main"><div className="search-result-heading"><span className="document-type">{formatStatus(item.documentType)}</span><h3>{item.title}</h3></div><p className="result-context"><strong>{item.case.caseNumber}</strong><span aria-hidden="true">/</span>{item.case.title}</p>{item.matchedText && <p className="snippet">{item.matchedText}</p>}</div><div className="result-meta"><span className="version-label">v{item.version?.number ?? '—'}</span><StatusBadge tone={processingTone(item.ocrStatus)}>{formatStatus(item.ocrStatus)}</StatusBadge><Icon name="chevron"/></div></Link>)}</div> : <StateMessage title="No authorised documents matched" detail="Try a broader term or remove one of the filters. Documents outside your access scope are never shown."/>}
    </section>
  </>;
}

function buildSearchUrl(filters: SearchFilters) {
  const params = new URLSearchParams({ q: filters.q });
  for (const key of ['caseId', 'departmentId', 'documentType', 'createdFrom', 'createdTo'] as const) if (filters[key]) params.set(key, filters[key]);
  return `/search?${params.toString()}`;
}

function formatStatus(value: string) { return value.replaceAll('_', ' '); }
function processingTone(value: string): 'success' | 'danger' | 'warning' | 'neutral' { return value === 'COMPLETED' ? 'success' : value === 'FAILED' ? 'danger' : value === 'PENDING' ? 'warning' : 'neutral'; }
