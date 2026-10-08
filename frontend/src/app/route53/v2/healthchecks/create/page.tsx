'use client';

import { CreateHealthCheckWizard } from '@/components/health-checks/HealthCheckForm';
import { ConsolePage } from '@/components/shell/ConsolePage';

export default function CreateHealthCheckPage() {
  return (
    <ConsolePage
      breadcrumbs={[
        { text: 'Health checks', href: '/route53/v2/healthchecks' },
        { text: 'Create health check', href: '/route53/v2/healthchecks/create' },
      ]}
      helpKey="createHealthCheck"
      contentType="wizard"
    >
      <CreateHealthCheckWizard />
    </ConsolePage>
  );
}
