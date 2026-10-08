'use client';

import SideNavigation, { type SideNavigationProps } from '@cloudscape-design/components/side-navigation';
import { usePathname, useRouter } from 'next/navigation';

const BASE = '/route53/v2';

export const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: 'link', text: 'Dashboard', href: `${BASE}/home` },
  { type: 'link', text: 'Hosted zones', href: `${BASE}/hostedzones` },
  { type: 'link', text: 'Health checks', href: `${BASE}/healthchecks` },
  { type: 'link', text: 'Profiles', href: `${BASE}/profiles` },
  {
    type: 'section',
    text: 'IP-based routing',
    defaultExpanded: false,
    items: [{ type: 'link', text: 'CIDR collections', href: `${BASE}/cidrcollections` }],
  },
  {
    type: 'section',
    text: 'Traffic flow',
    defaultExpanded: false,
    items: [
      { type: 'link', text: 'Traffic policies', href: `${BASE}/trafficpolicies` },
      { type: 'link', text: 'Policy records', href: `${BASE}/policyrecords` },
    ],
  },
  {
    type: 'section',
    text: 'Domains',
    defaultExpanded: false,
    items: [
      { type: 'link', text: 'Registered domains', href: `${BASE}/domains` },
      { type: 'link', text: 'Requests', href: `${BASE}/domains/requests` },
    ],
  },
  {
    type: 'section',
    text: 'Resolver',
    defaultExpanded: false,
    items: [
      { type: 'link', text: 'VPCs', href: `${BASE}/resolver/vpcs` },
      { type: 'link', text: 'Inbound endpoints', href: `${BASE}/resolver/inbound-endpoints` },
      { type: 'link', text: 'Outbound endpoints', href: `${BASE}/resolver/outbound-endpoints` },
      { type: 'link', text: 'Rules', href: `${BASE}/resolver/rules` },
      { type: 'link', text: 'Query logging', href: `${BASE}/resolver/query-logging` },
    ],
  },
  {
    type: 'section',
    text: 'DNS Firewall',
    defaultExpanded: false,
    items: [
      { type: 'link', text: 'Rule groups', href: `${BASE}/firewall/rule-groups` },
      { type: 'link', text: 'Domain lists', href: `${BASE}/firewall/domain-lists` },
    ],
  },
  { type: 'divider' },
  {
    type: 'link',
    text: 'Application Recovery Controller',
    href: 'https://docs.aws.amazon.com/r53recovery/latest/dg/what-is-route53-recovery.html',
    external: true,
  },
];

/** Flattened (title, href) pairs, used for "Coming soon" page titles. */
export function findNavTitle(pathname: string): string | undefined {
  const walk = (items: readonly SideNavigationProps.Item[]): string | undefined => {
    for (const item of items) {
      if (item.type === 'link' && item.href === pathname) return item.text;
      if ((item.type === 'section' || item.type === 'expandable-link-group') && 'items' in item) {
        const found = walk(item.items);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(NAV_ITEMS);
}

function activeHref(pathname: string): string {
  if (pathname.startsWith(`${BASE}/hostedzones`)) return `${BASE}/hostedzones`;
  return pathname;
}

/** Expand the section that contains the current page. */
function withExpandedActive(pathname: string): SideNavigationProps.Item[] {
  return NAV_ITEMS.map(item =>
    item.type === 'section' && item.items.some(i => i.type === 'link' && i.href === pathname)
      ? { ...item, defaultExpanded: true }
      : item,
  );
}

export function SideNav() {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <SideNavigation
      header={{ text: 'Route 53', href: `${BASE}/home` }}
      activeHref={activeHref(pathname)}
      items={withExpandedActive(pathname)}
      onFollow={e => {
        if (!e.detail.external) {
          e.preventDefault();
          router.push(e.detail.href);
        }
      }}
    />
  );
}
