'use client';

import { I18nProvider } from '@cloudscape-design/components/i18n';
import messages from '@cloudscape-design/components/i18n/messages/all.en';
import { useEffect, type ReactNode } from 'react';
import { applyVisualMode, readVisualMode } from '@/lib/theme';

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyVisualMode(readVisualMode());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readVisualMode() === 'system') applyVisualMode('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return (
    <I18nProvider locale="en" messages={[messages]}>
      {children}
    </I18nProvider>
  );
}
