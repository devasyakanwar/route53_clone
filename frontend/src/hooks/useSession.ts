'use client';

import useSWR from 'swr';
import { fetcher, keys } from '@/lib/api';
import type { User } from '@/lib/types';

export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<User>(keys.me, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { user: data, error, isLoading, mutate };
}
