'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ZoneLoadState } from '@/components/hosted-zones/ZoneLoadState';
import { RecordForm } from '@/components/records/RecordForm';
import { RecordWizard } from '@/components/records/RecordWizard';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { useZone } from '@/hooks/useZones';
import { displayName } from '@/lib/format';

function CreateRecordContent() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const wizard = useSearchParams().get('view') === 'wizard';
  const { zone, error, mutate } = useZone(zoneId);
  const base = `/route53/v2/hostedzones/${zoneId}`;
  return (
    <ConsolePage
      breadcrumbs={[
        { text: 'Hosted zones', href: '/route53/v2/hostedzones' },
        { text: zone ? displayName(zone.name) : zoneId, href: base },
        { text: 'Create record', href: `${base}/records/create` },
      ]}
      helpKey="createRecord"
      contentType={wizard ? 'wizard' : 'form'}
    >
      {!zone ? (
        <ZoneLoadState error={error} zoneId={zoneId} onRetry={() => void mutate()} />
      ) : wizard ? (
        <RecordWizard zone={zone} />
      ) : (
        <RecordForm zone={zone} />
      )}
    </ConsolePage>
  );
}

export default function CreateRecordPage() {
  return (
    <Suspense>
      <CreateRecordContent />
    </Suspense>
  );
}
