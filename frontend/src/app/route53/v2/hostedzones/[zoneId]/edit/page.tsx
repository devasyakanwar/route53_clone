'use client';

import { useParams } from 'next/navigation';
import { ZoneForm } from '@/components/hosted-zones/ZoneForm';
import { ZoneLoadState } from '@/components/hosted-zones/ZoneLoadState';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { useZone } from '@/hooks/useZones';
import { displayName } from '@/lib/format';

export default function EditHostedZonePage() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const { zone, error, mutate } = useZone(zoneId);
  const base = `/route53/v2/hostedzones/${zoneId}`;
  return (
    <ConsolePage
      breadcrumbs={[
        { text: 'Hosted zones', href: '/route53/v2/hostedzones' },
        { text: zone ? displayName(zone.name) : zoneId, href: base },
        { text: 'Edit hosted zone', href: `${base}/edit` },
      ]}
      helpKey="editHostedZone"
      contentType="form"
    >
      {zone ? <ZoneForm key={zone.id} mode="edit" zone={zone} /> : <ZoneLoadState error={error} zoneId={zoneId} onRetry={() => void mutate()} />}
    </ConsolePage>
  );
}
