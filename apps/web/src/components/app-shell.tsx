'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthUser } from '@sih/shared';
import { api, TOKEN_KEY } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui';

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: '/dashboard', label: 'My Work', icon: 'briefcase' },
  { href: '/cases', label: 'Cases', icon: 'cases' },
  { href: '/search', label: 'Search', icon: 'search' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<AuthUser>('/auth/me'), enabled: Boolean(token), retry: false });

  useEffect(() => {
    if (!token || me.isError) {
      sessionStorage.removeItem(TOKEN_KEY);
      router.replace('/login');
    }
  }, [me.isError, router, token]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [router]);

  if (!token || me.isPending) return <main className="session-check" aria-busy="true"><div className="brand-mark"><Icon name="shield"/></div><strong>Verifying your session</strong><span>Checking current account and access policy…</span></main>;

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    router.replace('/login');
  };
  const activeItem = navigation.find((item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));
  const routeLabel = pathname.startsWith('/documents/') ? 'Document record' : activeItem?.label ?? 'Workspace';

  return <div className={`app-layout ${menuOpen ? 'menu-open' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>
    <aside className="sidebar" id="primary-navigation">
      <div className="brand-block"><div className="brand-mark"><Icon name="shield"/></div><div><span>SIH 26190</span><strong>Secure Records</strong></div><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close"/></button></div>
      <nav aria-label="Primary navigation">
        <p className="nav-label">Workspace</p>
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return <Link aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}><Icon name={item.icon}/><span>{item.label}</span>{active && <span className="nav-indicator"/>}</Link>;
        })}
      </nav>
      <div className="system-note"><Icon name="lock"/><div><strong>Protected workspace</strong><span>Access is permission-scoped and audited.</span></div></div>
      <div className="account">
        <div className="avatar" aria-hidden="true">{initials(me.data?.name ?? '')}</div>
        <div className="account-copy"><strong>{me.data?.name}</strong><span>{me.data?.departmentName || formatRole(me.data?.role)}</span><small>{me.data?.departmentName ? formatRole(me.data?.role) : 'Authorised user'}</small></div>
        <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={logout}><Icon name="logout"/></button>
      </div>
    </aside>
    <div className="app-frame">
      <header className="utility-bar">
        <div className="utility-context"><button className="icon-button mobile-menu" aria-controls="primary-navigation" aria-expanded={menuOpen} aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><div><span>Secure Records System</span><strong>{routeLabel}</strong></div></div>
        <div className="utility-actions"><Link className="global-search" href="/search"><Icon name="search"/><span>Search records</span><kbd>/</kbd></Link><div className="utility-user"><span>{formatRole(me.data?.role)}</span><strong>{me.data?.name}</strong></div></div>
      </header>
      <main className="content" id="main-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
}

function formatRole(role?: string) {
  return role?.replaceAll('_', ' ').toLocaleLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? '';
}
