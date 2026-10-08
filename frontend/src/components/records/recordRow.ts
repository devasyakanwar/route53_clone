import { relativeName } from '@/lib/format';
import type { RecordSet, RecordSetInput, RecordType, RoutingPolicy } from '@/lib/types';
import { validateRecordName, validateTtl, validateValues, isDomainValue } from '@/lib/validators';
import { aliasEndpoint, typeInfo } from './recordTypes';

/** Form state for one "Record N" container in Quick create / Edit record. */
export interface RecordRowState {
  key: string;
  subdomain: string;
  type: RecordType;
  alias: boolean;
  value: string;
  ttl: string;
  routingPolicy: RoutingPolicy;
  setIdentifier: string;
  weight: string;
  region: string;
  failover: '' | 'PRIMARY' | 'SECONDARY';
  geoLocation: string;
  cidrCollection: string;
  cidrLocation: string;
  geoproximityRegion: string;
  geoproximityBias: string;
  healthCheckId: string;
  aliasEndpointType: string;
  aliasRegion: string;
  aliasTarget: string;
  evaluateTargetHealth: boolean;
}

export type RowErrors = Partial<Record<RowField, string>>;
export type RowField =
  | 'name'
  | 'type'
  | 'values'
  | 'ttl'
  | 'routing_policy'
  | 'set_identifier'
  | 'weight'
  | 'region'
  | 'failover'
  | 'geo_location'
  | 'cidr_routing'
  | 'geoproximity'
  | 'alias_target'
  | 'health_check_id';

let counter = 0;
export const newRowKey = () => `row-${Date.now()}-${counter++}`;

export function emptyRow(policy: RoutingPolicy = 'SIMPLE'): RecordRowState {
  return {
    key: newRowKey(),
    subdomain: '',
    type: 'A',
    alias: false,
    value: '',
    ttl: '300',
    routingPolicy: policy,
    setIdentifier: '',
    weight: '',
    region: '',
    failover: '',
    geoLocation: '',
    cidrCollection: '',
    cidrLocation: '',
    geoproximityRegion: '',
    geoproximityBias: '0',
    healthCheckId: '',
    aliasEndpointType: '',
    aliasRegion: '',
    aliasTarget: '',
    evaluateTargetHealth: true,
  };
}

export function recordToRow(r: RecordSet, zoneName: string): RecordRowState {
  const geo = r.geo_location;
  return {
    ...emptyRow(r.routing_policy),
    subdomain: relativeName(r.name, zoneName),
    type: r.type,
    alias: !!r.alias_target,
    value: r.values.join('\n'),
    ttl: r.ttl != null ? String(r.ttl) : '300',
    setIdentifier: r.set_identifier ?? '',
    weight: r.weight != null ? String(r.weight) : '',
    region: r.region ?? '',
    failover: r.failover ?? '',
    geoLocation: geo?.country ?? geo?.continent ?? (geo ? '*' : ''),
    cidrCollection: r.cidr_routing?.collection_id ?? '',
    cidrLocation: r.cidr_routing?.location_name ?? '',
    geoproximityRegion: r.geoproximity?.aws_region ?? '',
    geoproximityBias: r.geoproximity?.bias != null ? String(r.geoproximity.bias) : '0',
    healthCheckId: r.health_check_id ?? '',
    aliasEndpointType: r.alias_target?.endpoint_type ?? (r.alias_target ? 'record' : ''),
    aliasRegion: r.alias_target?.region ?? '',
    aliasTarget: r.alias_target ? r.alias_target.dns_name.replace(/\.$/, '') : '',
    evaluateTargetHealth: r.alias_target?.evaluate_target_health ?? true,
  };
}

export function rowFullName(row: RecordRowState, zoneName: string): string {
  const zone = zoneName.replace(/\.$/, '');
  const sub = row.subdomain.trim().replace(/\.$/, '');
  return sub ? `${sub}.${zone}` : zone;
}

const isContinent = (code: string) => ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'].includes(code);

