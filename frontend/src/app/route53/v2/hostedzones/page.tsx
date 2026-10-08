'use client';

import { Suspense } from 'react';
import { ZonesTable } from '@/components/hosted-zones/ZonesTable';
import { ConsolePage } from '@/components/shell/ConsolePage';

export default function HostedZonesPage() {
  return (
    <ConsolePage
      breadcrumbs={[{ text: 'Hosted zones', href: '/route53/v2/hostedzones' }]}
      helpKey="hostedZones"
      contentType="table"
    >
      <Suspense>
        <ZonesTable />
      </Suspense>
    </ConsolePage>
  );
}
