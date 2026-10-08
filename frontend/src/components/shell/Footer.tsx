'use client';

import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import * as tokens from '@cloudscape-design/design-tokens';
import { useNotify } from '@/components/notifications/FlashbarProvider';

export function Footer() {
  const notify = useNotify();
  const soon = (what: string) => () => notify.info({ header: `${what} is coming soon.`, timeout: 4000 });
  return (
    <footer
      id="console-footer"
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '6px 20px',
        fontSize: 12,
        background: tokens.colorBackgroundContainerHeader,
        borderTop: `1px solid ${tokens.colorBorderDividerDefault}`,
        color: tokens.colorTextBodySecondary,
      }}
    >
      <SpaceBetween direction="horizontal" size="m">
        <Link variant="secondary" fontSize="body-s" onFollow={soon('CloudShell')}>
          CloudShell
        </Link>
        <Link variant="secondary" fontSize="body-s" onFollow={soon('Feedback')}>
          Feedback
        </Link>
      </SpaceBetween>
      <SpaceBetween direction="horizontal" size="m" alignItems="center">
        <span>© 2026, Amazon Web Services, Inc. or its affiliates.</span>
        <Link variant="secondary" fontSize="body-s" external href="https://aws.amazon.com/privacy/">
          Privacy
        </Link>
        <Link variant="secondary" fontSize="body-s" external href="https://aws.amazon.com/terms/">
          Terms
        </Link>
        <Link variant="secondary" fontSize="body-s" onFollow={soon('Cookie preferences')}>
          Cookie preferences
        </Link>
      </SpaceBetween>
    </footer>
  );
}