export function rowToInput(row: RecordRowState, zoneName: string): RecordSetInput {
  const policy = row.routingPolicy;
  const endpoint = aliasEndpoint(row.aliasEndpointType);
  const input: RecordSetInput = {
    name: rowFullName(row, zoneName),
    type: row.type,
    values: [],
    routing_policy: policy,
    set_identifier: policy === 'SIMPLE' ? null : row.setIdentifier.trim() || null,
    health_check_id: row.healthCheckId || null,
  };
  if (row.alias) {
    input.alias_target = {
      dns_name: row.aliasTarget.trim(),
      hosted_zone_id: endpoint?.hostedZoneId ?? '',
      evaluate_target_health: row.evaluateTargetHealth,
      endpoint_type: row.aliasEndpointType || null,
      region: endpoint?.needsRegion ? row.aliasRegion || null : null,
    };
  } else {
    input.ttl = /^\d+$/.test(row.ttl.trim()) ? Number(row.ttl) : null;
    input.values = row.value
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean);
  }
  switch (policy) {
    case 'WEIGHTED':
      input.weight = row.weight.trim() === '' ? null : Number(row.weight);
      break;
    case 'LATENCY':
      input.region = row.region || null;
      break;
    case 'FAILOVER':
      input.failover = row.failover || null;
      break;
    case 'GEOLOCATION':
      input.geo_location = row.geoLocation
        ? row.geoLocation === '*'
          ? { country: '*' }
          : isContinent(row.geoLocation)
            ? { continent: row.geoLocation }
            : { country: row.geoLocation }
        : null;
      break;
    case 'MULTIVALUE':
      input.multivalue = true;
      break;
    case 'IP_BASED':
      input.cidr_routing =
        row.cidrCollection && row.cidrLocation
          ? { collection_id: row.cidrCollection, location_name: row.cidrLocation }
          : null;
      break;
    case 'GEOPROXIMITY':
      input.geoproximity = row.geoproximityRegion
        ? { aws_region: row.geoproximityRegion, bias: Number(row.geoproximityBias) || 0 }
        : null;
      break;
  }
  return input;
}

/** Client-side validation for one row; same rules as the API. */
export function validateRow(row: RecordRowState, zoneName: string): RowErrors {
  const errors: RowErrors = {};
  const nameError = validateRecordName(row.subdomain, zoneName);
  if (nameError) errors.name = nameError;
  const isApex = !row.subdomain.trim();
  if (row.type === 'CNAME' && isApex)
    errors.name = `RRSet of type CNAME with DNS name ${zoneName.replace(/\.?$/, '.')} is not permitted at apex in zone ${zoneName.replace(/\.?$/, '.')}`;

  if (row.alias) {
    if (!typeInfo(row.type).aliasable) errors.alias_target = `Alias records aren't supported for ${row.type} records.`;
    else if (row.routingPolicy === 'MULTIVALUE') errors.alias_target = "Multivalue answer records can't be alias records.";
    else if (!row.aliasEndpointType) errors.alias_target = 'Choose an endpoint.';
    else if (aliasEndpoint(row.aliasEndpointType)?.needsRegion && !row.aliasRegion) errors.alias_target = 'Choose a Region.';
    else if (!row.aliasTarget.trim() || !isDomainValue(row.aliasTarget.trim()))
      errors.alias_target = 'Enter a valid endpoint to route traffic to.';
  } else {
    const valueError = validateValues(row.type, row.value);
    if (valueError) errors.values = valueError;
    const ttlError = validateTtl(row.ttl);
    if (ttlError) errors.ttl = ttlError;
  }

  if (row.routingPolicy !== 'SIMPLE') {
    if (!row.setIdentifier.trim())
      errors.set_identifier = 'Enter a record ID. It must be unique among records with the same name and type.';
    else if (row.setIdentifier.trim().length > 128) errors.set_identifier = 'The record ID can have up to 128 characters.';
  }
  switch (row.routingPolicy) {
    case 'WEIGHTED': {
      const w = row.weight.trim();
      if (!/^\d+$/.test(w) || Number(w) > 255) errors.weight = 'Enter a weight between 0 and 255.';
      break;
    }
    case 'LATENCY':
      if (!row.region) errors.region = 'Choose a Region.';
      break;
    case 'FAILOVER':
      if (!row.failover) errors.failover = 'Choose a failover record type: Primary or Secondary.';
      break;
    case 'GEOLOCATION':
      if (!row.geoLocation) errors.geo_location = 'Choose a location.';
      break;
    case 'IP_BASED':
      if (!row.cidrCollection || !row.cidrLocation) errors.cidr_routing = 'Choose a CIDR collection and location.';
      break;
    case 'GEOPROXIMITY': {
      if (!row.geoproximityRegion) errors.geoproximity = 'Choose an AWS Region, Local Zone group or coordinates.';
      const bias = Number(row.geoproximityBias);
      if (!Number.isInteger(bias) || bias < -99 || bias > 99) errors.geoproximity = 'Bias must be between -99 and 99.';
      break;
    }
  }
  return errors;
}

/** Map an API error field like "changes[2].values[1]" onto (row index, form field). */
export function mapServerField(field: string | null): { row: number; field: RowField } | null {
  if (!field) return null;
  const m = /^changes\[(\d+)\]\.([a-z_]+)/.exec(field);
  if (!m) return null;
  const known: RowField[] = [
    'name', 'type', 'values', 'ttl', 'routing_policy', 'set_identifier', 'weight', 'region', 'failover',
    'geo_location', 'cidr_routing', 'geoproximity', 'alias_target', 'health_check_id',
  ];
  const f = known.includes(m[2] as RowField) ? (m[2] as RowField) : 'name';
  return { row: Number(m[1]), field: f };
}
