'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

export type IconName = 'briefcase' | 'cases' | 'search' | 'menu' | 'close' | 'shield' | 'file' | 'clock' | 'users' | 'chevron' | 'download' | 'check' | 'alert' | 'lock' | 'plus' | 'logout';

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></>,
    cases: <><path d="M4 5h6l2 2h8v12H4z"/><path d="M4 9h16"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    shield: <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-5"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h7v18h-7"/></>,
  };
  return <svg className="icon" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={`${item.label}-${index}`}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}{index < items.length - 1 && <Icon name="chevron" size={14}/>}</li>)}</ol></nav>;
}

export function PageHeader({ eyebrow, title, description, actions, meta }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; meta?: ReactNode }) {
  return <header className="page-header"><div className="page-title-group">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<div className="title-line"><h1>{title}</h1>{meta}</div>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`status-badge ${tone}`}><span className="status-dot" aria-hidden="true"/>{children}</span>;
}

export function StateMessage({ title, detail, tone = 'neutral', action }: { title: string; detail?: string; tone?: 'neutral' | 'danger' | 'warning'; action?: ReactNode }) {
  return <div className={`state-message ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{tone !== 'neutral' && <Icon name="alert"/>}<div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>{action && <div className="state-action">{action}</div>}</div>;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-list" aria-label="Loading" aria-busy="true">{Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index}><span/><span/><span/></div>)}</div>;
}

export function ConfirmDialog({ open, title, description, confirmLabel, pending, onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel: string; pending?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} className="confirm-dialog" onCancel={(event) => { event.preventDefault(); onCancel(); }} onClose={onCancel}>
    <div className="dialog-icon"><Icon name="alert"/></div>
    <h2>{title}</h2><p>{description}</p>
    <div className="dialog-actions"><button className="button secondary" type="button" onClick={onCancel}>Cancel</button><button className="button danger" type="button" disabled={pending} onClick={onConfirm}>{pending ? 'Revoking…' : confirmLabel}</button></div>
  </dialog>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatRelative(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const ranges: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]];
  for (const [unit, amount] of ranges) if (Math.abs(seconds) >= amount) return formatter.format(Math.round(seconds / amount), unit);
  return formatter.format(seconds, 'second');
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
