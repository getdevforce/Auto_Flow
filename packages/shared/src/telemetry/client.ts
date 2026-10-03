import catalogue from './catalogue.json';

export type TelemetryEventName = (typeof catalogue.events)[number];
export type TelemetryProps = Record<string, string | number | boolean>;
export interface TelemetryEvent { name: string; ts: number; props: TelemetryProps }

type PropDef = { type: 'string'; max: number } | { type: 'int'; max: number } | { type: 'bool' } | { type: 'enum'; values: string[] };
const PROPS = catalogue.props as Record<string, PropDef>;

/** Same rules the server enforces. Anything that does not fit is dropped here, so content cannot leave by mistake. */
export function sanitizeProps(props: Record<string, unknown>): TelemetryProps {
  const out: TelemetryProps = {};
  for (const [k, v] of Object.entries(props)) {
    const def = PROPS[k];
    if (!def) continue;
    const ok = def.type === 'string' ? typeof v === 'string' && v.length <= def.max && /^[A-Za-z0-9._:@/+\- ]*$/.test(v)
      : def.type === 'int' ? Number.isInteger(v) && (v as number) >= 0 && (v as number) <= def.max
        : def.type === 'bool' ? typeof v === 'boolean' : typeof v === 'string' && def.values.includes(v);
    if (ok) out[k] = v as string | number | boolean;
  }
  return out;
}

export interface TelemetryDeps {
  /** Resolves true when the server accepted the batch; false or a throw means retry later. */
  send(installId: string, events: TelemetryEvent[]): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  load(): Promise<TelemetryEvent[]>;
  save(queue: TelemetryEvent[]): Promise<void>;
  installId(): Promise<string>;
  now?(): number;
  maxBatch?: number;
  maxQueue?: number;
}

/** Batched, retried, durable queue. Fully inert when telemetry is off: nothing is queued or sent. */
export class TelemetryClient {
  constructor(private readonly d: TelemetryDeps) {}

  async track(name: string, props: Record<string, unknown> = {}): Promise<void> {
    if (!(catalogue.events as string[]).includes(name) || !(await this.d.isEnabled())) return;
    const queue = await this.d.load();
    queue.push({ name, ts: Math.floor((this.d.now?.() ?? Date.now()) / 1000), props: sanitizeProps(props) });
    // Bounded: a long offline stretch drops the oldest counts rather than growing storage forever.
    await this.d.save(queue.slice(-(this.d.maxQueue ?? 500)));
  }

  /** Sends whatever is queued in server-sized batches. Returns how many events were delivered. */
  async flush(): Promise<number> {
    if (!(await this.d.isEnabled())) { await this.d.save([]); return 0; }
    let queue = await this.d.load();
    const size = this.d.maxBatch ?? 50;
    let sent = 0;
    const id = await this.d.installId();
    while (queue.length) {
      const batch = queue.slice(0, size);
      let ok = false;
      try { ok = await this.d.send(id, batch); } catch { ok = false; }
      if (!ok) break;
      queue = queue.slice(batch.length);
      sent += batch.length;
      await this.d.save(queue);
    }
    return sent;
  }
}
