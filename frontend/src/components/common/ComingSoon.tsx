'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useRouter } from 'next/navigation';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { InfoLink } from './InfoLink';

export function ComingSoon({ title, href }: { title: string; href: string }) {
  const router = useRouter();
  return (
    <ConsolePage breadcrumbs={[{ text: title, href }]} helpKey="comingSoon">
      <ContentLayout header={<Header variant="h1" info={<InfoLink topic="comingSoon" />}>{title}</Header>}>
        <Container>
          <Box textAlign="center" padding={{ vertical: 'xxl' }}>
            <SpaceBetween size="m">
              <Box variant="h2" color="inherit">
                {title}
              </Box>
              <Box variant="p" color="text-body-secondary">
                This feature is coming soon.
              </Box>
              <Button onClick={() => router.push('/route53/v2/hostedzones')}>Go to Hosted zones</Button>
            </SpaceBetween>
          </Box>
        </Container>
      </ContentLayout>
    </ConsolePage>
  );
}
