'use client';

import Flashbar, { type FlashbarProps } from '@cloudscape-design/components/flashbar';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { ChangeInfo } from '@/lib/types';

export interface NotifyOptions {
  header?: ReactNode;
  content?: ReactNode;
  action?: ReactNode;
  id?: string;
  /** Auto-dismiss after this many ms. */
  timeout?: number;
}

interface NotificationsApi {
  success: (opts: NotifyOptions) => string;
  error: (opts: NotifyOptions) => string;
  info: (opts: NotifyOptions) => string;
  warning: (opts: NotifyOptions) => string;
  inProgress: (opts: NotifyOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
  /** Imitates Route 53 propagation: an in-progress flash that flips to INSYNC once the change is applied. */
  trackChange: (change: ChangeInfo) => void;
}

const NotificationsContext = createContext<NotificationsApi | null>(null);
const ItemsContext = createContext<FlashbarProps.MessageDefinition[]>([]);

let nextId = 0;

export function FlashbarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (type: FlashbarProps.Type, opts: NotifyOptions, loading = false): string => {
      const id = opts.id ?? `flash-${nextId++}`;
      const item: FlashbarProps.MessageDefinition = {
        id,
        type,
        loading,
        header: opts.header,
        content: opts.content,
        action: opts.action,
        dismissible: true,
        dismissLabel: 'Dismiss message',
        onDismiss: () => dismiss(id),
      };
      setItems(prev => [item, ...prev.filter(i => i.id !== id)]);
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      if (opts.timeout) timers.current.set(id, setTimeout(() => dismiss(id), opts.timeout));
      return id;
    },
    [dismiss],
  );

  const trackChange = useCallback(
    (change: ChangeInfo) => {
      const id = `change-${change.id}`;
      push('info', { id, header: `Change status: ${change.status}`, content: `Change ID: ${change.id}` }, change.status === 'PENDING');
      if (change.status === 'INSYNC') {
        timers.current.set(id, setTimeout(() => dismiss(id), 4000));
        return;
      }
      const poll = async (attempt: number) => {
        try {
          const latest = await api.getChange(change.id);
          if (latest.status === 'INSYNC' || attempt > 10) {
            push('success', { id, header: 'Change status: INSYNC', content: `Change ID: ${change.id}`, timeout: 4000 });
            return;
          }
        } catch {
          dismiss(id);
          return;
        }
        setTimeout(() => poll(attempt + 1), 1000);
      };
      setTimeout(() => poll(0), 1000);
    },
    [push, dismiss],
  );

  const value = useMemo<NotificationsApi>(
    () => ({
      success: o => push('success', o),
      error: o => push('error', o),
      info: o => push('info', o),
      warning: o => push('warning', o),
      inProgress: o => push('info', o, true),
      dismiss,
      clear: () => setItems([]),
      trackChange,
    }),
    [push, dismiss, trackChange],
  );

  return (
    <NotificationsContext.Provider value={value}>
      <ItemsContext.Provider value={items}>{children}</ItemsContext.Provider>
    </NotificationsContext.Provider>
  );
}

export function useNotify(): NotificationsApi {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotify must be used inside <FlashbarProvider>');
  return ctx;
}

export function Notifications() {
  const items = useContext(ItemsContext);
  return (
    <Flashbar
      items={items}
      stackItems={items.length > 3}
      i18nStrings={{
        ariaLabel: 'Notifications',
        notificationBarText: 'Notifications',
        notificationBarAriaLabel: 'View all notifications',
        errorIconAriaLabel: 'Error',
        successIconAriaLabel: 'Success',
        warningIconAriaLabel: 'Warning',
        infoIconAriaLabel: 'Info',
        inProgressIconAriaLabel: 'In progress',
      }}
    />
  );
}
