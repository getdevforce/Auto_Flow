import createClient from 'openapi-fetch';
import type { paths } from './schema';

export type { paths };

/** Typed client for the backend. Never used for provider traffic; see docs/telemetry.md for what may be sent. */
export function createApiClient(baseUrl: string, token?: string) {
  return createClient<paths>({ baseUrl: `${baseUrl}/api`, headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
