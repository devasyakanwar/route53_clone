'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';

/** Loading / "Hosted zone not found" / error states for pages that need a zone. */
export function ZoneLoadState({ error, zoneId, onRetry }: { error: unknown; zoneId: string; onRetry: () => void }) {
  const router = useRouter();
  if (!error) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }} color="text-status-inactive">
        <Spinner size="large" /> <Box variant="span" padding={{ left: 's' }}>Loading hosted zone</Box>
      </Box>
    );
  }
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <SpaceBetween size="l">
      <Header variant="h1">{notFound ? 'Hosted zone not found' : 'Unable to load hosted zone'}</Header>
      <Container>
        <Box textAlign="center" padding={{ vertical: 'xl' }}>
          <SpaceBetween size="m">
            <Box variant="p">
              {notFound
                ? `No hosted zone found with ID ${zoneId}. It may have been deleted, or the ID is incorrect.`
                : error instanceof Error
                  ? error.message
                  : 'An unexpected error occurred.'}
            </Box>
            <SpaceBetween direction="horizontal" size="xs" alignItems="center">
              {!notFound && <Button onClick={onRetry}>Retry</Button>}
              <Button variant="primary" onClick={() => router.push('/route53/v2/hostedzones')}>
                Go to Hosted zones
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </Box>
      </Container>
    </SpaceBetween>
  );
}
