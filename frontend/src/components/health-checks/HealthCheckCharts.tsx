'use client';

import Box from '@cloudscape-design/components/box';
import LineChart from '@cloudscape-design/components/line-chart';
import type { HealthCheckMetrics } from '@/lib/types';

const timeFormatter = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

const toDate = (iso: string) => new Date(iso.endsWith('Z') ? iso : iso + 'Z');

function Empty({ text }: { text: string }) {
  return (
    <Box textAlign="center" color="inherit">
      <b>No data available</b>
      <Box variant="p" color="inherit">
        {text}
      </Box>
    </Box>
  );
}

const chartI18n = {
  xTickFormatter: timeFormatter,
  filterLabel: 'Filter displayed data',
  filterPlaceholder: 'Filter data',
  legendAriaLabel: 'Legend',
  chartAriaRoleDescription: 'line chart',
};

/**
 * HealthCheckPercentageHealthy over the last hour. One series on one axis; Cloudscape supplies the
 * console's data-visualization palette, the crosshair tooltip and dark-mode colors.
 */
export function HealthStatusChart({ metrics, loading }: { metrics?: HealthCheckMetrics; loading: boolean }) {
  const data = (metrics?.points ?? []).map(p => ({ x: toDate(p.timestamp), y: p.healthy_percentage }));
  return (
    <LineChart
      series={[
        {
          title: 'Health checkers reporting healthy (%)',
          type: 'line',
          data,
          valueFormatter: v => `${v}%`,
        },
      ]}
      xScaleType="time"
      yDomain={[0, 100]}
      xTitle="Time (last hour, local time)"
      yTitle="Healthy (%)"
      height={200}
      hideFilter
      hideLegend
      statusType={loading ? 'loading' : 'finished'}
      loadingText="Loading chart"
      i18nStrings={{ ...chartI18n, yTickFormatter: v => `${v}%` }}
      ariaLabel="Health check status, percentage of health checkers reporting healthy over the last hour"
      empty={<Empty text="Route 53 hasn't received any results from health checkers yet." />}
      noMatch={<Empty text="There is no matching data to display." />}
    />
  );
}

/** TimeToFirstByte (latency) over the last hour, in milliseconds. A separate chart: never a second y-axis. */
export function LatencyChart({ metrics, loading }: { metrics?: HealthCheckMetrics; loading: boolean }) {
  const data = (metrics?.points ?? [])
    .filter(p => p.latency_ms != null)
    .map(p => ({ x: toDate(p.timestamp), y: p.latency_ms as number }));
  return (
    <LineChart
      series={[{ title: 'Time to first byte (ms)', type: 'line', data, valueFormatter: v => `${v} ms` }]}
      xScaleType="time"
      xTitle="Time (last hour, local time)"
      yTitle="Milliseconds"
      height={200}
      hideFilter
      hideLegend
      statusType={loading ? 'loading' : 'finished'}
      loadingText="Loading chart"
      i18nStrings={{ ...chartI18n, yTickFormatter: v => `${v}` }}
      ariaLabel="Time to first byte over the last hour, in milliseconds"
      empty={<Empty text="Route 53 hasn't received any latency measurements yet." />}
      noMatch={<Empty text="There is no matching data to display." />}
    />
  );
}
