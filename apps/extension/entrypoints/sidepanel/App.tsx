import { useEffect, useState } from 'react';
import { brand } from '../../src/brand';
import { AutopilotPanel } from '../../src/ui/AutopilotPanel';
import { BiblePanel } from '../../src/ui/BiblePanel';
import { LibraryPanel } from '../../src/ui/LibraryPanel';
import { TemplatesPanel } from '../../src/ui/TemplatesPanel';
import { CinemaPanel } from '../../src/ui/CinemaPanel';
import { CreatePanel } from '../../src/ui/CreatePanel';
import { KeysPanel } from '../../src/ui/KeysPanel';
import { dismissAnnouncement, updateRequired, useConfig } from '../../src/config-store';
import { isTelemetryEnabled, setTelemetryEnabled, track, flushTelemetry } from '../../src/telemetry';
import { sendFeedback } from '../../src/feedback';
import { fetchConfig, getSession, login, logout, type Session } from '../../src/services';

const TABS = ['Autopilot', 'Create', 'Bible', 'Library', 'Prompts', 'Cinema', 'Settings'] as const;
type Tab = (typeof TABS)[number];

const remembered = (): Tab => {
  try { const t = localStorage.getItem('tab') as Tab; return TABS.includes(t) ? t : 'Autopilot'; } catch { return 'Autopilot'; }
};

export function App() {
  const [tab, setTab] = useState<Tab>(remembered);
  const [session, setSession] = useState<Session | undefined>();
  const [cfg, setCfg] = useState<string>('Loading configuration');
  const { config, announcements, load } = useConfig();
  const [err, setErr] = useState('');
  const [share, setShare] = useState(true);
  const [fbMsg, setFbMsg] = useState('');
  const [fbStatus, setFbStatus] = useState('');

  useEffect(() => {
    getSession().then(setSession);
    isTelemetryEnabled().then(setShare);
    track('app_opened');
    void flushTelemetry();
    fetchConfig().then((r) => setCfg(`Config v${r.config.version} (${r.source})`));
    void load();
  }, []);
  useEffect(() => { try { localStorage.setItem('tab', tab); } catch { /* storage can be unavailable; the tab simply is not remembered */ } }, [tab]);

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

  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length] as Tab);
    if (e.key === 'ArrowLeft') setTab(TABS[(i + TABS.length - 1) % TABS.length] as Tab);
  };

  return (
    <main className="p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">{brand.productName}</h1>
        <p className="font-mono text-[11px] text-muted" data-testid="config-status">{cfg}</p>
      </header>
      {updateRequired(config) && (
        <p role="alert" className="mt-3 rounded-md border border-line bg-raised p-2 text-danger" data-testid="update-required">
          {config.release.message ?? 'This version is no longer supported. Update the extension to keep generating.'}
        </p>
      )}
      {announcements.map((a) => (
        <aside key={a.key} className="mt-3 rounded-md border border-line bg-raised p-2" data-testid="announcement">
          <strong>{a.title}</strong>
          <p className="text-muted">{a.body}</p>
          {a.dismissible && <button className="underline" onClick={() => void dismissAnnouncement(a.key)}>Dismiss</button>}
        </aside>
      ))}
      <div role="tablist" aria-label="Sections" className="mt-3 flex flex-wrap gap-1 border-b border-line" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}
            className={`px-2 py-1.5 transition-colors duration-fast ${tab === t ? 'border-b-2 border-accent font-semibold' : 'text-muted'}`}>{t}</button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === 'Autopilot' && <AutopilotPanel />}
        {tab === 'Create' && <CreatePanel />}
        {tab === 'Bible' && <BiblePanel />}
        {tab === 'Library' && <LibraryPanel />}
        {tab === 'Prompts' && <TemplatesPanel />}
        {tab === 'Cinema' && <CinemaPanel />}
        {tab === 'Settings' && (
          <>
            <h2 className="mt-4 text-[15px] font-semibold">Account</h2>
            {session ? (
              <section className="mt-2">
                <p data-testid="signed-in">Signed in as {session.email} ({session.plan} plan)</p>
                <button className="mt-2 rounded-md border border-line px-3 py-1" onClick={() => logout().then(() => setSession(undefined))}>Sign out</button>
              </section>
            ) : (
              <form className="mt-2 grid gap-2" onSubmit={onLogin}>
                <label className="grid gap-1">Email<input name="email" type="email" required className="rounded-md border border-line bg-surface px-2 py-1" /></label>
                <label className="grid gap-1">Password<input name="password" type="password" required className="rounded-md border border-line bg-surface px-2 py-1" /></label>
                {err && <p role="alert" className="text-danger">{err}</p>}
                <button className="rounded-md bg-accent px-3 py-1.5 text-accent-ink">Sign in</button>
              </form>
            )}
            <h2 className="mt-6 text-[15px] font-semibold">Usage counts</h2>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" checked={share} onChange={(e) => { setShare(e.target.checked); void setTelemetryEnabled(e.target.checked); }} />
              <span>Share anonymous usage counts. Event names and totals only: which provider and model, success or failure, run sizes. Never scripts, prompts, filenames, images or keys.</span>
            </label>
            <h2 className="mt-6 text-[15px] font-semibold">Send feedback</h2>
            <form className="mt-2 grid gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try { await sendFeedback(String(f.get('message')), String(f.get('email') || '') || undefined); setFbStatus('Thanks. We read every message.'); setFbMsg(''); }
              catch (x) { setFbStatus((x as Error).message); }
            }}>
              <label className="grid gap-1">Message<textarea name="message" value={fbMsg} onChange={(e) => setFbMsg(e.target.value)} rows={3} required maxLength={2000} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
              <label className="grid gap-1">Email, if you want a reply (optional)<input name="email" type="email" className="rounded-md border border-line bg-surface px-2 py-1" /></label>
              <p className="text-muted">This sends only what you type here. Your scripts, prompts and keys are not attached.</p>
              <button className="w-fit rounded-md border border-line px-3 py-1">Send feedback</button>
              {fbStatus && <p role="status" className="text-muted">{fbStatus}</p>}
            </form>
            <h2 className="mt-6 text-[15px] font-semibold">Provider keys</h2>
            <KeysPanel />
          </>
        )}
      </div>
    </main>
  );
}
