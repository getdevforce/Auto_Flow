import { useCallback, useEffect, useState } from 'react';
import { PROVIDER_IDS, type ProviderId } from '@frameloom/shared';
import { PROVIDER_LABELS, saveKey, testConnection } from '../keys';
import { vault } from '../services';

type Phase = 'loading' | 'setup' | 'locked' | 'ready';

export function KeysPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [saved, setSaved] = useState<string[]>([]);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [err, setErr] = useState('');

  const refresh = useCallback(async () => {
    if (!(await vault.isInitialised())) return setPhase('setup');
    setSaved(await vault.listProviders());
    setPhase(vault.isUnlocked ? 'ready' : 'locked');
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = (fn: () => Promise<void>) => async () => {
    try { setErr(''); await fn(); await refresh(); } catch (e) { setErr((e as Error).message); }
  };

  if (phase === 'loading') return <div className="mt-4 h-16 animate-pulse rounded-md bg-raised" aria-label="Loading keys" />;

  if (phase === 'setup') {
    return (
      <section className="mt-4 grid gap-2" aria-labelledby="vault-setup">
        <h2 id="vault-setup" className="font-semibold">Protect your keys</h2>
        <p className="text-muted">
          Keys are encrypted on this computer and sent only to the provider you choose. Without a passphrase, the encryption key is stored in
          this browser profile: it stops someone reading a copied profile folder, but not malware running as you. A passphrase is stronger,
          and you re-enter it each browser session.
        </p>
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); const p = String(new FormData(e.currentTarget).get('pass') || ''); void run(() => vault.init(p ? 'passphrase' : 'device', p || undefined))(); }}>
          <label className="grid gap-1">Passphrase (optional)<input name="pass" type="password" className="rounded-md border border-line bg-surface px-2 py-1" /></label>
          <button className="rounded-md bg-accent px-3 py-1.5 text-accent-ink">Create vault</button>
        </form>
        {err && <p role="alert" className="text-danger">{err}</p>}
      </section>
    );
  }

  if (phase === 'locked') {
    return (
      <form className="mt-4 grid gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => vault.unlock(String(new FormData(e.currentTarget).get('pass') || '')))(); }}>
        <label className="grid gap-1">Vault passphrase<input name="pass" type="password" className="rounded-md border border-line bg-surface px-2 py-1" /></label>
        <button className="rounded-md bg-accent px-3 py-1.5 text-accent-ink">Unlock</button>
        {err && <p role="alert" className="text-danger">{err}</p>}
      </form>
    );
  }

  return (
    <section className="mt-4 grid gap-3" aria-label="Provider keys">
      {PROVIDER_IDS.map((id) => (
        <KeyRow key={id} id={id} has={saved.includes(id)} status={msg[id]}
          onSave={(k) => run(async () => { await saveKey(id, k); setMsg((m) => ({ ...m, [id]: { ok: true, text: 'Saved. Test the connection to check it.' } })); })()}
          onTest={async () => {
            try { await testConnection(id); setMsg((m) => ({ ...m, [id]: { ok: true, text: 'Connection works.' } })); }
            catch (e) { setMsg((m) => ({ ...m, [id]: { ok: false, text: (e as Error).message } })); }
          }}
          onRemove={() => run(async () => { await vault.removeKey(id); setMsg((m) => { const n = { ...m }; delete n[id]; return n; }); })()} />
      ))}
      {err && <p role="alert" className="text-danger">{err}</p>}
    </section>
  );
}

function KeyRow({ id, has, status, onSave, onTest, onRemove }: {
  id: ProviderId; has: boolean; status?: { ok: boolean; text: string };
  onSave: (k: { apiKey: string; baseUrl?: string }) => void; onTest: () => void; onRemove: () => void;
}) {
  const [key, setKey] = useState('');
  const [base, setBase] = useState('');
  return (
    <div className="rounded-lg border border-line bg-surface p-3" data-testid={`key-${id}`}>
      <h3 className="font-semibold">{PROVIDER_LABELS[id]}</h3>
      {has ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-muted">Key saved</span>
          <button className="rounded-md border border-line px-2 py-1" onClick={onTest}>Test connection</button>
          <button className="rounded-md border border-line px-2 py-1" onClick={onRemove}>Remove</button>
        </div>
      ) : (
        <form className="mt-2 grid gap-2" onSubmit={(e) => { e.preventDefault(); onSave({ apiKey: key, baseUrl: (id === 'custom' || id === 'fal') && base ? base : undefined }); setKey(''); }}>
          {(id === 'custom' || id === 'fal') && <label className="grid gap-1">Base URL<input value={base} onChange={(e) => setBase(e.target.value)} placeholder={id === 'fal' ? 'Optional, default https://queue.fal.run' : 'https://host/v1'} required={id === 'custom'} className="rounded-md border border-line bg-surface px-2 py-1" /></label>}
          <label className="grid gap-1">API key<input value={key} onChange={(e) => setKey(e.target.value)} type="password" required autoComplete="off" className="rounded-md border border-line bg-surface px-2 py-1" /></label>
          <button className="w-fit rounded-md bg-accent px-3 py-1 text-accent-ink">Save key</button>
        </form>
      )}
      {status && <p role="status" className={status.ok ? 'mt-2 text-ok' : 'mt-2 text-danger'}>{status.text}</p>}
    </div>
  );
}
