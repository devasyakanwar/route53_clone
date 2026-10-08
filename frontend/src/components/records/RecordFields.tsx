'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import RadioGroup from '@cloudscape-design/components/radio-group';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import Toggle from '@cloudscape-design/components/toggle';
import { InfoLink } from '@/components/common/InfoLink';
import { useHealthChecks } from '@/hooks/useHealthChecks';
import { displayName } from '@/lib/format';
import type { RecordType, RoutingPolicy } from '@/lib/types';
import type { RecordRowState, RowErrors } from './recordRow';
import {
  ALIAS_ENDPOINTS,
  aliasEndpoint,
  GEO_LOCATIONS,
  MOCK_CIDR_COLLECTIONS,
  recordTypeOptions,
  regionOptions,
  ROUTING_POLICY_OPTIONS,
  typeInfo,
} from './recordTypes';

interface Props {
  row: RecordRowState;
  zoneName: string;
  errors: RowErrors;
  onChange: (patch: Partial<RecordRowState>) => void;
  /** Edit mode: record name and type are read-only. */
  identityLocked?: boolean;
  /** Default NS/SOA records: only values (and NS TTL) can change. */
  defaultRecord?: boolean;
  /** Wizard mode: routing policy is chosen in an earlier step. */
  policyLocked?: boolean;
}

const TTL_PRESETS: [string, string][] = [
  ['1m', '60'],
  ['1h', '3600'],
  ['1d', '86400'],
];

const geoOptions = [
  { label: 'Default', options: GEO_LOCATIONS.filter(g => g.kind === 'default').map(g => ({ value: g.value, label: g.label })) },
  { label: 'Continents', options: GEO_LOCATIONS.filter(g => g.kind === 'continent').map(g => ({ value: g.value, label: g.label })) },
  { label: 'Countries', options: GEO_LOCATIONS.filter(g => g.kind === 'country').map(g => ({ value: g.value, label: g.label })) },
];

