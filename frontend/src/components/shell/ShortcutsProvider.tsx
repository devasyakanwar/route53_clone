'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import Table from '@cloudscape-design/components/table';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { focusFirstFilter, isTypingTarget, SHORTCUT_LIST, type ShortcutHandlers } from '@/lib/shortcuts';

interface ShortcutsApi {
  register: (handlers: ShortcutHandlers) => () => void;
  showHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsApi | null>(null);

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const handlers = useRef<ShortcutHandlers>({});
  const pendingG = useRef<number>(0);
  const [helpVisible, setHelpVisible] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('#top-nav-search input')?.focus();
        return;
      }
      if (e.key === 'Escape') {
        handlers.current.escape?.();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      // Ignore keys while a modal is open (other than the shortcut help itself).
      if (document.querySelector('[role="dialog"][aria-modal="true"]') && e.key !== '?') return;

      const now = Date.now();
      if (pendingG.current && now - pendingG.current < 1000) {
        pendingG.current = 0;
        if (e.key === 'z') {
          e.preventDefault();
          router.push('/route53/v2/hostedzones');
        } else if (e.key === 'd') {
          e.preventDefault();
          router.push('/route53/v2/home');
        }
        return;
      }
      switch (e.key) {
        case 'g':
          pendingG.current = now;
          break;
        case '?':
          e.preventDefault();
          setHelpVisible(v => !v);
          break;
        case '/':
          e.preventDefault();
          if (handlers.current.focusFilter) handlers.current.focusFilter();
          else focusFirstFilter();
          break;
        case 'c':
          if (handlers.current.create) {
            e.preventDefault();
            handlers.current.create();
          }
          break;
        case 'r':
          if (handlers.current.refresh) {
            e.preventDefault();
            handlers.current.refresh();
          }
          break;
        case 'Delete':
          if (handlers.current.delete) {
            e.preventDefault();
            handlers.current.delete();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  const api = useMemo<ShortcutsApi>(
    () => ({
      register: h => {
        handlers.current = h;
        return () => {
          if (handlers.current === h) handlers.current = {};
        };
      },
      showHelp: () => setHelpVisible(true),
    }),
    [],
  );

  return (
    <ShortcutsContext.Provider value={api}>
      {children}
      <Modal
        visible={helpVisible}
        onDismiss={() => setHelpVisible(false)}
        header="Keyboard shortcuts"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setHelpVisible(false)}>
              Close
            </Button>
          </Box>
        }
      >
        <Table
          variant="embedded"
          items={SHORTCUT_LIST}
          columnDefinitions={[
            { id: 'keys', header: 'Shortcut', cell: s => <Box variant="code">{s.keys}</Box> },
            { id: 'description', header: 'Action', cell: s => s.description },
          ]}
        />
        <Box variant="small" color="text-body-secondary" padding={{ top: 's' }}>
          Shortcuts are ignored while you are typing in a field.
        </Box>
      </Modal>
    </ShortcutsContext.Provider>
  );
}

export function useShortcutsApi(): ShortcutsApi {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error('useShortcutsApi must be used inside <ShortcutsProvider>');
  return ctx;
}

/** Register page-level shortcut handlers. Handlers are read through a ref so they can change freely. */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const { register } = useShortcutsApi();
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(
    () =>
      register({
        create: handlers.create && (() => latest.current.create?.()),
        refresh: handlers.refresh && (() => latest.current.refresh?.()),
        delete: handlers.delete && (() => latest.current.delete?.()),
        focusFilter: handlers.focusFilter && (() => latest.current.focusFilter?.()),
        escape: handlers.escape && (() => latest.current.escape?.()),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [register, !!handlers.create, !!handlers.refresh, !!handlers.delete, !!handlers.focusFilter, !!handlers.escape],
  );
}
