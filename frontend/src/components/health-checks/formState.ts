import type { HealthCheck, HealthCheckConfig, HealthCheckType } from '@/lib/types';
import { isDomainValue } from '@/lib/validators';

export type Monitor = 'endpoint' | 'calculated' | 'cloudwatch';
export type Protocol = 'HTTP' | 'HTTPS' | 'TCP';

export interface HcFormState {
  name: string;
  monitor: Monitor;
  specifyBy: 'ip' | 'domain';
  protocol: Protocol;
  ipAddress: string;
  hostName: string;
  domainName: string;
  port: string;
  path: string;
  requestInterval: '10' | '30';
  failureThreshold: string;
  stringMatching: boolean;
  searchString: string;
  latency: boolean;
  invert: boolean;
  disabled: boolean;
  regionsMode: 'recommended' | 'custom';
  regions: string[];
  children: string[];
  threshold: string;
  cwRegion: string;
  cwAlarm: string;
  insufficient: 'Healthy' | 'Unhealthy' | 'LastKnownStatus';
  createAlarm: boolean;
  topicMode: 'existing' | 'new';
  existingTopic: string;
  newTopic: string;
  emails: string;
}

export type HcField =
  | 'name'
  | 'ip_address'
  | 'fqdn'
  | 'port'
  | 'resource_path'
  | 'search_string'
  | 'failure_threshold'
  | 'regions'
  | 'child_health_checks'
  | 'health_threshold'
  | 'cloudwatch_alarm'
  | 'sns_topic'
  | 'emails'
  | 'type';

export type HcErrors = Partial<Record<HcField, string>>;

export const STEP1_FIELDS: HcField[] = [
  'name', 'ip_address', 'fqdn', 'port', 'resource_path', 'search_string', 'failure_threshold', 'regions',
  'child_health_checks', 'health_threshold', 'cloudwatch_alarm', 'type',
];

export function emptyForm(): HcFormState {
  return {
    name: '',
    monitor: 'endpoint',
    specifyBy: 'ip',
    protocol: 'HTTP',
    ipAddress: '',
    hostName: '',
    domainName: '',
    port: '80',
    path: '',
    requestInterval: '30',
    failureThreshold: '3',
    stringMatching: false,
    searchString: '',
    latency: false,
    invert: false,
    disabled: false,
    regionsMode: 'recommended',
    regions: [],
    children: [],
    threshold: '1',
    cwRegion: 'us-east-1',
    cwAlarm: '',
    insufficient: 'LastKnownStatus',
    createAlarm: false,
    topicMode: 'existing',
    existingTopic: '',
    newTopic: '',
    emails: '',
  };
}

