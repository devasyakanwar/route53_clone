'use client';

import { useCallback, useEffect, useState } from 'react';

/** useState that persists to localStorage. Reads after mount so server and client renders match. */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue({ ...initialIfObject(initial), ...JSON.parse(raw) } as T);
    } catch {
      // ignore unavailable storage / bad JSON
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [key],
  );

  return [value, update];
}

function initialIfObject<T>(initial: T): object {
  return typeof initial === 'object' && initial !== null && !Array.isArray(initial) ? initial : {};
}
