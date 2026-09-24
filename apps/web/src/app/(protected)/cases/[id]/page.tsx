'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { AuthUser, CaseSummary, DocumentSummary } from '@sih/shared';
import { api } from '@/lib/api';
import { Breadcrumbs, Icon, PageHeader, SkeletonRows, StateMessage, StatusBadge, formatBytes, formatRelative } from '@/components/ui';

type CaseDetail = CaseSummary & { members: { caseRole: string; user: { id: string; name: string; email: string } }[]; _count: { documents: number } };
type Tab = 'overview' | 'documents' | 'access';

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [showUpload, setShowUpload] = useState(false);
  const record = useQuery({ queryKey: ['case', id], queryFn: () => api<CaseDetail>(`/cases/${id}`) });
  const documents = useQuery({ queryKey: ['documents', id], queryFn: () => api<DocumentSummary[]>(`/documents?caseId=${encodeURIComponent(id)}`) });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<AuthUser>('/auth/me') });
  const upload = useMutation({
    mutationFn: (form: FormData) => api<DocumentSummary>('/documents', { method: 'POST', body: form }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['documents', id] }); void queryClient.invalidateQueries({ queryKey: ['case', id] }); setShowUpload(false); setTab('documents'); },
  });
  const canUpload = Boolean(me.data && ['INVESTIGATOR', 'SENIOR_OFFICER', 'DEPARTMENT_HEAD'].includes(me.data.role));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('caseId', id);
    upload.mutate(form);
  };

  if (record.isPending) return <><div className="page-loading-title"/><SkeletonRows rows={5}/></>;
  if (record.error) return <StateMessage tone="danger" title="Case unavailable" detail={record.error.message}/>;
  if (!record.data) return null;

  const current = record.data;
  return <>
    <Breadcrumbs items={[{ label: 'Cases', href: '/cases' }, { label: current.caseNumber }]}/>
    <PageHeader eyebrow={current.caseNumber} title={current.title} description={`${current.department.name} · Created by ${current.createdBy.name}`} meta={<StatusBadge tone={caseTone(current.status)}>{formatStatus(current.status)}</StatusBadge>} actions={canUpload && <button className="button primary" onClick={() => { setTab('documents'); setShowUpload(true); }}><Icon name="plus"/>Add document</button>}/>

    <nav className="workspace-tabs" aria-label="Case sections" role="tablist">{(['overview', 'documents', 'access'] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} aria-controls={`case-${item}`} onClick={() => setTab(item)}>{item === 'access' ? 'Members & access' : item[0].toUpperCase() + item.slice(1)}{item === 'documents' && <span>{documents.data?.length ?? current._count.documents}</span>}</button>)}</nav>

    {tab === 'overview' && <div id="case-overview" role="tabpanel" className="workspace-grid">
      <section className="section-surface span-2"><div className="section-heading"><div><p className="section-kicker">Case overview</p><h2>Investigation summary</h2></div></div><p className={`case-description ${current.description ? '' : 'muted'}`}>{current.description || 'No case description has been recorded.'}</p><dl className="metadata-grid"><div><dt>Case number</dt><dd>{current.caseNumber}</dd></div><div><dt>Status</dt><dd>{formatStatus(current.status)}</dd></div><div><dt>Department</dt><dd>{current.department.name}</dd></div><div><dt>Documents</dt><dd>{documents.data?.length ?? current._count.documents}</dd></div><div><dt>Created</dt><dd>{new Date(current.createdAt).toLocaleDateString()}</dd></div><div><dt>Last updated</dt><dd>{formatRelative(current.updatedAt)}</dd></div></dl></section>
      <aside className="section-surface"><div className="section-heading"><div><p className="section-kicker">Assigned team</p><h2>{current.members.length} {current.members.length === 1 ? 'member' : 'members'}</h2></div><Icon name="users"/></div><div className="people-list">{current.members.slice(0, 5).map((member) => <div key={member.user.id}><div className="avatar small">{initials(member.user.name)}</div><span><strong>{member.user.name}</strong><small>{member.caseRole.replaceAll('_', ' ')}</small></span></div>)}</div>{current.members.length > 5 && <button className="text-button" onClick={() => setTab('access')}>View all members</button>}</aside>
      <section className="section-surface span-3"><div className="section-heading"><div><p className="section-kicker">Recent records</p><h2>Documents in this case</h2></div><button className="text-button" onClick={() => setTab('documents')}>View document register<Icon name="chevron" size={15}/></button></div>{documents.isPending ? <SkeletonRows rows={3}/> : documents.data?.length ? <div className="compact-record-list">{documents.data.slice(0, 4).map((document) => <Link href={`/documents/${document.id}`} key={document.id}><div className="file-icon"><Icon name="file"/></div><span><strong>{document.title}</strong><small>{document.documentType} · v{document.currentVersion?.versionNumber ?? '—'}</small></span><time>{formatRelative(document.updatedAt)}</time><Icon name="chevron"/></Link>)}</div> : <StateMessage title="No documents added" detail="Upload the first authorised document to begin the case record."/>}</section>
    </div>}

    {tab === 'documents' && <section className="section-surface" id="case-documents" role="tabpanel"><div className="section-heading"><div><p className="section-kicker">Document register</p><h2>Case documents</h2><p>Protected source files and their current versions.</p></div>{canUpload && <button className="button secondary" aria-expanded={showUpload} aria-controls="upload-panel" onClick={() => setShowUpload((value) => !value)}><Icon name={showUpload ? 'close' : 'plus'}/>{showUpload ? 'Close upload' : 'Upload document'}</button>}</div>
      {showUpload && <form className="form-grid inset-form" id="upload-panel" onSubmit={submit}><label htmlFor="documentTitle"><span>Document title</span><input id="documentTitle" name="title" minLength={2} maxLength={200} required/></label><label htmlFor="documentType"><span>Document type</span><select id="documentType" name="documentType" defaultValue="REPORT" required>{['FIR', 'POLICE_REPORT', 'REPORT', 'WITNESS_STATEMENT', 'CHARGE_SHEET', 'COURT_FILING', 'EVIDENCE_RECORD', 'FORENSIC_REPORT', 'LEGAL_NOTICE', 'JUDGMENT', 'OTHER'].map((type) => <option key={type} value={type}>{formatStatus(type)}</option>)}</select></label><label htmlFor="classification"><span>Classification</span><select id="classification" name="classification" defaultValue="RESTRICTED"><option value="INTERNAL">Internal</option><option value="RESTRICTED">Restricted</option>{me.data && ['SENIOR_OFFICER', 'DEPARTMENT_HEAD'].includes(me.data.role) && <option value="CONFIDENTIAL">Confidential</option>}{me.data?.role === 'DEPARTMENT_HEAD' && <option value="HIGHLY_RESTRICTED">Highly restricted</option>}</select><small>Access also requires role clearance.</small></label><label className="full file-field" htmlFor="documentFile"><span>Source file</span><input id="documentFile" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.md" required/><small>PDF, image, DOCX, text or Markdown. Maximum size follows server policy.</small></label>{upload.error && <div className="full"><StateMessage tone="danger" title="Upload failed" detail={`${upload.error.message} The source case remains unchanged.`}/></div>}<div className="form-actions full"><button className="button secondary" type="button" onClick={() => setShowUpload(false)}>Cancel</button><button className="button primary" type="submit" disabled={upload.isPending}>{upload.isPending ? 'Protecting and uploading…' : 'Upload document'}</button></div></form>}
      {documents.isPending ? <SkeletonRows rows={4}/> : documents.error ? <StateMessage tone="danger" title="Documents could not be loaded" detail={documents.error.message}/> : documents.data?.length ? (
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Document</th><th>Type</th><th>Classification</th><th>Version</th><th>Record status</th><th>Updated</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{documents.data.map((document) => <tr key={document.id}><td><Link className="primary-cell" href={`/documents/${document.id}`}><strong>{document.title}</strong><span>{document.currentVersion?.originalFilename ?? 'No file'} · {formatBytes(document.currentVersion?.fileSize ?? 0)}</span></Link></td><td>{formatStatus(document.documentType)}</td><td><StatusBadge tone={document.classification === 'INTERNAL' ? 'neutral' : 'warning'}>{formatStatus(document.classification)}</StatusBadge></td><td>v{document.currentVersion?.versionNumber ?? '—'}</td><td>{formatStatus(document.recordStatus)}</td><td>{formatRelative(document.updatedAt)}</td><td><Link className="row-action" aria-label={`Inspect ${document.title}`} href={`/documents/${document.id}`}><Icon name="chevron"/></Link></td></tr>)}</tbody></table></div>
      ) : <StateMessage title="No documents have been added to this case" detail={canUpload ? 'Upload the first authorised document to begin the case record.' : 'You do not currently have permission to upload documents.'} action={canUpload && <button className="button primary" onClick={() => setShowUpload(true)}><Icon name="plus"/>Upload document</button>}/>}
    </section>}

    {tab === 'access' && <section className="section-surface" id="case-access" role="tabpanel"><div className="section-heading"><div><p className="section-kicker">Case membership</p><h2>Assigned officers</h2><p>Membership determines who can discover and open this case.</p></div><span className="result-count">{current.members.length} total</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Member</th><th>Email</th><th>Case role</th></tr></thead><tbody>{current.members.map((member) => <tr key={member.user.id}><td><span className="person-cell"><span className="avatar small">{initials(member.user.name)}</span><strong>{member.user.name}</strong></span></td><td>{member.user.email}</td><td><StatusBadge tone={member.caseRole === 'OWNER' ? 'info' : 'neutral'}>{member.caseRole.replaceAll('_', ' ')}</StatusBadge></td></tr>)}</tbody></table></div><StateMessage title="Membership changes are not available in the current MVP" detail="Document-specific access can be managed from an individual document when you have SHARE authority."/></section>}
  </>;
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function formatStatus(value: string) { return value.replaceAll('_', ' '); }
function caseTone(value: string): 'success' | 'neutral' | 'info' { return value === 'OPEN' ? 'success' : value === 'IN_PROGRESS' ? 'info' : 'neutral'; }
