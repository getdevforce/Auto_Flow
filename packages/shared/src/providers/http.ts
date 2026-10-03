import { ProviderError, classifyHttp, type ErrorKind } from '../errors';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpOpts { provider: string; fetch: Fetcher }

/** Parse Retry-After (seconds or HTTP date) into ms. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/**
 * Fetch that converts failures into ProviderError. `override` lets an adapter reclassify provider-specific
 * failures (policy rejections, spend caps) that the status code alone cannot reveal.
 */
export async function request(
  { provider, fetch }: HttpOpts,
  url: string,
  init: RequestInit,
  override?: (status: number, body: string, headers: Headers) => ErrorKind | undefined,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new ProviderError('transient', `Could not reach ${provider}. Check your connection.`, { provider });
  }
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  const kind = override?.(res.status, body, res.headers) ?? classifyHttp(res.status, body);
  throw new ProviderError(kind, humanMessage(provider, kind, res.status, body), {
    status: res.status, provider, retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
  });
}

function humanMessage(provider: string, kind: string, status: number, body: string): string {
  switch (kind) {
    case 'auth': return `${provider} rejected the key. Check it in Settings > Keys.`;
    case 'quota': return `${provider} says your account is out of credit or quota. Top it up, then resume.`;
    case 'rate_limited': return `${provider} is rate limiting requests. Retrying with a slower pace.`;
    case 'policy_rejected': return `${provider} declined this prompt under its content policy. Review the wording.`;
    case 'transient': return `${provider} had a temporary problem (${status}). Retrying.`;
    default: return `${provider} rejected the request (${status}): ${body.slice(0, 200)}`;
  }
}
