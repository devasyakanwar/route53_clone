'use client';

import type { RecordSet } from '@/lib/types';
import { dash, differentiator, displayName, recordValueLines, routingPolicyLabel } from '@/lib/format';
import type { RecordSetInput } from '@/lib/types';

/** A record flattened for tables, filtering and sorting. */
export interface RecordItem extends RecordSet {
  displayName: string;
  policyLabel: string;
  differentiatorText: string;
  aliasLabel: 'Yes' | 'No';
  valueText: string;
  ttlText: string;
  evaluateTargetHealthText: string;
  healthCheckText: string;
  recordIdText: string;
}

export function toRecordItem(r: RecordSet): RecordItem {
  return {
    ...r,
    displayName: displayName(r.name),
    policyLabel: routingPolicyLabel(r.routing_policy),
    differentiatorText: differentiator(r),
    aliasLabel: r.alias_target ? 'Yes' : 'No',
    valueText: recordValueLines(r).join('\n'),
    ttlText: dash(r.ttl),
    evaluateTargetHealthText: r.alias_target ? (r.alias_target.evaluate_target_health ? 'Yes' : 'No') : '-',
    healthCheckText: dash(r.health_check_id),
    recordIdText: dash(r.set_identifier),
  };
}

/** The input shape needed to reference an existing record in a DELETE change. */
export function recordToInput(r: RecordSet): RecordSetInput {
  return {
    name: r.name,
    type: r.type,
    ttl: r.ttl,
    values: r.values,
    routing_policy: r.routing_policy,
    set_identifier: r.set_identifier,
    weight: r.weight,
    region: r.region,
    failover: r.failover,
    geo_location: r.geo_location,
    multivalue: r.multivalue,
    cidr_routing: r.cidr_routing,
    geoproximity: r.geoproximity,
    health_check_id: r.health_check_id,
    alias_target: r.alias_target,
  };
}

export function ValueList({ lines }: { lines: string[] }) {
  if (!lines.length) return <>-</>;
  return (
    <ul className="r53-values">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}
