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
  ) {
    super(message);
  }
}

const BASE = '/api/v1';

function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) return;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NetworkError', 'Unable to reach the server. Check your network connection and try again.');
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
      throw new ApiError(res.status, e.code, e.message, e.field, e.errors ?? []);
    }
    const message =
      res.status >= 500
        ? 'The service is unavailable. Make sure the backend is running and try again.'
        : `Request failed with status ${res.status}.`;
    throw new ApiError(res.status, 'HttpError', message);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? await res.json() : await res.text()) as T;
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
