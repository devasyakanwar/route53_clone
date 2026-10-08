'use client';

import useSWR from 'swr';
import { fetcher, keys } from '@/lib/api';
import type { HostedZone, HostedZoneDetail, Paged } from '@/lib/types';

export function useZones() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<Paged<HostedZone>>(keys.zones, fetcher);
  return { zones: data?.items, total: data?.total, error, isLoading, isValidating, mutate };
}

export function useZone(zoneId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<HostedZoneDetail>(zoneId ? keys.zone(zoneId) : null, fetcher);
  return { zone: data, error, isLoading, mutate };
}
