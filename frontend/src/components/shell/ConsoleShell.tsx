'use client';

import type { ReactNode } from 'react';
import { HelpPanelProvider } from '@/components/help/HelpPanelProvider';
import { FlashbarProvider } from '@/components/notifications/FlashbarProvider';
import { Footer } from './Footer';
import { ShortcutsProvider } from './ShortcutsProvider';
import { TopNav } from './TopNav';

/** Everything that stays mounted across console pages: providers, top navigation and footer. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <FlashbarProvider>
      <HelpPanelProvider>
        <ShortcutsProvider>
          <TopNav />
          {children}
          <Footer />
        </ShortcutsProvider>
      </HelpPanelProvider>
    </FlashbarProvider>
  );
}
