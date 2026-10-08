'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import SplitPanel from '@cloudscape-design/components/split-panel';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Tabs from '@cloudscape-design/components/tabs';
import { useRouter } from 'next/navigation';
import { useHealthCheckMetrics, useHealthCheckStatus } from '@/hooks/useHealthChecks';
import { formatDate } from '@/lib/format';
import type { HealthCheck } from '@/lib/types';
import { HealthStatusChart, LatencyChart } from './HealthCheckCharts';
import { HEALTH_CHECKER_REGIONS, HealthStatusIndicator, isEndpoint, monitorLabel, protocolLabel } from './shared';

const i18n = {
  closeButtonAriaLabel: 'Close panel',
  openButtonAriaLabel: 'Open panel',
  preferencesTitle: 'Split panel preferences',
  preferencesPositionLabel: 'Split panel position',
  preferencesPositionDescription: 'Choose the default split panel position for the service.',
  preferencesPositionSide: 'Side',
  preferencesPositionBottom: 'Bottom',
  preferencesConfirm: 'Confirm',
  preferencesCancel: 'Cancel',
  preferencesCloseAriaLabel: 'Close preferences',
  resizeHandleAriaLabel: 'Resize split panel',
};

const regionName = (r: string) => HEALTH_CHECKER_REGIONS.find(x => x.value === r)?.label ?? r;

function MonitoringTab({ hc, byId }: { hc: HealthCheck; byId: Map<string, HealthCheck> }) {
  const { data: metrics, isLoading } = useHealthCheckMetrics(hc.id);
  const endpoint = isEndpoint(hc);
  return (
    <SpaceBetween size="l">
      <KeyValuePairs
        columns={4}
        items={[
          { label: 'Status', value: <HealthStatusIndicator status={hc.status} /> },
          {
            label: 'Health check ID',
            value: (
              <CopyToClipboard
                variant="inline"
                textToCopy={hc.id}
                copyButtonAriaLabel="Copy health check ID"
                copySuccessText="Health check ID copied"
                copyErrorText="Health check ID failed to copy"
              />
            ),
          },
          { label: 'What to monitor', value: monitorLabel(hc) },
          ...(endpoint
            ? [
                { label: 'URL', value: <Box variant="span"><span style={{ wordBreak: 'break-all' }}>{hc.description}</span></Box> },
                { label: 'Protocol', value: protocolLabel(hc) },
                { label: 'IP address', value: hc.ip_address ?? '-' },
                { label: 'Host name', value: hc.fqdn ?? '-' },
                { label: 'Port', value: hc.port ?? '-' },
                { label: 'Request interval', value: hc.request_interval === 10 ? 'Fast (10 seconds)' : 'Standard (30 seconds)' },
                { label: 'Failure threshold', value: hc.failure_threshold },
                { label: 'Search string', value: hc.search_string ?? '-' },
                {
                  label: 'Health checker regions',
                  value: hc.regions.length ? hc.regions.map(regionName).join(', ') : 'Recommended (all Regions)',
                },
              ]
            : hc.type === 'CALCULATED'
              ? [
                  {
                    label: 'Health checks to monitor',
                    value: hc.child_health_checks.map(id => byId.get(id)?.name ?? id).join(', '),
                  },
                  { label: 'Report healthy when', value: `At least ${hc.health_threshold} of ${hc.child_health_checks.length} health checks are healthy` },
                ]
              : [
                  { label: 'CloudWatch alarm', value: hc.cloudwatch_alarm?.alarm_name ?? '-' },
                  { label: 'Region', value: hc.cloudwatch_alarm?.region ?? '-' },
                  { label: 'When data is insufficient', value: hc.cloudwatch_alarm?.insufficient_data_status ?? '-' },
                ]),
          { label: 'Invert health check status', value: hc.inverted ? 'Yes' : 'No' },
          { label: 'Disabled', value: hc.disabled ? 'Yes' : 'No' },
          { label: 'Created', value: formatDate(hc.created_at) },
        ]}
      />
      <Container header={<Header variant="h3" description="Percentage of health checkers that report the endpoint healthy.">Health check status</Header>}>
        <HealthStatusChart metrics={metrics} loading={isLoading} />
      </Container>
    </SpaceBetween>
  );
}

