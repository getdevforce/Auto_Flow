import { getApiBase, getSession } from './services';
import { EXTENSION_VERSION } from './config-store';

async function post(body: Record<string, unknown>): Promise<void> {
  const session = await getSession();
  const res = await fetch(`${await getApiBase()}/api/v1/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json', 'X-Extension-Version': EXTENSION_VERSION, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'You have sent a few reports already. Try again in a minute.' : 'Could not send that. Check your connection and try again.');
}

/** Free text the user chose to write. Nothing from their projects is attached. */
export const sendFeedback = (message: string, email?: string) => post({ type: 'feedback', message, ...(email ? { email } : {}) });

/** Codes only: no prompt, script or filename can be part of it. */
export const sendErrorReport = (ctx: { error_code: string; provider?: string; model?: string; kind?: string }) => post({ type: 'error_report', context: ctx });
