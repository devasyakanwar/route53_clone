'use client';

import { I18nProvider } from '@cloudscape-design/components/i18n';
import messages from '@cloudscape-design/components/i18n/messages/all.en';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { applyVisualMode, readVisualMode } from '@/lib/theme';

const subscribe = () => () => undefined;

/**
 * Cloudscape components read the real browser layout and theme while rendering (for example the table's sticky
 * scrollbar and the visual-refresh detection), so their server HTML never matches the client exactly. Every page
 * here is an authenticated console page with nothing to index, so the UI is rendered in the browser only.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const isClient = useIsClient();

  useEffect(() => {
    applyVisualMode(readVisualMode());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readVisualMode() === 'system') applyVisualMode('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  if (!isClient) return null;

  return (
    <I18nProvider locale="en" messages={[messages]}>
      {children}
    </I18nProvider>
  );
}
