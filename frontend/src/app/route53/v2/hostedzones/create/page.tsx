'use client';

import { ZoneForm } from '@/components/hosted-zones/ZoneForm';
import { ConsolePage } from '@/components/shell/ConsolePage';

export default function CreateHostedZonePage() {
  return (
    <ConsolePage
      breadcrumbs={[
        { text: 'Hosted zones', href: '/route53/v2/hostedzones' },
        { text: 'Create hosted zone', href: '/route53/v2/hostedzones/create' },
      ]}
      helpKey="createHostedZone"
      contentType="form"
    >
      <ZoneForm mode="create" />
    </ConsolePage>
  );
}
