import type {
  ApiErrorBody,
  ApiFieldError,
  Change,
  ChangeInfo,
  HealthCheck,
  HealthCheckConfig,
  HostedZoneDetail,
  ImportResponse,
  Tag,
  User,
  ZoneCreateInput,
  ZoneCreateResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field: string | null = null,
    public errors: ApiFieldError[] = [],
    /** True for failures that usually mean "the server is waking up / briefly unavailable" and are worth retrying. */
    public transient = false,
  ) {
    super(message);
  }
}

const BASE = '/api/v1';

// ------------------------------------------------------------------ waking up a sleeping server

/** How long to keep retrying while a sleeping free-tier server wakes up (that takes about a minute). */
const WAKE_TIMEOUT_MS = 90_000;
/** Statuses the hosting edge returns while the API is not ready. */
const EDGE_STATUSES = [429, 502, 503, 504];
/** Retries for other transient failures (a bare 500, a dropped connection). */
const QUICK_RETRIES = 6;

let wakingCount = 0;
const wakingListeners = new Set<(waking: boolean) => void>();

/** Lets the UI show "Waking up the server…" while any request is being retried. Returns an unsubscribe function. */
export function subscribeWaking(listener: (waking: boolean) => void): () => void {
  wakingListeners.add(listener);
  return () => {
    wakingListeners.delete(listener);
  };
}

function trackWaking(delta: 1 | -1): void {
  wakingCount += delta;
  wakingListeners.forEach(l => l(wakingCount > 0));
}

/** Fire-and-forget request that wakes the API while the user is still typing their password. */
export function warmUpServer(): void {
  void fetch('/api/health', { cache: 'no-store' }).catch(() => undefined);
}

/** GETs and sign-in are safe to repeat. Other writes are only retried when the edge rejected them before the app ran. */
function canRetry(e: ApiError, method: string, path: string): boolean {
  if (!e.transient) return false;
  if (method === 'GET' || path === '/auth/login') return true;
  return [429, 502, 503].includes(e.status);
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) return;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
}

async function attempt<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NetworkError',
      'Unable to reach the server. Check your network connection and try again.',
      null,
      [],
      true,
    );
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    redirectToLogin();
  }
  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      // non-JSON error (e.g. the proxy couldn't reach the backend)
    }
    if (parsed?.error) {
      const e = parsed.error;
      // The API always answers errors in JSON, so a JSON error is a real answer, never a "still waking up".
      throw new ApiError(res.status, e.code, e.message, e.field, e.errors ?? [], false);
    }
    // No JSON body: the hosting edge or the proxy answered instead of the API (e.g. while it is waking up).
    const transient = EDGE_STATUSES.includes(res.status) || res.status >= 500;
    const message =
      res.status >= 500 || EDGE_STATUSES.includes(res.status)
        ? 'The server is not ready yet. It may be waking up; wait a moment and try again.'
        : `Request failed with status ${res.status}.`;
    throw new ApiError(res.status, 'HttpError', message, null, [], transient);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? await res.json() : await res.text()) as T;
}

/**
 * Sends a request, retrying with a growing delay while the server looks like it is waking up (free hosting sleeps
 * when idle). Gives up after WAKE_TIMEOUT_MS and throws the last error.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let counted = false;
  try {
    for (let n = 0; ; n++) {
      try {
        return await attempt<T>(method, path, body);
      } catch (e) {
        const delay = Math.min(1000 * (n + 1), 5000);
        if (!(e instanceof ApiError) || !canRetry(e, method, path) || Date.now() + delay > deadline) throw e;
        // Only the hosting edge's "not ready" statuses justify the full wait; a bare 500 or a dropped connection
        // gets a few quick retries so a real server bug or being offline doesn't hang for a minute and a half.
        if (!EDGE_STATUSES.includes(e.status) && n >= QUICK_RETRIES) throw e;
        if (!counted) {
          counted = true;
          trackWaking(1);
        }
        await sleep(delay);
      }
    }
  } finally {
    if (counted) trackWaking(-1);
  }
}

export const fetcher = <T>(path: string): Promise<T> => request<T>('GET', path);

export const keys = {
  me: '/auth/me',
  dashboard: '/dashboard',
  zones: '/hostedzones?page_size=1000',
  zone: (id: string) => `/hostedzones/${id}`,
  records: (id: string) => `/hostedzones/${id}/recordsets?page_size=1000`,
  healthChecks: '/healthchecks',
  healthCheck: (id: string) => `/healthchecks/${id}`,
};

export const api = {
  login: (body: { email?: string; account_id?: string; username?: string; password: string }) =>
    request<User>('POST', '/auth/login', body),
  logout: () => request<void>('POST', '/auth/logout'),

  createZone: (body: ZoneCreateInput) => request<ZoneCreateResponse>('POST', '/hostedzones', body),
  updateZone: (id: string, comment: string | null) =>
    request<HostedZoneDetail>('PATCH', `/hostedzones/${id}`, { comment }),
  replaceTags: (id: string, tags: Tag[]) => request<HostedZoneDetail>('PUT', `/hostedzones/${id}/tags`, { tags }),
  deleteZone: (id: string) => request<ChangeInfo>('DELETE', `/hostedzones/${id}`),
  /** Deletes all of the zones or none of them. */
  deleteZones: (ids: string[]) => request<{ changes: ChangeInfo[] }>('POST', '/hostedzones/batch-delete', { ids }),
  exportZones: (format: 'json' | 'bind', ids?: string[]) =>
    request<unknown>(
      'GET',
      `/hostedzones/export?format=${format}${(ids ?? []).map(id => `&ids=${encodeURIComponent(id)}`).join('')}`,
    ),

  createHealthCheck: (body: HealthCheckConfig & { tags?: Tag[] }) => request<HealthCheck>('POST', '/healthchecks', body),
  updateHealthCheck: (id: string, body: HealthCheckConfig) => request<HealthCheck>('PUT', keys.healthCheck(id), body),
  replaceHealthCheckTags: (id: string, tags: Tag[]) =>
    request<HealthCheck>('PUT', `${keys.healthCheck(id)}/tags`, { tags }),
  deleteHealthChecks: (ids: string[]) => request<void>('POST', '/healthchecks/batch-delete', { ids }),

  changeRecords: (zoneId: string, changes: Change[], comment?: string) =>
    request<{ change_info: ChangeInfo }>('POST', `/hostedzones/${zoneId}/rrset`, { comment, changes }),
  getChange: (changeId: string) => request<ChangeInfo>('GET', `/changes/${changeId}`),

  importZone: (zoneId: string, zoneFile: string, dryRun: boolean) =>
    request<ImportResponse>('POST', `/hostedzones/${zoneId}/import${dryRun ? '?dry_run=true' : ''}`, {
      zone_file: zoneFile,
    }),
  exportZone: (zoneId: string, format: 'json' | 'bind') =>
    request<unknown>('GET', `/hostedzones/${zoneId}/export?format=${format}`),
};

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'An unexpected error occurred.';
}
