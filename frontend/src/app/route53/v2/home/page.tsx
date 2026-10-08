'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { InfoLink } from '@/components/common/InfoLink';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { useShortcuts } from '@/components/shell/ShortcutsProvider';
import { useDashboard } from '@/hooks/useHealthChecks';
import { useZones } from '@/hooks/useZones';
import { displayName } from '@/lib/format';
import { validateZoneName } from '@/lib/validators';

function Section({
  title,
  description,
  count,
  countLabel,
  href,
  detail,
  action,
}: {
  title: string;
  description: string;
  count: number | undefined;
  countLabel: string;
  href: string;
  detail?: ReactNode;
  action: ReactNode;
}) {
  const router = useRouter();
  return (
    <SpaceBetween size="s">
      <Box variant="h3" padding="n">
        {title}
      </Box>
      <Box variant="p" color="text-body-secondary">
        {description}
      </Box>
      <div>
        {count === undefined ? (
          <Spinner />
        ) : (
          <Link
            href={href}
            variant="awsui-value-large"
            ariaLabel={`${count} ${countLabel}`}
            onFollow={e => {
              e.preventDefault();
              router.push(href);
            }}
          >
            {count}
          </Link>
        )}
        <Box variant="small" color="text-body-secondary" display="block" padding={{ top: 'xs' }}>
          {countLabel}
        </Box>
      </div>
      {detail}
      {action}
    </SpaceBetween>
  );
}

function RegisterDomain() {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const check = (e: FormEvent) => {
    e.preventDefault();
    const name = domain.trim().toLowerCase().replace(/\.$/, '');
    const err = !name ? 'Enter a domain name.' : !name.includes('.') ? 'Include a top-level domain, for example example.com.' : validateZoneName(name);
    setError(err ?? '');
    setResult(err ? null : name);
  };

  return (
    <Container
      header={
        <Header variant="h2" description="Find and register an available domain, or transfer your existing domains to Route 53.">
          Register domain
        </Header>
      }
    >
      <form onSubmit={check}>
        <SpaceBetween size="m">
          <FormField errorText={error} stretch>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <Input
                  value={domain}
                  onChange={e => {
                    setDomain(e.detail.value);
                    setResult(null);
                  }}
                  placeholder="Enter a domain name"
                  ariaLabel="Domain name to check"
                  type="search"
                />
              </div>
              <Button formAction="submit">Check</Button>
            </div>
          </FormField>
          {!!result && (
            <Alert type="info" header={`Domain registration isn't available in this clone`}>
              Route 53 would check whether <b>{result}</b> is available and show its price. To manage DNS for{' '}
              {result}, create a hosted zone for it.
            </Alert>
          )}
          <Box variant="small" color="text-body-secondary">
            Already own a domain? <Link fontSize="body-s" href="/route53/v2/domains/requests">Transfer domain</Link> to Route 53.
          </Box>
        </SpaceBetween>
      </form>
    </Container>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data, error, mutate } = useDashboard();
  const { zones, mutate: mutateZones } = useZones();
  useShortcuts({
    create: () => router.push('/route53/v2/hostedzones/create'),
    refresh: () => void Promise.all([mutate(), mutateZones()]),
  });
  const recent = [...(zones ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  return (
    <ConsolePage breadcrumbs={[{ text: 'Dashboard', href: '/route53/v2/home' }]} helpKey="dashboard">
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<InfoLink topic="dashboard" />}
            description="Amazon Route 53 is a highly available and scalable Domain Name System (DNS) web service."
          >
            Route 53 Dashboard
          </Header>
        }
      >
        <SpaceBetween size="l">
          {error && <Alert type="error" header="Unable to load the dashboard">{error.message}</Alert>}
          <Container>
            <ColumnLayout columns={4} variant="text-grid" minColumnWidth={180}>
              <Section
                title="DNS management"
                description="Route internet traffic to your resources."
                count={data?.hosted_zones}
                countLabel="Hosted zones"
                href="/route53/v2/hostedzones"
                detail={
                  data && (
                    <Box variant="small" color="text-body-secondary">
                      {data.public_hosted_zones} public · {data.private_hosted_zones} private · {data.record_sets} records
                    </Box>
                  )
                }
                action={<Button onClick={() => router.push('/route53/v2/hostedzones/create')}>Create hosted zone</Button>}
              />
              <Section
                title="Traffic management"
                description="Route traffic using a combination of routing policies."
                count={data?.policy_records}
                countLabel="Policy records"
                href="/route53/v2/policyrecords"
                action={<Button onClick={() => router.push('/route53/v2/trafficpolicies')}>Create policy</Button>}
              />
              <Section
                title="Availability monitoring"
                description="Monitor the health of your resources and route traffic away from unhealthy ones."
                count={data?.health_checks}
                countLabel="Health checks"
                href="/route53/v2/healthchecks"
                detail={
                  data && data.health_checks > 0 && (
                    <SpaceBetween size="xxs">
                      <StatusIndicator type="success">{data.healthy_health_checks} healthy</StatusIndicator>
                      <StatusIndicator type="error">{data.unhealthy_health_checks} unhealthy</StatusIndicator>
                      {data.unknown_health_checks > 0 && (
                        <StatusIndicator type="pending">{data.unknown_health_checks} unknown</StatusIndicator>
                      )}
                    </SpaceBetween>
                  )
                }
                action={<Button onClick={() => router.push('/route53/v2/healthchecks/create')}>Create health check</Button>}
              />
              <Section
                title="Domain registration"
                description="Register and manage domain names."
                count={data?.registered_domains}
                countLabel="Domains"
                href="/route53/v2/domains"
                detail={
                  data && (
                    <Box variant="small" color="text-body-secondary">
                      {data.pending_domain_requests} pending requests
                    </Box>
                  )
                }
                action={<Button onClick={() => router.push('/route53/v2/domains')}>Register domains</Button>}
              />
            </ColumnLayout>
          </Container>

          <RegisterDomain />

          <Table
            variant="container"
            header={
              <Header variant="h2" counter={zones ? `(${recent.length})` : undefined} description="The hosted zones that you created most recently.">
                Recently created hosted zones
              </Header>
            }
            loading={!zones}
            loadingText="Loading hosted zones"
            items={recent}
            trackBy="id"
            columnDefinitions={[
              {
                id: 'name',
                header: 'Hosted zone name',
                cell: z => (
                  <Link
                    href={`/route53/v2/hostedzones/${z.id}`}
                    onFollow={e => {
                      e.preventDefault();
                      router.push(`/route53/v2/hostedzones/${z.id}`);
                    }}
                  >
                    {displayName(z.name)}
                  </Link>
                ),
              },
              { id: 'type', header: 'Type', cell: z => (z.private_zone ? 'Private' : 'Public') },
              { id: 'records', header: 'Record count', cell: z => z.record_count },
              { id: 'id', header: 'Hosted zone ID', cell: z => z.id },
            ]}
            empty={
              <Box textAlign="center" color="inherit">
                <b>No hosted zones</b>
                <Box variant="p" color="inherit">
                  You don&apos;t have any hosted zones.
                </Box>
              </Box>
            }
          />

          <Container header={<Header variant="h2" counter="(0)">Notifications</Header>}>
            <Box textAlign="center" color="text-body-secondary" padding="s">
              There are no notifications about your domains or resources.
            </Box>
          </Container>
        </SpaceBetween>
      </ContentLayout>
    </ConsolePage>
  );
}
