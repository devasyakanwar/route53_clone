'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ZoneLoadState } from '@/components/hosted-zones/ZoneLoadState';
import { RecordForm } from '@/components/records/RecordForm';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { useZone } from '@/hooks/useZones';
import { ApiError, fetcher } from '@/lib/api';
import { displayName } from '@/lib/format';
import type { RecordSet } from '@/lib/types';

export default function EditRecordPage() {
  const { zoneId, recordKey } = useParams<{ zoneId: string; recordKey: string }>();
  const router = useRouter();
  const { zone, error: zoneError, mutate } = useZone(zoneId);
  const { data: record, error: recordError } = useSWR<RecordSet>(
    zone ? `/hostedzones/${zoneId}/recordsets/${recordKey}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const base = `/route53/v2/hostedzones/${zoneId}`;

  let content;
  if (!zone) content = <ZoneLoadState error={zoneError} zoneId={zoneId} onRetry={() => void mutate()} />;
  else if (recordError)
    content = (
      <SpaceBetween size="l">
        <Header variant="h1">{recordError instanceof ApiError && recordError.status === 404 ? 'Record not found' : 'Unable to load record'}</Header>
        <Container>
          <Box textAlign="center" padding={{ vertical: 'xl' }}>
            <SpaceBetween size="m">
              <Box variant="p">{recordError.message}</Box>
              <Button variant="primary" onClick={() => router.push(base)}>
                Back to {displayName(zone.name)}
              </Button>
            </SpaceBetween>
          </Box>
        </Container>
      </SpaceBetween>
    );
  else if (!record) content = <ZoneLoadState error={null} zoneId={zoneId} onRetry={() => undefined} />;
  else content = <RecordForm key={record.id} zone={zone} record={record} />;

  return (
    <ConsolePage
      breadcrumbs={[
        { text: 'Hosted zones', href: '/route53/v2/hostedzones' },
        { text: zone ? displayName(zone.name) : zoneId, href: base },
        { text: 'Edit record', href: `${base}/records/${recordKey}/edit` },
      ]}
      helpKey="editRecord"
      contentType="form"
    >
      {content}
    </ConsolePage>
  );
}
