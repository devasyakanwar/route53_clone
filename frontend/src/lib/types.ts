// Hand-written to match the FastAPI schemas in backend/app/schemas (see /docs for the OpenAPI spec).

export interface User {
  id: number;
  email: string;
  display_name: string;
  account_id: string;
}

export type ChangeStatus = 'PENDING' | 'INSYNC';

export interface ChangeInfo {
  id: string;
  status: ChangeStatus;
  submitted_at: string;
  comment: string | null;
}

export interface Vpc {
  vpc_id: string;
  vpc_region: string;
}

export interface Tag {
  key: string;
  value: string;
}

export interface HostedZone {
  id: string;
  name: string;
  comment: string | null;
  private_zone: boolean;
  record_count: number;
  created_by: string;
  caller_reference: string;
  created_at: string;
  updated_at: string;
}

export interface HostedZoneDetail extends HostedZone {
  name_servers: string[];
  vpcs: Vpc[];
  tags: Tag[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ZoneCreateInput {
  name: string;
  comment?: string | null;
  private_zone: boolean;
  vpcs: Vpc[];
  tags: Tag[];
}

export interface ZoneCreateResponse {
  hosted_zone: HostedZoneDetail;
  change_info: ChangeInfo;
  delegation_set: { name_servers: string[] };
}

export const RECORD_TYPES = [
  'A',
  'AAAA',
  'CAA',
  'CNAME',
  'DS',
  'MX',
  'NAPTR',
  'NS',
  'PTR',
  'SOA',
  'SPF',
  'SRV',
  'TXT',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const ROUTING_POLICIES = [
  'SIMPLE',
  'WEIGHTED',
  'GEOLOCATION',
  'LATENCY',
  'FAILOVER',
  'MULTIVALUE',
  'IP_BASED',
  'GEOPROXIMITY',
] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export interface AliasTarget {
  dns_name: string;
  hosted_zone_id: string;
  evaluate_target_health: boolean;
  endpoint_type?: string | null;
  region?: string | null;
}

export interface GeoLocation {
  continent?: string | null;
  country?: string | null;
  subdivision?: string | null;
}

export interface CidrRouting {
  collection_id: string;
  location_name: string;
}

export interface Geoproximity {
  aws_region?: string | null;
  local_zone_group?: string | null;
  coordinates?: { latitude: string; longitude: string } | null;
  bias?: number | null;
}

export interface RecordSetInput {
  name: string;
  type: RecordType;
  ttl?: number | null;
  values: string[];
  routing_policy: RoutingPolicy;
  set_identifier?: string | null;
  weight?: number | null;
  region?: string | null;
  failover?: 'PRIMARY' | 'SECONDARY' | null;
  geo_location?: GeoLocation | null;
  multivalue?: boolean | null;
  cidr_routing?: CidrRouting | null;
  geoproximity?: Geoproximity | null;
  health_check_id?: string | null;
  alias_target?: AliasTarget | null;
}

export interface RecordSet extends RecordSetInput {
  id: number;
  zone_id: string;
  ttl: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type ChangeAction = 'CREATE' | 'UPSERT' | 'DELETE';

export interface Change {
  action: ChangeAction;
  record_set: RecordSetInput;
}

export interface ImportResponse {
  record_sets: RecordSetInput[];
  skipped: string[];
  change_info: ChangeInfo | null;
}

export interface ApiFieldError {
  message: string;
  field: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; field: string | null; errors?: ApiFieldError[] };
}

// ------------------------------------------------------------------ health checks

export type HealthCheckType =
  | 'HTTP'
  | 'HTTPS'
  | 'HTTP_STR_MATCH'
  | 'HTTPS_STR_MATCH'
  | 'TCP'
  | 'CALCULATED'
  | 'CLOUDWATCH_METRIC';

export type HealthStatus = 'Healthy' | 'Unhealthy' | 'Unknown';

export interface CloudWatchAlarmConfig {
  alarm_name: string;
  region: string;
  insufficient_data_status: 'Healthy' | 'Unhealthy' | 'LastKnownStatus';
}

export interface HealthCheckNotification {
  sns_topic: string;
  emails: string[];
}

export interface HealthCheckConfig {
  name: string;
  type: HealthCheckType;
  ip_address?: string | null;
  fqdn?: string | null;
  port?: number | null;
  resource_path?: string | null;
  search_string?: string | null;
  request_interval: 10 | 30;
  failure_threshold: number;
  measure_latency: boolean;
  enable_sni?: boolean | null;
  regions: string[];
  child_health_checks: string[];
  health_threshold?: number | null;
  cloudwatch_alarm?: CloudWatchAlarmConfig | null;
  inverted: boolean;
  disabled: boolean;
  notification?: HealthCheckNotification | null;
}

export interface HealthCheck extends HealthCheckConfig {
  id: string;
  caller_reference: string;
  status: HealthStatus;
  description: string;
  alarms: string;
  tags: Tag[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CheckerObservation {
  region: string;
  region_name: string;
  ip_address: string;
  status: string;
  checked_at: string;
}

export interface HealthCheckStatusResponse {
  id: string;
  status: HealthStatus;
  observations: CheckerObservation[];
}

export interface HealthCheckMetrics {
  id: string;
  points: { timestamp: string; healthy_percentage: number; latency_ms: number | null }[];
}

export interface DashboardSummary {
  hosted_zones: number;
  public_hosted_zones: number;
  private_hosted_zones: number;
  record_sets: number;
  health_checks: number;
  healthy_health_checks: number;
  unhealthy_health_checks: number;
  unknown_health_checks: number;
  traffic_policies: number;
  policy_records: number;
  registered_domains: number;
  pending_domain_requests: number;
}
