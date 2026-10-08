'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useRouter } from 'next/navigation';
import type { HostedZoneDetail } from '@/lib/types';

export function DnssecTab({ zone }: { zone: HostedZoneDetail }) {
  return (
    <Container
      header={
        <Header
          variant="h2"
          description="DNSSEC signing adds cryptographic signatures to the records in the hosted zone."
          actions={
            <Button disabled disabledReason="DNSSEC signing isn't available in this clone.">
              Enable DNSSEC signing
            </Button>
          }
        >
          DNSSEC signing
        </Header>
      }
    >
      <KeyValuePairs
        columns={3}
        items={[
          { label: 'DNSSEC signing status', value: <StatusIndicator type="stopped">Not signing</StatusIndicator> },
          { label: 'Key-signing keys (KSKs)', value: '-' },
          {
            label: 'Supported for this hosted zone',
            value: zone.private_zone ? 'No (private hosted zones)' : 'Yes',
          },
        ]}
      />
    </Container>
  );
}

export function TagsTab({ zone }: { zone: HostedZoneDetail }) {
  const router = useRouter();
  return (
    <Table
      variant="container"
      items={zone.tags}
      trackBy="key"
      header={
        <Header
          variant="h2"
          counter={`(${zone.tags.length})`}
          description="Tags help you organize and identify hosted zones."
          actions={<Button onClick={() => router.push(`/route53/v2/hostedzones/${zone.id}/edit`)}>Manage tags</Button>}
        >
          Hosted zone tags
        </Header>
      }
      columnDefinitions={[
        { id: 'key', header: 'Key', cell: t => t.key, sortingField: 'key' },
        { id: 'value', header: 'Value', cell: t => t.value || '-' },
      ]}
      empty={
        <Box textAlign="center" color="inherit">
          <SpaceBetween size="xxs">
            <Box variant="strong" color="inherit">
              No tags
            </Box>
            <Box variant="p" color="inherit">
              No tags are associated with this hosted zone.
            </Box>
          </SpaceBetween>
        </Box>
      }
    />
  );
}

export function AcceleratedRecoveryTab() {
  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Accelerated recovery lets you make DNS changes to public hosted zones during a disruption in the US East (N. Virginia) Region."
          actions={
            <Button disabled disabledReason="Accelerated recovery isn't available in this clone.">
              Enable
            </Button>
          }
        >
          Accelerated recovery
        </Header>
      }
    >
      <KeyValuePairs
        columns={2}
        items={[{ label: 'Status', value: <StatusIndicator type="stopped">Disabled</StatusIndicator> }]}
      />
    </Container>
  );
}
