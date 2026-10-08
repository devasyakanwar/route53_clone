'use client';

import Autosuggest from '@cloudscape-design/components/autosuggest';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { useShortcutsApi } from '@/components/shell/ShortcutsProvider';
import { AWS_REGIONS } from '@/components/records/recordTypes';
import { useSession } from '@/hooks/useSession';
import { useZones } from '@/hooks/useZones';
import { api } from '@/lib/api';
import { displayName, formatAccountId } from '@/lib/format';
import { readVisualMode, saveVisualMode, type VisualMode } from '@/lib/theme';

function ServicesMenu() {
  const router = useRouter();
  const unavailable = (id: string, text: string) => ({ id, text, disabled: true, disabledReason: 'Not available in this clone' });
  return (
    <ButtonDropdown
      variant="normal"
      ariaLabel="Services"
      items={[
        { id: 'recent', text: 'Recently visited', items: [{ id: 'route53', text: 'Route 53', description: 'Scalable DNS and domain name registration' }] },
        {
          id: 'all',
          text: 'All services',
          items: [
            unavailable('ec2', 'EC2'),
            unavailable('s3', 'S3'),
            unavailable('cloudfront', 'CloudFront'),
            unavailable('iam', 'IAM'),
            unavailable('vpc', 'VPC'),
            unavailable('acm', 'Certificate Manager'),
          ],
        },
      ]}
      onItemClick={e => {
        if (e.detail.id === 'route53') router.push('/route53/v2/hostedzones');
      }}
    >
      Services
    </ButtonDropdown>
  );
}

function ConsoleSearch() {
  const router = useRouter();
  const { zones } = useZones();
  const [value, setValue] = useState('');
  const options = (zones ?? []).map(z => ({
    value: z.id,
    label: displayName(z.name),
    description: `Hosted zone · ${z.private_zone ? 'Private' : 'Public'} · ${z.id}`,
  }));
  return (
    <div id="top-nav-search" style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
      <ServicesMenu />
      <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
        <Autosuggest
          value={value}
          onChange={e => setValue(e.detail.value)}
          onSelect={e => {
            const zone = zones?.find(z => z.id === e.detail.value);
            if (zone) {
              setValue('');
              router.push(`/route53/v2/hostedzones/${zone.id}`);
            }
          }}
          options={options}
          filteringType="auto"
          placeholder="Search"
          ariaLabel="Search hosted zones"
          enteredTextLabel={v => `Search for "${v}"`}
          empty="No hosted zones match"
          virtualScroll={false}
        />
        {!value && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 12,
              opacity: 0.6,
              pointerEvents: 'none',
            }}
          >
            [Alt+S]
          </span>
        )}
      </div>
    </div>
  );
}

export function TopNav() {
  const router = useRouter();
  const notify = useNotify();
  const { showHelp } = useShortcutsApi();
  const { user } = useSession();
  const [mode, setMode] = useState<VisualMode>('system');

  useEffect(() => setMode(readVisualMode()), []);

  const setVisualMode = (m: VisualMode) => {
    setMode(m);
    saveVisualMode(m);
  };

  const account = user ? formatAccountId(user.account_id) : '';
  const soon = (what: string) => notify.info({ header: `${what} is coming soon.`, timeout: 4000 });

  return (
    <div id="top-nav" style={{ position: 'sticky', top: 0, zIndex: 1002 }}>
      <TopNavigation
        identity={{
          href: '/route53/v2/hostedzones',
          logo: { src: '/aws-logo.svg', alt: 'Amazon Web Services' },
          onFollow: e => {
            e.preventDefault();
            router.push('/route53/v2/hostedzones');
          },
        }}
        search={<ConsoleSearch />}
        utilities={[
          {
            type: 'button',
            iconName: 'command-prompt',
            ariaLabel: 'CloudShell',
            title: 'CloudShell',
            disableUtilityCollapse: false,
            onClick: () => soon('CloudShell'),
          },
          {
            type: 'button',
            iconName: 'notification',
            ariaLabel: 'Notifications',
            title: 'Notifications',
            badge: false,
            onClick: () => notify.info({ header: 'You have no new notifications.', timeout: 4000 }),
          },
          {
            type: 'menu-dropdown',
            iconName: 'support',
            ariaLabel: 'Help',
            title: 'Help',
            items: [
              { id: 'docs', text: 'Route 53 Developer Guide', href: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/', external: true, externalIconAriaLabel: '(opens in new tab)' },
              { id: 'api', text: 'API reference', href: 'https://docs.aws.amazon.com/Route53/latest/APIReference/', external: true, externalIconAriaLabel: '(opens in new tab)' },
              { id: 'shortcuts', text: 'Keyboard shortcuts' },
            ],
            onItemClick: e => {
              if (e.detail.id === 'shortcuts') showHelp();
            },
          },
          {
            type: 'menu-dropdown',
            iconName: 'settings',
            ariaLabel: 'Settings',
            title: 'Settings',
            items: [
              {
                id: 'visual-mode',
                text: 'Visual mode',
                items: [
                  { id: 'mode-light', text: 'Light', itemType: 'checkbox', checked: mode === 'light' },
                  { id: 'mode-dark', text: 'Dark', itemType: 'checkbox', checked: mode === 'dark' },
                  { id: 'mode-system', text: 'Browser default', itemType: 'checkbox', checked: mode === 'system' },
                ],
              },
            ],
            onItemClick: e => {
              const id = e.detail.id;
              if (id === 'mode-light') setVisualMode('light');
              if (id === 'mode-dark') setVisualMode('dark');
              if (id === 'mode-system') setVisualMode('system');
            },
          },
          {
            type: 'menu-dropdown',
            text: 'Global',
            title: 'Region',
            ariaLabel: 'Region: Global',
            description: "Route 53 doesn't require region selection.",
            items: AWS_REGIONS.map(r => ({
              id: r.value,
              text: r.label,
              secondaryText: r.value,
              disabled: true,
              disabledReason: "Route 53 doesn't require region selection",
            })),
          },
          {
            type: 'menu-dropdown',
            text: user ? `${user.display_name} @ ${account}` : 'Account',
            description: user?.email,
            iconName: 'user-profile',
            ariaLabel: 'Account',
            items: [
              { id: 'account-id', text: `Account ID: ${account}`, disabled: true },
              { id: 'organization', text: 'Organization' },
              { id: 'billing', text: 'Billing and Cost Management' },
              { id: 'security', text: 'Security credentials' },
              { id: 'signout', text: 'Sign out' },
            ],
            onItemClick: async e => {
              switch (e.detail.id) {
                case 'signout':
                  try {
                    await api.logout();
                  } finally {
                    window.location.href = '/login';
                  }
                  break;
                case 'organization':
                  soon('Organization');
                  break;
                case 'billing':
                  soon('Billing and Cost Management');
                  break;
                case 'security':
                  soon('Security credentials');
                  break;
              }
            },
          },
        ]}
        i18nStrings={{
          searchIconAriaLabel: 'Search',
          searchDismissIconAriaLabel: 'Close search',
          overflowMenuTriggerText: 'More',
          overflowMenuTitleText: 'All',
          overflowMenuBackIconAriaLabel: 'Back',
          overflowMenuDismissIconAriaLabel: 'Close menu',
        }}
      />
    </div>
  );
}
