import type { RecordSet, RoutingPolicy } from './types';

/** API names are fully qualified with a trailing dot and '*' escaped as \052; the console shows neither. */
export function displayName(name: string): string {
  const unescaped = name.replace(/\\052/g, '*');
  return unescaped.endsWith('.') ? unescaped.slice(0, -1) : unescaped;
}

/** The part of a record name in front of the zone name, e.g. "www" for www.example.com in example.com. */
export function relativeName(recordName: string, zoneName: string): string {
  const name = displayName(recordName);
  const zone = displayName(zoneName);
  if (name === zone) return '';
  return name.endsWith('.' + zone) ? name.slice(0, -(zone.length + 1)) : name;
}

export const ROUTING_POLICY_LABELS: Record<RoutingPolicy, string> = {
  SIMPLE: 'Simple',
  WEIGHTED: 'Weighted',
  GEOLOCATION: 'Geolocation',
  LATENCY: 'Latency',
  FAILOVER: 'Failover',
  MULTIVALUE: 'Multivalue answer',
  IP_BASED: 'IP-based',
  GEOPROXIMITY: 'Geoproximity',
};

export function routingPolicyLabel(policy: RoutingPolicy): string {
  return ROUTING_POLICY_LABELS[policy] ?? policy;
}

/** The console's "Differentiator" column: what distinguishes records that share a name and type. */
export function differentiator(r: RecordSet): string {
  switch (r.routing_policy) {
    case 'WEIGHTED':
      return r.weight != null ? String(r.weight) : '-';
    case 'LATENCY':
      return r.region ?? '-';
    case 'FAILOVER':
      return r.failover ? r.failover.charAt(0) + r.failover.slice(1).toLowerCase() : '-';
    case 'GEOLOCATION': {
      const g = r.geo_location;
      return [g?.continent, g?.country, g?.subdivision].filter(Boolean).join(' / ') || '-';
    }
    case 'IP_BASED':
      return r.cidr_routing ? `${r.cidr_routing.collection_id} / ${r.cidr_routing.location_name}` : '-';
    case 'GEOPROXIMITY': {
      const g = r.geoproximity;
      const where = g?.aws_region ?? g?.local_zone_group ?? (g?.coordinates ? `${g.coordinates.latitude}, ${g.coordinates.longitude}` : '');
      return where ? `${where}${g?.bias ? ` (bias ${g.bias})` : ''}` : '-';
    }
    default:
      return '-';
  }
}

export function recordValueLines(r: RecordSet): string[] {
  if (r.alias_target) return [displayName(r.alias_target.dns_name)];
  return r.values;
}

export function formatDate(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

export function formatAccountId(accountId: string): string {
  return accountId.replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3');
}

export function dash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}
