'use client';

import useSWR from 'swr';
import { fetcher, keys } from '@/lib/api';
import type { DashboardSummary } from '@/lib/types';

export function useDashboard() {
  // Counts change when zones or records change, so refresh them periodically.
  return useSWR<DashboardSummary>(keys.dashboard, fetcher, { refreshInterval: 15000 });
}
