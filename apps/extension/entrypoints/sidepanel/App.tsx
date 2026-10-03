import { useEffect, useState } from 'react';
import { brand } from '../../src/brand';
import { fetchConfig, getSession, login, logout, type Session } from '../../src/services';

export function App() {
  const [session, setSession] = useState<Session | undefined>();
  const [cfg, setCfg] = useState<string>('Loading configuration');
  const [err, setErr] = useState('');

  useEffect(() => {
    getSession().then(setSession);
    fetchConfig().then((r) => setCfg(`Config v${r.config.version} (${r.source})`));
  }, []);

  async function onLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setErr('');
      setSession(await login(String(f.get('email')), String(f.get('password'))));
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">{brand.productName}</h1>
      <p className="mt-1 text-muted">{brand.tagline}</p>
      <p className="mt-3 font-mono text-[11px] text-muted" data-testid="config-status">{cfg}</p>
      {session ? (
        <section className="mt-4">
          <p data-testid="signed-in">Signed in as {session.email} ({session.plan} plan)</p>
          <button className="mt-2 rounded-md border border-line px-3 py-1" onClick={() => logout().then(() => setSession(undefined))}>Sign out</button>
        </section>
      ) : (
        <form className="mt-4 grid gap-2" onSubmit={onLogin}>
          <label className="grid gap-1">Email<input name="email" type="email" required className="rounded-md border border-line bg-surface px-2 py-1" /></label>
          <label className="grid gap-1">Password<input name="password" type="password" required className="rounded-md border border-line bg-surface px-2 py-1" /></label>
          {err && <p role="alert" className="text-danger">{err}</p>}
          <button className="rounded-md bg-accent px-3 py-1.5 text-accent-ink">Sign in</button>
        </form>
      )}
    </main>
  );
}
