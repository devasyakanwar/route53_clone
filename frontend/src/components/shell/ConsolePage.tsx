'use client';

import AppLayout, { type AppLayoutProps } from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useHelp } from '@/components/help/HelpPanelProvider';
import type { HelpKey } from '@/components/help/helpContent';
import { Notifications } from '@/components/notifications/FlashbarProvider';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { SideNav } from './SideNav';

export interface Crumb {
  text: string;
  href: string;
}

interface ConsolePageProps {
  breadcrumbs: Crumb[];
  helpKey: HelpKey;
  contentType?: AppLayoutProps.ContentType;
  splitPanel?: ReactNode;
  splitPanelOpen?: boolean;
  onSplitPanelToggle?: (open: boolean) => void;
  children: ReactNode;
}

const ROOT_CRUMB: Crumb = { text: 'Route 53', href: '/route53/v2/home' };

/** One console page: Cloudscape AppLayout with side nav, breadcrumbs, flashbar, help drawer and split panel. */
export function ConsolePage({
  breadcrumbs,
  helpKey,
  contentType = 'default',
  splitPanel,
  splitPanelOpen,
  onSplitPanelToggle,
  children,
}: ConsolePageProps) {
  const router = useRouter();
  const help = useHelp();
  const [nav, setNav] = useLocalStorage('r53.navigation', { open: true });
  const [splitPrefs, setSplitPrefs] = useLocalStorage<AppLayoutProps.SplitPanelPreferences>('r53.split-panel', {
    position: 'bottom',
  });

  const { setDefaultHelp, toolsOpen } = help;
  useEffect(() => {
    if (!toolsOpen) setDefaultHelp(helpKey);
    // Only reset the topic when the page changes, not when the drawer closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpKey, setDefaultHelp]);

  return (
    <AppLayout
      headerSelector="#top-nav"
      footerSelector="#console-footer"
      contentType={contentType}
      navigation={<SideNav />}
      navigationOpen={nav.open}
      onNavigationChange={e => setNav({ open: e.detail.open })}
      breadcrumbs={
        <BreadcrumbGroup
          ariaLabel="Breadcrumbs"
          expandAriaLabel="Show path"
          items={[ROOT_CRUMB, ...breadcrumbs]}
          onFollow={e => {
            e.preventDefault();
            router.push(e.detail.href);
          }}
        />
      }
      notifications={<Notifications />}
      stickyNotifications
      tools={help.content}
      toolsOpen={help.toolsOpen}
      onToolsChange={e => help.setToolsOpen(e.detail.open)}
      splitPanel={splitPanel}
      splitPanelOpen={splitPanelOpen}
      onSplitPanelToggle={e => onSplitPanelToggle?.(e.detail.open)}
      splitPanelPreferences={splitPrefs}
      onSplitPanelPreferencesChange={e => setSplitPrefs(e.detail)}
      content={children}
      ariaLabels={{
        navigation: 'Side navigation',
        navigationClose: 'Close side navigation',
        navigationToggle: 'Open side navigation',
        notifications: 'Notifications',
        tools: 'Help panel',
        toolsClose: 'Close help panel',
        toolsToggle: 'Open help panel',
      }}
    />
  );
}