export function fromHealthCheck(hc: HealthCheck): HcFormState {
  const base = emptyForm();
  const monitor: Monitor = hc.type === 'CALCULATED' ? 'calculated' : hc.type === 'CLOUDWATCH_METRIC' ? 'cloudwatch' : 'endpoint';
  return {
    ...base,
    name: hc.name,
    monitor,
    specifyBy: hc.ip_address ? 'ip' : 'domain',
    protocol: hc.type.startsWith('HTTPS') ? 'HTTPS' : hc.type === 'TCP' ? 'TCP' : 'HTTP',
    ipAddress: hc.ip_address ?? '',
    hostName: hc.ip_address ? hc.fqdn ?? '' : '',
    domainName: hc.ip_address ? '' : hc.fqdn ?? '',
    port: hc.port != null ? String(hc.port) : base.port,
    path: (hc.resource_path ?? '').replace(/^\//, ''),
    requestInterval: hc.request_interval === 10 ? '10' : '30',
    failureThreshold: String(hc.failure_threshold),
    stringMatching: hc.type.endsWith('STR_MATCH'),
    searchString: hc.search_string ?? '',
    latency: hc.measure_latency,
    invert: hc.inverted,
    disabled: hc.disabled,
    regionsMode: hc.regions.length ? 'custom' : 'recommended',
    regions: hc.regions,
    children: hc.child_health_checks,
    threshold: hc.health_threshold != null ? String(hc.health_threshold) : '1',
    cwRegion: hc.cloudwatch_alarm?.region ?? base.cwRegion,
    cwAlarm: hc.cloudwatch_alarm?.alarm_name ?? '',
    insufficient: hc.cloudwatch_alarm?.insufficient_data_status ?? 'LastKnownStatus',
    createAlarm: !!hc.notification,
    topicMode: 'existing',
    existingTopic: hc.notification?.sns_topic ?? '',
    emails: (hc.notification?.emails ?? []).join(', '),
  };
}

export function healthCheckType(s: HcFormState): HealthCheckType {
  if (s.monitor === 'calculated') return 'CALCULATED';
  if (s.monitor === 'cloudwatch') return 'CLOUDWATCH_METRIC';
  if (s.protocol === 'TCP') return 'TCP';
  return (s.stringMatching ? `${s.protocol}_STR_MATCH` : s.protocol) as HealthCheckType;
}

const emailList = (s: string) =>
  s
    .split(/[\s,;]+/)
    .map(e => e.trim())
    .filter(Boolean);

export function toConfig(s: HcFormState): HealthCheckConfig {
  const type = healthCheckType(s);
  const endpoint = s.monitor === 'endpoint';
  return {
    name: s.name.trim(),
    type,
    ip_address: endpoint && s.specifyBy === 'ip' ? s.ipAddress.trim() || null : null,
    fqdn: endpoint ? (s.specifyBy === 'ip' ? s.hostName.trim() : s.domainName.trim()) || null : null,
    port: endpoint && /^\d+$/.test(s.port) ? Number(s.port) : null,
    resource_path: endpoint && s.protocol !== 'TCP' ? '/' + s.path.trim().replace(/^\//, '') : null,
    search_string: endpoint && s.stringMatching && s.protocol !== 'TCP' ? s.searchString : null,
    request_interval: s.requestInterval === '10' ? 10 : 30,
    failure_threshold: Number(s.failureThreshold) || 3,
    measure_latency: endpoint && s.latency,
    regions: endpoint && s.regionsMode === 'custom' ? s.regions : [],
    child_health_checks: s.monitor === 'calculated' ? s.children : [],
    health_threshold: s.monitor === 'calculated' ? Number(s.threshold) : null,
    cloudwatch_alarm:
      s.monitor === 'cloudwatch' ? { alarm_name: s.cwAlarm, region: s.cwRegion, insufficient_data_status: s.insufficient } : null,
    inverted: s.invert,
    disabled: s.disabled,
    notification: s.createAlarm
      ? { sns_topic: (s.topicMode === 'existing' ? s.existingTopic : s.newTopic).trim(), emails: emailList(s.emails) }
      : null,
  };
}

const isIp = (v: string) =>
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(v) || (/^[0-9a-fA-F:]+$/.test(v) && v.includes(':'));

/** Mirrors backend/app/services/health_checks.py validation. */
export function validateStep1(s: HcFormState): HcErrors {
  const e: HcErrors = {};
  if (!s.name.trim()) e.name = 'Enter a name for the health check.';
  else if (s.name.length > 256) e.name = 'The name can have up to 256 characters.';
  const ft = Number(s.failureThreshold);
  if (!Number.isInteger(ft) || ft < 1 || ft > 10) e.failure_threshold = 'The failure threshold must be between 1 and 10.';
  if (s.monitor === 'endpoint') {
    if (s.specifyBy === 'ip') {
      if (!s.ipAddress.trim()) e.ip_address = 'Enter an IP address or a domain name.';
      else if (!isIp(s.ipAddress.trim())) e.ip_address = `${s.ipAddress.trim()} is not a valid IPv4 or IPv6 address.`;
      else if (/^(127\.|0\.0\.0\.0$|169\.254\.)/.test(s.ipAddress.trim()))
        e.ip_address = "Route 53 can't check loopback, link-local, multicast or unspecified addresses.";
      if (s.hostName.trim() && !isDomainValue(s.hostName.trim())) e.fqdn = `${s.hostName.trim()} is not a valid domain name.`;
    } else if (!s.domainName.trim()) e.fqdn = 'Enter an IP address or a domain name.';
    else if (!isDomainValue(s.domainName.trim()) || s.domainName.includes('*')) e.fqdn = `${s.domainName.trim()} is not a valid domain name.`;
    const port = Number(s.port);
    if (!/^\d+$/.test(s.port) || port < 1 || port > 65535) e.port = 'The port must be between 1 and 65535.';
    if (s.path.length > 254) e.resource_path = 'The path can have up to 255 characters.';
    if (s.stringMatching && s.protocol !== 'TCP') {
      if (!s.searchString.trim()) e.search_string = 'Enter the string that Route 53 searches for in the response body.';
      else if (s.searchString.length > 255) e.search_string = 'The search string can have up to 255 characters.';
    }
    if (s.regionsMode === 'custom' && s.regions.length < 3) e.regions = 'Choose at least three health checker Regions.';
  } else if (s.monitor === 'calculated') {
    if (!s.children.length) e.child_health_checks = 'Choose the health checks to monitor.';
    const t = Number(s.threshold);
    if (!Number.isInteger(t) || t < 0 || t > s.children.length) e.health_threshold = `Enter a number between 0 and ${s.children.length}.`;
  } else if (!s.cwAlarm || !s.cwRegion) {
    e.cloudwatch_alarm = 'Choose a Region and a CloudWatch alarm.';
  }
  return e;
}

export function validateStep2(s: HcFormState): HcErrors {
  const e: HcErrors = {};
  if (!s.createAlarm) return e;
  const topic = s.topicMode === 'existing' ? s.existingTopic : s.newTopic;
  if (!topic.trim()) e.sns_topic = s.topicMode === 'existing' ? 'Choose an SNS topic.' : 'Enter an SNS topic name.';
  else if (s.topicMode === 'new' && !/^[A-Za-z0-9_-]{1,256}$/.test(topic.trim()))
    e.sns_topic = 'Topic names can contain only letters, numbers, hyphens and underscores.';
  const emails = emailList(s.emails);
  if (s.topicMode === 'new' && !emails.length) e.emails = 'Enter at least one email address.';
  const bad = emails.find(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (bad) e.emails = `${bad} is not a valid email address.`;
  return e;
}

/** Maps an API error field ("ip_address", "notification.emails[0]", ...) onto a form field. */
export function mapServerField(field: string | null): HcField | null {
  if (!field) return null;
  if (field.startsWith('notification.emails')) return 'emails';
  if (field.startsWith('notification')) return 'sns_topic';
  const known: HcField[] = [
    'name', 'ip_address', 'fqdn', 'port', 'resource_path', 'search_string', 'failure_threshold', 'regions',
    'child_health_checks', 'health_threshold', 'cloudwatch_alarm', 'type',
  ];
  return (known as string[]).includes(field) ? (field as HcField) : null;
}

export function urlPreview(s: HcFormState): string {
  const host = s.specifyBy === 'ip' ? (s.ipAddress.includes(':') ? `[${s.ipAddress}]` : s.ipAddress) : s.domainName;
  if (!host) return '-';
  const scheme = s.protocol.toLowerCase();
  return s.protocol === 'TCP' ? `tcp://${host}:${s.port}` : `${scheme}://${host}:${s.port}/${s.path.replace(/^\//, '')}`;
}
