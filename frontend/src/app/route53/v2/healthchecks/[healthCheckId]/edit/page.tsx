'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useParams, useRouter } from 'next/navigation';
import { EditHealthCheckForm } from '@/components/health-checks/HealthCheckForm';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { useHealthCheck } from '@/hooks/useHealthChecks';
import { ApiError } from '@/lib/api';

export default function EditHealthCheckPage() {
  const { healthCheckId } = useParams<{ healthCheckId: string }>();
  const router = useRouter();
  const { healthCheck, error } = useHealthCheck(healthCheckId);

  let content;
  if (healthCheck) content = <EditHealthCheckForm key={healthCheck.id} healthCheck={healthCheck} />;
  else if (error)
    content = (
      <SpaceBetween size="l">
        <Header variant="h1">{error instanceof ApiError && error.status === 404 ? 'Health check not found' : 'Unable to load health check'}</Header>
        <Container>
          <Box textAlign="center" padding={{ vertical: 'xl' }}>
            <SpaceBetween size="m">
              <Box variant="p">{error.message}</Box>
              <Button variant="primary" onClick={() => router.push('/route53/v2/healthchecks')}>
                Go to Health checks
              </Button>
            </SpaceBetween>
          </Box>
        </Container>
      </SpaceBetween>
    );
  else
    content = (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
      </Box>
    );

  return (
    <ConsolePage
      breadcrumbs={[
        { text: 'Health checks', href: '/route53/v2/healthchecks' },
        { text: healthCheck?.name ?? healthCheckId, href: '/route53/v2/healthchecks' },
        { text: 'Edit health check', href: `/route53/v2/healthchecks/${healthCheckId}/edit` },
      ]}
      helpKey="healthChecks"
      contentType="form"
    >
      {content}
    </ConsolePage>
  );
}