function HealthCheckersTab({ hc }: { hc: HealthCheck }) {
  const { data, isLoading } = useHealthCheckStatus(hc.id);
  if (!isEndpoint(hc)) {
    return (
      <Box color="text-body-secondary" padding="s">
        Health checkers only report on endpoint health checks. This health check monitors{' '}
        {hc.type === 'CALCULATED' ? 'the status of other health checks' : 'a CloudWatch alarm'}.
      </Box>
    );
  }
  return (
    <Table
      variant="embedded"
      loading={isLoading}
      loadingText="Loading health checker results"
      items={data?.observations ?? []}
      trackBy="region"
      wrapLines
      columnDefinitions={[
        { id: 'region', header: 'Health checker region', cell: o => `${o.region_name} (${o.region})` },
        { id: 'ip', header: 'Health checker IP', cell: o => o.ip_address },
        { id: 'checked', header: 'Last checked', cell: o => formatDate(o.checked_at) },
        {
          id: 'status',
          header: 'Status',
          cell: o => <StatusIndicator type={o.status.startsWith('Success') ? 'success' : 'error'}>{o.status}</StatusIndicator>,
        },
      ]}
      empty={
        <Box textAlign="center" color="inherit">
          <b>No results yet</b>
          <Box variant="p" color="inherit">
            Health checkers haven&apos;t reported on this endpoint yet. Results appear within a minute.
          </Box>
        </Box>
      }
    />
  );
}

export function HealthCheckSplitPanel({ selected, all }: { selected: HealthCheck[]; all: HealthCheck[] }) {
  const router = useRouter();
  const { data: metrics, isLoading: metricsLoading } = useHealthCheckMetrics(selected.length === 1 ? selected[0].id : undefined);

  if (selected.length !== 1) {
    return (
      <SplitPanel header={selected.length ? `${selected.length} health checks selected` : 'Health check details'} i18nStrings={i18n}>
        <Box textAlign="center" color="inherit" padding="l">
          {selected.length ? 'Select a single health check to see its details.' : 'Select a health check to see its details.'}
        </Box>
      </SplitPanel>
    );
  }

  const hc = selected[0];
  const byId = new Map(all.map(h => [h.id, h]));
  const editHref = `/route53/v2/healthchecks/${hc.id}/edit`;

  return (
    <SplitPanel
      header={hc.name}
      headerDescription={hc.description}
      headerActions={<Button onClick={() => router.push(editHref)}>Edit health check</Button>}
      i18nStrings={i18n}
    >
      <Tabs
        ariaLabel="Health check details"
        tabs={[
          { id: 'monitoring', label: 'Monitoring', content: <MonitoringTab hc={hc} byId={byId} /> },
          {
            id: 'alarms',
            label: 'Alarms',
            content: (
              <Table
                variant="embedded"
                items={hc.notification ? [hc.notification] : []}
                trackBy="sns_topic"
                header={
                  <Header
                    variant="h3"
                    counter={hc.notification ? '(1)' : '(0)'}
                    actions={<Button onClick={() => router.push(`${editHref}#notification`)}>{hc.notification ? 'Edit alarm' : 'Create alarm'}</Button>}
                  >
                    CloudWatch alarms
                  </Header>
                }
                columnDefinitions={[
                  { id: 'name', header: 'Alarm name', cell: () => `awsroute53-${hc.id.slice(0, 8)}-High-HealthCheckStatus` },
                  {
                    id: 'state',
                    header: 'State',
                    cell: () =>
                      hc.status === 'Unhealthy' ? (
                        <StatusIndicator type="error">In alarm</StatusIndicator>
                      ) : hc.status === 'Healthy' ? (
                        <StatusIndicator type="success">OK</StatusIndicator>
                      ) : (
                        <StatusIndicator type="pending">Insufficient data</StatusIndicator>
                      ),
                  },
                  { id: 'topic', header: 'SNS topic', cell: n => n.sns_topic },
                  { id: 'emails', header: 'Recipients', cell: n => n.emails.join(', ') || '-' },
                ]}
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>No alarms configured</b>
                    <Box variant="p" color="inherit">
                      Create an alarm to be notified when this health check is unhealthy.
                    </Box>
                  </Box>
                }
              />
            ),
          },
          {
            id: 'tags',
            label: `Tags (${hc.tags.length})`,
            content: (
              <Table
                variant="embedded"
                items={hc.tags}
                trackBy="key"
                header={
                  <Header variant="h3" actions={<Button onClick={() => router.push(`${editHref}#tags`)}>Manage tags</Button>}>
                    Tags
                  </Header>
                }
                columnDefinitions={[
                  { id: 'key', header: 'Key', cell: t => t.key },
                  { id: 'value', header: 'Value', cell: t => t.value || '-' },
                ]}
                empty={<Box textAlign="center" color="inherit">No tags associated with this health check.</Box>}
              />
            ),
          },
          { id: 'checkers', label: 'Health checkers', content: <HealthCheckersTab hc={hc} /> },
          {
            id: 'latency',
            label: 'Latency',
            content: hc.measure_latency ? (
              <LatencyChart metrics={metrics} loading={metricsLoading} />
            ) : (
              <Box color="text-body-secondary" padding="s">
                Latency graphs aren&apos;t enabled for this health check. You can enable latency graphs only when you
                create a health check.
              </Box>
            ),
          },
        ]}
      />
    </SplitPanel>
  );
}
