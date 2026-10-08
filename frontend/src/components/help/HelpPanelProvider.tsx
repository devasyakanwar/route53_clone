'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { HELP, type HelpKey } from './helpContent';

interface HelpApi {
  helpKey: HelpKey;
  toolsOpen: boolean;
  setToolsOpen: (open: boolean) => void;
  /** Open the tools drawer with the given topic (what "Info" links do). */
  openHelp: (key: HelpKey) => void;
  /** Set the page's default topic without opening the drawer. */
  setDefaultHelp: (key: HelpKey) => void;
  content: ReactNode;
}

const HelpContext = createContext<HelpApi | null>(null);

export function HelpPanelProvider({ children }: { children: ReactNode }) {
  const [helpKey, setHelpKey] = useState<HelpKey>('hostedZones');
  const [toolsOpen, setToolsOpen] = useState(false);

  const openHelp = useCallback((key: HelpKey) => {
    setHelpKey(key);
    setToolsOpen(true);
  }, []);

  const value = useMemo<HelpApi>(
    () => ({
      helpKey,
      toolsOpen,
      setToolsOpen,
      openHelp,
      setDefaultHelp: setHelpKey,
      content: HELP[helpKey],
    }),
    [helpKey, toolsOpen, openHelp],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpApi {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp must be used inside <HelpPanelProvider>');
  return ctx;
}
