'use client';

import useSWR from 'swr';
import { fetcher, keys } from '@/lib/api';
import type { Paged, RecordSet } from '@/lib/types';

export function useRecords(zoneId: string | undefined) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<Paged<RecordSet>>(
    zoneId ? keys.records(zoneId) : null,
    fetcher,
  );
  return { records: data?.items, error, isLoading, isValidating, mutate };
}
