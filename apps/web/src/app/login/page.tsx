'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { z } from 'zod';
import type { LoginResponse } from '@sih/shared';
import { api, TOKEN_KEY } from '@/lib/api';
import { Icon } from '@/components/ui';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem(TOKEN_KEY)) router.replace('/dashboard');
  }, [router]);

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) => api<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (result) => {
      sessionStorage.setItem(TOKEN_KEY, result.accessToken);
      router.replace('/dashboard');
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setValidationError('Enter a valid email address and a password of at least 8 characters.');
      return;
    }
    setValidationError('');
    login.mutate(parsed.data);
  };
  const error = validationError || login.error?.message;

  return <main className="login-page">
    <section className="login-context" aria-labelledby="system-name">
      <div className="login-brand"><div className="brand-mark large"><Icon name="shield" size={24}/></div><div><span>SIH 26190</span><strong id="system-name">Secure Records System</strong></div></div>
      <div className="login-intro"><p className="eyebrow light">Investigation workspace</p><h1>Controlled access to case records and evidence.</h1><p>Review assigned cases, inspect protected document versions, and perform authorised actions within an audited workspace.</p></div>
      <ul className="assurance-list"><li><Icon name="lock"/><span><strong>Permission scoped</strong>Access follows current case and document policy.</span></li><li><Icon name="shield"/><span><strong>Integrity aware</strong>Document fixity can be verified before use.</span></li><li><Icon name="clock"/><span><strong>Audited actions</strong>Security-relevant operations are recorded.</span></li></ul>
      <p className="authorised-notice">Authorised personnel only. Activity may be monitored and audited.</p>
    </section>
    <section className="login-panel" aria-labelledby="sign-in-title">
      <div className="login-form-wrap">
        <header><p className="eyebrow">Secure sign in</p><h2 id="sign-in-title">Access your workspace</h2><p>Use your assigned organisational account.</p></header>
        <form onSubmit={submit} noValidate>
          <label htmlFor="email"><span>Email address</span><input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" autoFocus aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} placeholder="name@organisation.local"/></label>
          <label htmlFor="password"><span>Password</span><input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined}/></label>
          {error && <div className="form-error" id="login-error" role="alert"><Icon name="alert"/><span>{error}</span></div>}
          <button className="button primary wide" type="submit" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in securely'}</button>
        </form>
        <div className="demo-note"><strong>SIH demonstration environment</strong><span>Use only fictional records and the credentials supplied by the project administrator.</span></div>
      </div>
    </section>
  </main>;
}
