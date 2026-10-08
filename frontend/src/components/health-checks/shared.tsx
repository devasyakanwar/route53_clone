'use client';

import StatusIndicator from '@cloudscape-design/components/status-indicator';
import type { HealthCheck, HealthStatus } from '@/lib/types';

export const HEALTH_CHECKER_REGIONS: { value: string; label: string }[] = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

export const MOCK_SNS_TOPICS = ['route53-alerts', 'ops-notifications'];
export const MOCK_CLOUDWATCH_ALARMS = ['cpu-utilization-high', 'error-rate-5xx', 'latency-p99-high'];

export function HealthStatusIndicator({ status }: { status: HealthStatus }) {
  const type = status === 'Healthy' ? 'success' : status === 'Unhealthy' ? 'error' : 'pending';
  return <StatusIndicator type={type}>{status}</StatusIndicator>;
}

export function monitorLabel(hc: HealthCheck): string {
  if (hc.type === 'CALCULATED') return 'Status of other health checks (calculated health check)';
  if (hc.type === 'CLOUDWATCH_METRIC') return 'State of CloudWatch alarm';
  return 'Endpoint';
}

export function protocolLabel(hc: HealthCheck): string {
  if (hc.type.startsWith('HTTPS')) return 'HTTPS';
  if (hc.type.startsWith('HTTP')) return 'HTTP';
  return hc.type === 'TCP' ? 'TCP' : '-';
}

export const isEndpoint = (hc: HealthCheck) => !['CALCULATED', 'CLOUDWATCH_METRIC'].includes(hc.type);
