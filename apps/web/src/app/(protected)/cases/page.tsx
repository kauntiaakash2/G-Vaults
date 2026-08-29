'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import type { AuthUser, CaseSummary } from '@sih/shared';
import { api } from '@/lib/api';
import { Icon, PageHeader, SkeletonRows, StateMessage, StatusBadge, formatRelative } from '@/components/ui';

type Department = { id: string; name: string; code: string };

export default function CasesPage() {
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [department, setDepartment] = useState('ALL');
  const cases = useQuery({ queryKey: ['cases'], queryFn: () => api<CaseSummary[]>('/cases') });
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<Department[]>('/departments') });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<AuthUser>('/auth/me') });
  const createCase = useMutation({
    mutationFn: (body: object) => api<CaseSummary>('/cases', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['cases'] }); setShowForm(false); },
  });

  const canCreate = Boolean(me.data && ['ADMIN', 'INVESTIGATOR', 'SENIOR_OFFICER', 'DEPARTMENT_HEAD'].includes(me.data.role));
  const allowedDepartments = me.data?.role === 'ADMIN' ? departments.data : departments.data?.filter((item) => item.id === me.data?.departmentId);
  const visibleCases = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (cases.data ?? []).filter((item) => (!term || `${item.caseNumber} ${item.title} ${item.department.name}`.toLocaleLowerCase().includes(term)) && (status === 'ALL' || item.status === status) && (department === 'ALL' || item.department.id === department));
  }, [cases.data, department, search, status]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createCase.mutate({ caseNumber: data.get('caseNumber'), title: data.get('title'), description: data.get('description') || undefined, departmentId: data.get('departmentId') });
  };

  return <>
    <PageHeader eyebrow="Investigations" title="Cases" description="Open and manage investigations within your assigned membership and department scope." actions={canCreate && <button className="button primary" aria-expanded={showForm} aria-controls="new-case-panel" onClick={() => setShowForm((value) => !value)}><Icon name={showForm ? 'close' : 'plus'}/>{showForm ? 'Close form' : 'New case'}</button>}/>

    {showForm && <section className="section-surface form-surface" id="new-case-panel" aria-labelledby="new-case-heading"><div className="section-heading"><div><p className="section-kicker">Create record</p><h2 id="new-case-heading">New investigation case</h2><p>Case creation is restricted to your department unless you are an administrator.</p></div></div><form className="form-grid" onSubmit={submit}>
      <label htmlFor="caseNumber"><span>Case number</span><input id="caseNumber" name="caseNumber" placeholder="CYB-2026-002" required pattern="[A-Z0-9][A-Z0-9/-]{2,39}"/><small>3–40 uppercase letters, numbers, slashes or hyphens.</small></label>
      <label htmlFor="departmentId"><span>Department</span><select id="departmentId" name="departmentId" required defaultValue=""><option value="" disabled>Select department</option>{allowedDepartments?.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label>
      <label className="full" htmlFor="caseTitle"><span>Case title</span><input id="caseTitle" name="title" minLength={3} maxLength={200} required/></label>
      <label className="full" htmlFor="caseDescription"><span>Description <em>Optional</em></span><textarea id="caseDescription" name="description" rows={3} maxLength={5000}/></label>
      {createCase.error && <div className="full"><StateMessage tone="danger" title="Case could not be created" detail={createCase.error.message}/></div>}
      <div className="form-actions full"><button className="button secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={createCase.isPending} type="submit">{createCase.isPending ? 'Creating case…' : 'Create case'}</button></div>
    </form></section>}

    <section className="section-surface" aria-labelledby="case-register-heading">
      <div className="section-heading"><div><p className="section-kicker">Case register</p><h2 id="case-register-heading">Accessible investigations</h2></div><span className="result-count">{visibleCases.length} {visibleCases.length === 1 ? 'case' : 'cases'}</span></div>
      <div className="filter-bar" role="search"><label className="search-control"><span className="sr-only">Search cases</span><Icon name="search"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case number, title, or department"/></label><label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option></select></label><label><span className="sr-only">Filter by department</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="ALL">All departments</option>{departments.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      {cases.isPending ? <SkeletonRows rows={5}/> : cases.error ? <StateMessage tone="danger" title="Cases could not be loaded" detail={cases.error.message}/> : visibleCases.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Case</th><th>Department</th><th>Status</th><th>Created by</th><th>Updated</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{visibleCases.map((item) => <tr key={item.id}><td><Link className="primary-cell" href={`/cases/${item.id}`}><strong>{item.title}</strong><span>{item.caseNumber}</span></Link></td><td><span className="cell-stack"><strong>{item.department.name}</strong><small>{item.department.code}</small></span></td><td><StatusBadge tone={caseTone(item.status)}>{formatStatus(item.status)}</StatusBadge></td><td>{item.createdBy.name}</td><td><time title={new Date(item.updatedAt).toLocaleString()} dateTime={item.updatedAt}>{formatRelative(item.updatedAt)}</time></td><td><Link className="row-action" aria-label={`Open ${item.title}`} href={`/cases/${item.id}`}><Icon name="chevron"/></Link></td></tr>)}</tbody></table></div> : <StateMessage title={cases.data?.length ? 'No cases match these filters' : 'No accessible cases'} detail={cases.data?.length ? 'Change or clear a filter to see more investigations.' : 'Cases will appear when you create one or are assigned as a member.'}/>} 
    </section>
  </>;
}

function formatStatus(value: string) { return value.replaceAll('_', ' '); }
function caseTone(value: string): 'success' | 'neutral' | 'info' { return value === 'OPEN' ? 'success' : value === 'IN_PROGRESS' ? 'info' : 'neutral'; }
