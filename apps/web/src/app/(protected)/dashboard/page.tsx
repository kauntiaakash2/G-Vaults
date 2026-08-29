'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { CaseSummary } from '@sih/shared';
import { api } from '@/lib/api';
import { Icon, PageHeader, SkeletonRows, StateMessage, StatusBadge, formatRelative } from '@/components/ui';

export default function DashboardPage() {
  const cases = useQuery({ queryKey: ['cases'], queryFn: () => api<CaseSummary[]>('/cases') });
  const security = useQuery({ queryKey: ['security-stats'], queryFn: () => api<{ documents: number; processing: number; auditEvents: number; encryption: string }>('/documents/security-stats') });
  const active = cases.data?.filter((item) => item.status !== 'CLOSED' && item.status !== 'ARCHIVED').length ?? 0;

  return <>
    <PageHeader eyebrow="My work" title="Operational overview" description="Your assigned cases, protected records, and processing items requiring attention." actions={<Link className="button primary" href="/cases"><Icon name="cases"/>Open cases</Link>}/>

    {(cases.error || security.error) && <StateMessage tone="danger" title="Workspace data could not be loaded" detail={(cases.error || security.error)?.message}/>} 

    <section className="summary-strip" aria-label="Workspace summary">
      <Link href="/cases"><span>Active cases</span><strong>{cases.isPending ? '—' : active}</strong><small>Assigned to your scope</small></Link>
      <Link href="/search"><span>Accessible documents</span><strong>{security.isPending ? '—' : security.data?.documents ?? 0}</strong><small>Current permission scope</small></Link>
      <div><span>Processing queue</span><strong>{security.isPending ? '—' : security.data?.processing ?? 0}</strong><small>Pending or in progress</small></div>
      <div><span>Recorded events</span><strong>{security.isPending ? '—' : security.data?.auditEvents ?? 0}</strong><small>Within accessible records</small></div>
    </section>

    <div className="workspace-grid">
      <section className="section-surface span-2" aria-labelledby="priority-heading">
        <div className="section-heading"><div><p className="section-kicker">Priority work</p><h2 id="priority-heading">Items requiring attention</h2></div></div>
        {security.isPending ? <SkeletonRows rows={2}/> : security.data?.processing ? <div className="attention-row"><div className="attention-icon warning"><Icon name="clock"/></div><div><strong>{security.data.processing} {security.data.processing === 1 ? 'document is' : 'documents are'} still processing</strong><span>Source records remain available. Open the relevant case to review or retry extraction.</span></div><Link href="/cases">Review cases<Icon name="chevron" size={15}/></Link></div> : <div className="attention-row"><div className="attention-icon success"><Icon name="check"/></div><div><strong>No processing backlog</strong><span>There are no queued or active extraction jobs in your current scope.</span></div></div>}
      </section>

      <aside className="section-surface security-brief" aria-labelledby="controls-heading">
        <div className="section-heading"><div><p className="section-kicker">Controls</p><h2 id="controls-heading">Record protection</h2></div><Icon name="shield"/></div>
        <dl className="control-list"><div><dt>Stored files</dt><dd><StatusBadge tone="success">Encrypted</StatusBadge></dd></div><div><dt>Encryption profile</dt><dd>{security.data?.encryption ?? 'Checking…'}</dd></div><div><dt>Access model</dt><dd>Current policy</dd></div></dl>
        <p>Integrity is verified per document version when requested; it is not assumed globally.</p>
      </aside>
    </div>

    <section className="section-surface" aria-labelledby="recent-cases-heading">
      <div className="section-heading"><div><p className="section-kicker">Investigations</p><h2 id="recent-cases-heading">Recent cases</h2></div><Link className="text-link" href="/cases">View all cases<Icon name="chevron" size={15}/></Link></div>
      {cases.isPending ? <SkeletonRows/> : cases.data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Case</th><th>Department</th><th>Status</th><th>Updated</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{cases.data.slice(0, 6).map((item) => <tr key={item.id}><td><Link className="primary-cell" href={`/cases/${item.id}`}><strong>{item.title}</strong><span>{item.caseNumber}</span></Link></td><td>{item.department.name}</td><td><StatusBadge tone={caseTone(item.status)}>{formatStatus(item.status)}</StatusBadge></td><td><time dateTime={item.updatedAt}>{formatRelative(item.updatedAt)}</time></td><td><Link className="row-action" aria-label={`Open ${item.title}`} href={`/cases/${item.id}`}><Icon name="chevron"/></Link></td></tr>)}</tbody></table></div> : <StateMessage title="No assigned cases" detail="Cases will appear here when you are added as a member or granted access."/>}
    </section>
  </>;
}

function formatStatus(value: string) { return value.replaceAll('_', ' '); }
function caseTone(value: string): 'success' | 'neutral' | 'info' { return value === 'OPEN' ? 'success' : value === 'IN_PROGRESS' ? 'info' : 'neutral'; }
