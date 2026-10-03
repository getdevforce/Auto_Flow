/** Passwords and tokens only travel over https. Plain http is accepted for loopback development hosts only. */
export function safeBase(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && loopback)) return u.origin;
  } catch { /* not a URL */ }
  return undefined;
}