export function RecordFields({ row, zoneName, errors, onChange, identityLocked, defaultRecord, policyLocked }: Props) {
  const zone = displayName(zoneName);
  const info = typeInfo(row.type);
  const typeOptions = recordTypeOptions(row.type === 'SOA');
  const endpoint = aliasEndpoint(row.aliasEndpointType);
  const policy = row.routingPolicy;
  const isSoa = row.type === 'SOA';
  const err = (field: keyof RowErrors) => errors[field];
  const { healthChecks } = useHealthChecks();
  const healthCheckOptions = (healthChecks ?? []).map(h => ({ value: h.id, label: h.name, description: `${h.status} · ${h.description}` }));

  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={2}>
        <div data-has-error={!!err('name')}>
          <FormField
            label="Record name"
            info={<InfoLink topic="recordName" />}
            description="Keep blank to create a record for the root domain."
            errorText={err('name')}
            constraintText={identityLocked ? "You can't change the record name. To rename a record, delete it and create a new one." : undefined}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input
                  value={row.subdomain}
                  onChange={e => onChange({ subdomain: e.detail.value })}
                  placeholder="subdomain"
                  disabled={identityLocked}
                  ariaLabel="Record name"
                  spellcheck={false}
                />
              </div>
              <Box variant="span" color="text-body-secondary">
                .{zone}
              </Box>
            </div>
          </FormField>
        </div>
        <div data-has-error={!!err('type')}>
          <FormField label="Record type" info={<InfoLink topic="recordTypes" />} errorText={err('type')}>
            <Select
              selectedOption={typeOptions.find(o => o.value === row.type) ?? { value: row.type, label: row.type }}
              onChange={e => {
                const t = e.detail.selectedOption.value as RecordType;
                onChange({ type: t, alias: row.alias && typeInfo(t).aliasable });
              }}
              options={typeOptions}
              disabled={identityLocked}
              ariaLabel="Record type"
            />
          </FormField>
        </div>
      </ColumnLayout>

      {!defaultRecord && info.aliasable && (
        <FormField info={<InfoLink topic="alias" />} label="Alias">
          <Toggle
            checked={row.alias}
            onChange={e => onChange({ alias: e.detail.checked })}
            disabled={policy === 'MULTIVALUE'}
            description={policy === 'MULTIVALUE' ? "Multivalue answer records can't be alias records." : undefined}
          >
            Alias
          </Toggle>
        </FormField>
      )}

      {row.alias ? (
        <div data-has-error={!!err('alias_target')}>
          <FormField
            label="Route traffic to"
            description="Choose the endpoint that you want to route traffic to."
            errorText={err('alias_target')}
            stretch
          >
            <SpaceBetween size="s">
              <ColumnLayout columns={endpoint?.needsRegion ? 2 : 1}>
                <Select
                  selectedOption={endpoint ? { value: endpoint.value, label: endpoint.label } : null}
                  onChange={e => onChange({ aliasEndpointType: e.detail.selectedOption.value ?? '', aliasRegion: '' })}
                  options={ALIAS_ENDPOINTS.map(a => ({ value: a.value, label: a.label }))}
                  placeholder="Choose endpoint"
                  ariaLabel="Alias endpoint type"
                />
                {endpoint?.needsRegion && (
                  <Select
                    selectedOption={regionOptions.find(o => o.value === row.aliasRegion) ?? null}
                    onChange={e => onChange({ aliasRegion: e.detail.selectedOption.value ?? '' })}
                    options={regionOptions}
                    placeholder="Choose Region"
                    filteringType="auto"
                    ariaLabel="Alias Region"
                  />
                )}
              </ColumnLayout>
              <Input
                value={row.aliasTarget}
                onChange={e => onChange({ aliasTarget: e.detail.value })}
                placeholder={endpoint?.placeholder.replace('example.com', zone) ?? 'Choose an endpoint first'}
                disabled={!endpoint}
                ariaLabel="Alias target"
                spellcheck={false}
              />
            </SpaceBetween>
          </FormField>
        </div>
      ) : (
        <div data-has-error={!!err('values')}>
          <FormField
            label="Value"
            info={<InfoLink topic="value" />}
            description="Enter multiple values on separate lines."
            errorText={err('values')}
            stretch
          >
            <Textarea
              value={row.value}
              onChange={e => onChange({ value: e.detail.value })}
              placeholder={info.placeholder}
              rows={Math.min(Math.max(row.value.split('\n').length, 3), 10)}
              spellcheck={false}
              ariaLabel="Value"
            />
          </FormField>
        </div>
      )}

      <ColumnLayout columns={2}>
        {row.alias ? (
          <FormField label="Evaluate target health" description="Route 53 checks the health of the alias target.">
            <Toggle checked={row.evaluateTargetHealth} onChange={e => onChange({ evaluateTargetHealth: e.detail.checked })}>
              {row.evaluateTargetHealth ? 'Yes' : 'No'}
            </Toggle>
          </FormField>
        ) : (
          <div data-has-error={!!err('ttl')}>
            <FormField
              label="TTL (seconds)"
              info={<InfoLink topic="ttl" />}
              description="Recommended values: 60 to 172800 (two days)"
              errorText={err('ttl')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 80 }}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={row.ttl}
                    onChange={e => onChange({ ttl: e.detail.value })}
                    disabled={isSoa}
                    ariaLabel="TTL (seconds)"
                  />
                </div>
                {TTL_PRESETS.map(([label, seconds]) => (
                  <Button
                    key={label}
                    formAction="none"
                    disabled={isSoa}
                    onClick={() => onChange({ ttl: seconds })}
                    ariaLabel={`Set TTL to ${label}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </FormField>
          </div>
        )}
        <div data-has-error={!!err('routing_policy')}>
          <FormField label="Routing policy" info={<InfoLink topic="routingPolicy" />} errorText={err('routing_policy')}>
            <Select
              selectedOption={ROUTING_POLICY_OPTIONS.find(o => o.value === policy) ?? null}
              onChange={e => {
                const next = e.detail.selectedOption.value as RoutingPolicy;
                onChange({ routingPolicy: next, alias: next === 'MULTIVALUE' ? false : row.alias });
              }}
              options={ROUTING_POLICY_OPTIONS}
              disabled={policyLocked || defaultRecord || isSoa}
              ariaLabel="Routing policy"
            />
          </FormField>
        </div>
      </ColumnLayout>

      {policy !== 'SIMPLE' && (
        <ColumnLayout columns={2}>
          {policy === 'WEIGHTED' && (
            <div data-has-error={!!err('weight')}>
              <FormField label="Weight" description="Enter a value between 0 and 255." errorText={err('weight')}>
                <Input type="number" value={row.weight} onChange={e => onChange({ weight: e.detail.value })} placeholder="0-255" ariaLabel="Weight" />
              </FormField>
            </div>
          )}
          {policy === 'LATENCY' && (
            <div data-has-error={!!err('region')}>
              <FormField label="Region" description="The AWS Region where the resource is." errorText={err('region')}>
                <Select
                  selectedOption={regionOptions.find(o => o.value === row.region) ?? null}
                  onChange={e => onChange({ region: e.detail.selectedOption.value ?? '' })}
                  options={regionOptions}
                  placeholder="Choose Region"
                  filteringType="auto"
                />
              </FormField>
            </div>
          )}
          {policy === 'FAILOVER' && (
            <div data-has-error={!!err('failover')}>
              <FormField label="Failover record type" errorText={err('failover')}>
                <RadioGroup
                  value={row.failover || null}
                  onChange={e => onChange({ failover: e.detail.value as 'PRIMARY' | 'SECONDARY' })}
                  items={[
                    { value: 'PRIMARY', label: 'Primary' },
                    { value: 'SECONDARY', label: 'Secondary' },
                  ]}
                />
              </FormField>
            </div>
          )}
          {policy === 'GEOLOCATION' && (
            <div data-has-error={!!err('geo_location')}>
              <FormField label="Location" description="The location that DNS queries originate from." errorText={err('geo_location')}>
                <Select
                  selectedOption={geoOptions.flatMap(g => g.options).find(o => o.value === row.geoLocation) ?? null}
                  onChange={e => onChange({ geoLocation: e.detail.selectedOption.value ?? '' })}
                  options={geoOptions}
                  placeholder="Choose location"
                  filteringType="auto"
                />
              </FormField>
            </div>
          )}
          {policy === 'IP_BASED' && (
            <div data-has-error={!!err('cidr_routing')}>
              <FormField label="CIDR collection and location" errorText={err('cidr_routing')}>
                <SpaceBetween size="xs">
                  <Select
                    selectedOption={MOCK_CIDR_COLLECTIONS.map(c => ({ value: c.value, label: c.label })).find(o => o.value === row.cidrCollection) ?? null}
                    onChange={e => onChange({ cidrCollection: e.detail.selectedOption.value ?? '', cidrLocation: '' })}
                    options={MOCK_CIDR_COLLECTIONS.map(c => ({ value: c.value, label: c.label }))}
                    placeholder="Choose CIDR collection"
                  />
                  <Select
                    selectedOption={row.cidrLocation ? { value: row.cidrLocation, label: row.cidrLocation } : null}
                    onChange={e => onChange({ cidrLocation: e.detail.selectedOption.value ?? '' })}
                    options={(MOCK_CIDR_COLLECTIONS.find(c => c.value === row.cidrCollection)?.locations ?? []).map(l => ({ value: l, label: l }))}
                    placeholder="Choose location"
                    empty="Choose a CIDR collection first"
                  />
                </SpaceBetween>
              </FormField>
            </div>
          )}
          {policy === 'GEOPROXIMITY' && (
            <div data-has-error={!!err('geoproximity')}>
              <FormField label="Endpoint location and bias" errorText={err('geoproximity')}>
                <ColumnLayout columns={2}>
                  <Select
                    selectedOption={regionOptions.find(o => o.value === row.geoproximityRegion) ?? null}
                    onChange={e => onChange({ geoproximityRegion: e.detail.selectedOption.value ?? '' })}
                    options={regionOptions}
                    placeholder="AWS Region"
                    filteringType="auto"
                  />
                  <Input type="number" value={row.geoproximityBias} onChange={e => onChange({ geoproximityBias: e.detail.value })} placeholder="Bias (-99 to 99)" ariaLabel="Bias" />
                </ColumnLayout>
              </FormField>
            </div>
          )}
          <FormField
            label={
              <span>
                Health check <i>- optional</i>
              </span>
            }
          >
            <Select
              selectedOption={
                row.healthCheckId
                  ? healthCheckOptions.find(h => h.value === row.healthCheckId) ?? { value: row.healthCheckId, label: row.healthCheckId }
                  : { value: '', label: 'No health check' }
              }
              onChange={e => onChange({ healthCheckId: e.detail.selectedOption.value ?? '' })}
              options={[{ value: '', label: 'No health check' }, ...healthCheckOptions]}
              statusType={healthChecks ? 'finished' : 'loading'}
              loadingText="Loading health checks"
            />
          </FormField>
          <div data-has-error={!!err('set_identifier')}>
            <FormField
              label="Record ID"
              description="Enter a value that uniquely identifies this record among records with the same name and type."
              errorText={err('set_identifier')}
              constraintText="Up to 128 characters."
            >
              <Input value={row.setIdentifier} onChange={e => onChange({ setIdentifier: e.detail.value })} placeholder="my-record-id" ariaLabel="Record ID" />
            </FormField>
          </div>
        </ColumnLayout>
      )}
    </SpaceBetween>
  );
}
