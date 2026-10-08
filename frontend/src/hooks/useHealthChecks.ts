'use client';

import useSWR from 'swr';
import { fetcher, keys } from '@/lib/api';
import type { DashboardSummary, HealthCheck, HealthCheckMetrics, HealthCheckStatusResponse } from '@/lib/types';

export function useHealthChecks() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ items: HealthCheck[]; total: number }>(
    keys.healthChecks,
    fetcher,
    // Statuses change on their own (Unknown -> Healthy), so poll like the console does.
    { refreshInterval: 15000 },
  );
  return { healthChecks: data?.items, error, isLoading, isValidating, mutate };
}

export function useHealthCheck(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<HealthCheck>(id ? keys.healthCheck(id) : null, fetcher);
  return { healthCheck: data, error, isLoading, mutate };
}

export function useHealthCheckStatus(id: string | undefined) {
  return useSWR<HealthCheckStatusResponse>(id ? `${keys.healthCheck(id)}/status` : null, fetcher, {
    refreshInterval: 15000,
  });
}

export function useHealthCheckMetrics(id: string | undefined) {
  return useSWR<HealthCheckMetrics>(id ? `${keys.healthCheck(id)}/metrics` : null, fetcher, {
    refreshInterval: 60000,
  });
}

export function useDashboard() {
  return useSWR<DashboardSummary>(keys.dashboard, fetcher, { refreshInterval: 15000 });
}
