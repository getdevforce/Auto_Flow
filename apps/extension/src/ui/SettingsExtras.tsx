import { useEffect, useState } from 'react';
import { applyDensity, applyTheme, getDensity, getTheme, type Density, type Theme } from '../prefs';
import { deleteAllLocalData, exportProject, importProject, listProjects } from '../projects';

export const SHORTCUTS: Array<[string, string]> = [
  ['Alt + 1 to 7', 'Switch tab (Autopilot, Create, Bible, Library, Prompts, Cinema, Settings)'],
  ['Alt + , (comma)', 'Open Settings'],
  ['?', 'Show or hide this list'],
  ['Left / Right arrow on a tab', 'Move between tabs'],
  ['Esc', 'Close this list'],
];
const field = 'rounded-md border border-line bg-surface px-2 py-1';

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div role="dialog" aria-label="Keyboard shortcuts" className="mt-3 rounded-lg border border-line bg-surface p-3" data-testid="shortcut-sheet">
      <div className="flex items-center justify-between"><h3 className="font-semibold">Keyboard shortcuts</h3><button className="underline" onClick={onClose}>Close</button></div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">{SHORTCUTS.map(([k, d]) => <div key={k} className="contents"><dt className="font-mono text-[11px]">{k}</dt><dd className="text-muted">{d}</dd></div>)}</dl>
    </div>
  );
}

export function SettingsExtras({ onShortcuts }: { onShortcuts: () => void }) {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [density, setDensity] = useState<Density>(getDensity());
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState('');
  const [withAssets, setWithAssets] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState('');
  useEffect(() => { void listProjects().then((p) => { setProjects(p); setProject(p[0] ?? ''); }); }, []);

  return (
    <>
      <h2 className="mt-6 text-[15px] font-semibold">Appearance</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="grid gap-1">Theme<select value={theme} onChange={(e) => { setTheme(e.target.value as Theme); applyTheme(e.target.value as Theme); }} className={field}><option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className="grid gap-1">Density<select value={density} onChange={(e) => { setDensity(e.target.value as Density); applyDensity(e.target.value as Density); }} className={field}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      </div>
      <button className="mt-2 w-fit underline" onClick={onShortcuts}>Keyboard shortcuts</button>

      <h2 className="mt-6 text-[15px] font-semibold">Projects</h2>
      <p className="text-muted">Export a project to back it up or move it. The file never contains provider keys or your vault.</p>
      {projects.length === 0 ? <p className="text-muted">No projects yet. Run something in Create or Autopilot first.</p> : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Project<select value={project} onChange={(e) => setProject(e.target.value)} className={field}>{projects.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={withAssets} onChange={(e) => setWithAssets(e.target.checked)} />Include images and video (large)</label>
          <button className="rounded-md border border-line px-3 py-1" onClick={async () => {
            const bundle = await exportProject(project, withAssets);
            const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
            await chrome.downloads.download({ url, filename: `${project.replace(/[^\w.-]+/g, '_')}.frameloom.json`, saveAs: true });
            setMsg(`Exported ${project}.`);
          }}>Export project</button>
        </div>
      )}
      <label className="mt-2 grid gap-1">Import a project file
        <input type="file" accept=".json,application/json" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { const r = await importProject(JSON.parse(await f.text())); setMsg(`Imported ${r.project}: ${r.added} item(s) added.`); setProjects(await listProjects()); }
          catch (x) { setMsg((x as Error).message); }
        }} />
      </label>
      {msg && <p role="status" className="text-muted" data-testid="project-msg">{msg}</p>}

      <h2 className="mt-6 text-[15px] font-semibold">Delete all local data</h2>
      <p className="text-muted">Removes every project, character, library item, setting and saved key from this browser. This cannot be undone. Type DELETE to enable the button.</p>
      <div className="mt-2 flex items-center gap-2">
        <input aria-label="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${field} w-24`} />
        <button disabled={confirm !== 'DELETE'} className="rounded-md border border-line px-3 py-1 text-danger disabled:opacity-50" onClick={async () => { await deleteAllLocalData(); location.reload(); }}>Delete everything</button>
      </div>
    </>
  );
}
