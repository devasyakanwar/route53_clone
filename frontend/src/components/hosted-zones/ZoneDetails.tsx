'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useRouter } from 'next/navigation';
import { InfoLink } from '@/components/common/InfoLink';
import { dash, displayName, formatDate } from '@/lib/format';
import type { HostedZoneDetail } from '@/lib/types';

function NameServers({ servers }: { servers: string[] }) {
  return (
    <SpaceBetween size="xxs">
      {servers.map(ns => (
        <CopyToClipboard
          key={ns}
          variant="inline"
          textToCopy={ns}
          copyButtonAriaLabel={`Copy ${ns}`}
          copySuccessText="Name server copied"
          copyErrorText="Name server failed to copy"
        />
      ))}
    </SpaceBetween>
  );
}

export function ZoneDetails({ zone }: { zone: HostedZoneDetail }) {
  const router = useRouter();
  return (
    <ExpandableSection
      variant="container"
      defaultExpanded
      headerText="Hosted zone details"
      headerActions={
        <Button onClick={() => router.push(`/route53/v2/hostedzones/${zone.id}/edit`)}>Edit hosted zone</Button>
      }
    >
      <KeyValuePairs
        columns={3}
        items={[
          { label: 'Hosted zone name', value: displayName(zone.name) },
          {
            label: 'Hosted zone ID',
            value: (
              <CopyToClipboard
                variant="inline"
                textToCopy={zone.id}
                copyButtonAriaLabel="Copy hosted zone ID"
                copySuccessText="Hosted zone ID copied"
                copyErrorText="Hosted zone ID failed to copy"
              />
            ),
          },
          { label: 'Description', value: dash(zone.comment) },
          { label: 'Query log', value: '-' },
          { label: 'Type', value: zone.private_zone ? 'Private hosted zone' : 'Public hosted zone' },
          { label: 'Record count', value: zone.record_count },
          { label: 'Name servers', info: <InfoLink topic="nameServers" />, value: <NameServers servers={zone.name_servers} /> },
          { label: 'Created by', value: zone.created_by },
          { label: 'Created', value: formatDate(zone.created_at) },
          ...(zone.private_zone
            ? [
                {
                  label: 'VPCs associated with the hosted zone',
                  value: zone.vpcs.length ? (
                    <SpaceBetween size="xxs">
                      {zone.vpcs.map(v => (
                        <Box key={`${v.vpc_region}/${v.vpc_id}`}>
                          {v.vpc_id} <Box variant="span" color="text-body-secondary">({v.vpc_region})</Box>
                        </Box>
                      ))}
                    </SpaceBetween>
                  ) : (
                    '-'
                  ),
                },
              ]
            : []),
        ]}
      />
    </ExpandableSection>
  );
}
