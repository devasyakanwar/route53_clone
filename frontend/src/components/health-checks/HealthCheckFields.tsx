'use client';

import Box from '@cloudscape-design/components/box';
import Checkbox from '@cloudscape-design/components/checkbox';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Multiselect from '@cloudscape-design/components/multiselect';
import RadioGroup from '@cloudscape-design/components/radio-group';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import Tiles from '@cloudscape-design/components/tiles';
import { InfoLink } from '@/components/common/InfoLink';
import { regionOptions } from '@/components/records/recordTypes';
import type { HealthCheck } from '@/lib/types';
import { type HcErrors, type HcField, type HcFormState, urlPreview } from './formState';
import { HEALTH_CHECKER_REGIONS, MOCK_CLOUDWATCH_ALARMS, MOCK_SNS_TOPICS } from './shared';

interface Props {
  state: HcFormState;
  errors: HcErrors;
  onChange: (patch: Partial<HcFormState>) => void;
  /** Edit mode: what is monitored, protocol, request interval and latency graphs can't change. */
  isEdit?: boolean;
  /** Other health checks, for calculated checks. */
  others?: HealthCheck[];
}

const optional = (label: string) => (
  <span>
    {label} <i>- optional</i>
  </span>
);

function Field({ field, errors, children }: { field: HcField; errors: HcErrors; children: React.ReactNode }) {
  return <div data-has-error={!!errors[field]}>{children}</div>;
}

export function ConfigureHealthCheckFields({ state: s, errors, onChange, isEdit, others = [] }: Props) {
  const defaultPort = (p: string) => (p === 'HTTPS' ? '443' : '80');
  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2" info={<InfoLink topic="createHealthCheck" />}>Configure health check</Header>}>
        <SpaceBetween size="l">
          <Field field="name" errors={errors}>
            <FormField label="Name" description="Enter a name to help you identify the health check." errorText={errors.name} constraintText="Up to 256 characters.">
              <Input value={s.name} onChange={e => onChange({ name: e.detail.value })} placeholder="my-health-check" ariaLabel="Name" />
            </FormField>
          </Field>
          <FormField label="What to monitor" info={<InfoLink topic="whatToMonitor" />} errorText={errors.type}>
            <Tiles
              value={s.monitor}
              onChange={e => onChange({ monitor: e.detail.value as HcFormState['monitor'] })}
              columns={3}
              items={[
                { value: 'endpoint', label: 'Endpoint', description: 'Monitor an endpoint by IP address or domain name.', disabled: isEdit },
                {
                  value: 'calculated',
                  label: 'Status of other health checks (calculated health check)',
                  description: 'Monitor the status of other health checks.',
                  disabled: isEdit,
                },
                { value: 'cloudwatch', label: 'State of CloudWatch alarm', description: 'Monitor the data stream of a CloudWatch alarm.', disabled: isEdit },
              ]}
            />
          </FormField>
        </SpaceBetween>
      </Container>

      {s.monitor === 'endpoint' && (
        <Container
          header={
            <Header variant="h2" description="Route 53 health checkers send requests to the endpoint to determine whether it's healthy.">
              Monitor an endpoint
            </Header>
          }
        >
          <SpaceBetween size="l">
            <FormField label="Specify endpoint by">
              <RadioGroup
                value={s.specifyBy}
                onChange={e => onChange({ specifyBy: e.detail.value as 'ip' | 'domain' })}
                items={[
                  { value: 'ip', label: 'IP address' },
                  { value: 'domain', label: 'Domain name' },
                ]}
              />
            </FormField>
            <FormField
              label="Protocol"
              description={isEdit ? "You can't change the protocol of an existing health check." : 'The method that Route 53 uses to check the health of the endpoint.'}
            >
              <Select
                selectedOption={{ value: s.protocol, label: s.protocol }}
                onChange={e => {
                  const p = e.detail.selectedOption.value as HcFormState['protocol'];
                  onChange({ protocol: p, port: s.port === defaultPort(s.protocol) ? defaultPort(p) : s.port, stringMatching: p === 'TCP' ? false : s.stringMatching });
                }}
                options={['HTTP', 'HTTPS', 'TCP'].map(p => ({ value: p, label: p }))}
                disabled={isEdit}
                ariaLabel="Protocol"
              />
            </FormField>
            <ColumnLayout columns={2}>
              {s.specifyBy === 'ip' ? (
                <>
                  <Field field="ip_address" errors={errors}>
                    <FormField label="IP address" description="The IPv4 or IPv6 address of the endpoint." errorText={errors.ip_address}>
                      <Input value={s.ipAddress} onChange={e => onChange({ ipAddress: e.detail.value })} placeholder="192.0.2.44" ariaLabel="IP address" />
                    </FormField>
                  </Field>
                  {s.protocol !== 'TCP' && (
                    <Field field="fqdn" errors={errors}>
                      <FormField label={optional('Host name')} description="The value that Route 53 passes in the Host header." errorText={errors.fqdn}>
                        <Input value={s.hostName} onChange={e => onChange({ hostName: e.detail.value })} placeholder="www.example.com" ariaLabel="Host name" />
                      </FormField>
                    </Field>
                  )}
                </>
              ) : (
                <Field field="fqdn" errors={errors}>
                  <FormField label="Domain name" description="The domain name of the endpoint." errorText={errors.fqdn}>
                    <Input value={s.domainName} onChange={e => onChange({ domainName: e.detail.value })} placeholder="www.example.com" ariaLabel="Domain name" />
                  </FormField>
                </Field>
              )}
            </ColumnLayout>
            <ColumnLayout columns={2}>
              <Field field="port" errors={errors}>
                <FormField label="Port" errorText={errors.port}>
                  <Input type="number" value={s.port} onChange={e => onChange({ port: e.detail.value })} ariaLabel="Port" />
                </FormField>
              </Field>
              {s.protocol !== 'TCP' && (
                <Field field="resource_path" errors={errors}>
                  <FormField label={optional('Path')} description="The path that you want Route 53 to request." errorText={errors.resource_path}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Box variant="span" color="text-body-secondary">
                        /
                      </Box>
                      <div style={{ flex: 1 }}>
                        <Input value={s.path} onChange={e => onChange({ path: e.detail.value })} placeholder="images" ariaLabel="Path" />
                      </div>
                    </div>
                  </FormField>
                </Field>
              )}
            </ColumnLayout>
            <FormField label="URL">
              <Box variant="code">{urlPreview(s)}</Box>
            </FormField>

            <ExpandableSection headerText="Advanced configuration" headerInfo={<InfoLink topic="healthCheckAdvanced" />} variant="footer">
              <SpaceBetween size="l">
                <FormField label="Request interval" description={isEdit ? "You can't change the request interval after you create a health check." : 'The number of seconds between the time that each health checker gets a response and sends the next request.'}>
                  <RadioGroup
                    value={s.requestInterval}
                    onChange={e => onChange({ requestInterval: e.detail.value as '10' | '30' })}
                    items={[
                      { value: '30', label: 'Standard (30 seconds)', disabled: isEdit },
                      { value: '10', label: 'Fast (10 seconds)', disabled: isEdit },
                    ]}
                  />
                </FormField>
                <Field field="failure_threshold" errors={errors}>
                  <FormField label="Failure threshold" description="The number of consecutive health checks that an endpoint must pass or fail to change its status (1-10)." errorText={errors.failure_threshold}>
                    <Input type="number" value={s.failureThreshold} onChange={e => onChange({ failureThreshold: e.detail.value })} ariaLabel="Failure threshold" />
                  </FormField>
                </Field>
                {s.protocol !== 'TCP' && (
                  <Field field="search_string" errors={errors}>
                    <FormField label="String matching" description="Route 53 searches the response body for the string that you specify." errorText={errors.search_string}>
                      <SpaceBetween size="xs">
                        <RadioGroup
                          value={s.stringMatching ? 'yes' : 'no'}
                          onChange={e => onChange({ stringMatching: e.detail.value === 'yes' })}
                          items={[
                            { value: 'no', label: 'No', disabled: isEdit },
                            { value: 'yes', label: 'Yes', disabled: isEdit },
                          ]}
                        />
                        {s.stringMatching && (
                          <Input value={s.searchString} onChange={e => onChange({ searchString: e.detail.value })} placeholder="Search string" ariaLabel="Search string" />
                        )}
                      </SpaceBetween>
                    </FormField>
                  </Field>
                )}
                <Checkbox
                  checked={s.latency}
                  disabled={isEdit}
                  onChange={e => onChange({ latency: e.detail.checked })}
                  description="Show the time between when Route 53 sends a request and receives the first byte of the response."
                >
                  Latency graphs
                </Checkbox>
                <Checkbox checked={s.invert} onChange={e => onChange({ invert: e.detail.checked })} description="Route 53 considers healthy endpoints to be unhealthy and vice versa.">
                  Invert health check status
                </Checkbox>
                <Checkbox checked={s.disabled} onChange={e => onChange({ disabled: e.detail.checked })} description="Route 53 stops checking the endpoint and always considers it healthy.">
                  Disable health check
                </Checkbox>
                <Field field="regions" errors={errors}>
                  <FormField label="Health checker regions" errorText={errors.regions}>
                    <SpaceBetween size="xs">
                      <RadioGroup
                        value={s.regionsMode}
                        onChange={e => onChange({ regionsMode: e.detail.value as 'recommended' | 'custom' })}
                        items={[
                          { value: 'recommended', label: 'Use recommended', description: 'Health checkers in all Regions check the endpoint.' },
                          { value: 'custom', label: 'Customize', description: 'Choose at least three Regions.' },
                        ]}
                      />
                      {s.regionsMode === 'custom' && (
                        <Multiselect
                          selectedOptions={HEALTH_CHECKER_REGIONS.filter(r => s.regions.includes(r.value)).map(r => ({ ...r, description: r.value }))}
                          onChange={e => onChange({ regions: e.detail.selectedOptions.map(o => o.value ?? '') })}
                          options={HEALTH_CHECKER_REGIONS.map(r => ({ ...r, description: r.value }))}
                          placeholder="Choose Regions"
                          ariaLabel="Health checker regions"
                        />
                      )}
                    </SpaceBetween>
                  </FormField>
                </Field>
              </SpaceBetween>
            </ExpandableSection>
          </SpaceBetween>
        </Container>
      )}

      {s.monitor === 'calculated' && (
        <Container header={<Header variant="h2" description="The health check is healthy when the minimum number of the selected health checks are healthy.">Status of other health checks</Header>}>
          <SpaceBetween size="l">
            <Field field="child_health_checks" errors={errors}>
              <FormField label="Health checks to monitor" errorText={errors.child_health_checks}>
                <Multiselect
                  selectedOptions={others.filter(o => s.children.includes(o.id)).map(o => ({ value: o.id, label: o.name, description: o.description }))}
                  onChange={e => onChange({ children: e.detail.selectedOptions.map(o => o.value ?? '') })}
                  options={others.map(o => ({ value: o.id, label: o.name, description: o.description }))}
                  placeholder="Choose health checks"
                  filteringType="auto"
                  empty="No other health checks"
                  ariaLabel="Health checks to monitor"
                />
              </FormField>
            </Field>
            <Field field="health_threshold" errors={errors}>
              <FormField label="Report healthy when" errorText={errors.health_threshold}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>at least</span>
                  <div style={{ width: 90 }}>
                    <Input type="number" value={s.threshold} onChange={e => onChange({ threshold: e.detail.value })} ariaLabel="Health threshold" />
                  </div>
                  <span>of {s.children.length} selected health checks are healthy</span>
                </div>
              </FormField>
            </Field>
            <Checkbox checked={s.invert} onChange={e => onChange({ invert: e.detail.checked })}>
              Invert health check status
            </Checkbox>
            <Checkbox checked={s.disabled} onChange={e => onChange({ disabled: e.detail.checked })}>
              Disable health check
            </Checkbox>
          </SpaceBetween>
        </Container>
      )}

      {s.monitor === 'cloudwatch' && (
        <Container header={<Header variant="h2" description="The health check status follows the state of the alarm.">State of CloudWatch alarm</Header>}>
          <Field field="cloudwatch_alarm" errors={errors}>
            <SpaceBetween size="l">
              <ColumnLayout columns={2}>
                <FormField label="Region">
                  <Select
                    selectedOption={regionOptions.find(o => o.value === s.cwRegion) ?? null}
                    onChange={e => onChange({ cwRegion: e.detail.selectedOption.value ?? '', cwAlarm: '' })}
                    options={regionOptions}
                    filteringType="auto"
                  />
                </FormField>
                <FormField label="CloudWatch alarm" errorText={errors.cloudwatch_alarm}>
                  <Select
                    selectedOption={s.cwAlarm ? { value: s.cwAlarm, label: s.cwAlarm } : null}
                    onChange={e => onChange({ cwAlarm: e.detail.selectedOption.value ?? '' })}
                    options={MOCK_CLOUDWATCH_ALARMS.map(a => ({ value: a, label: a }))}
                    placeholder="Choose alarm"
                  />
                </FormField>
              </ColumnLayout>
              <FormField label="Health check status" description="The status of the health check when CloudWatch has insufficient data to determine the state of the alarm.">
                <RadioGroup
                  value={s.insufficient}
                  onChange={e => onChange({ insufficient: e.detail.value as HcFormState['insufficient'] })}
                  items={[
                    { value: 'Healthy', label: 'Healthy' },
                    { value: 'Unhealthy', label: 'Unhealthy' },
                    { value: 'LastKnownStatus', label: 'Last known status' },
                  ]}
                />
              </FormField>
              <Checkbox checked={s.invert} onChange={e => onChange({ invert: e.detail.checked })}>
                Invert health check status
              </Checkbox>
            </SpaceBetween>
          </Field>
        </Container>
      )}
    </SpaceBetween>
  );
}

export function NotificationFields({ state: s, errors, onChange }: Props) {
  return (
    <Container
      header={
        <Header variant="h2" info={<InfoLink topic="healthCheckNotification" />} description="Route 53 can create a CloudWatch alarm that notifies you through Amazon SNS when the health check fails.">
          Get notified when health check fails
        </Header>
      }
    >
      <SpaceBetween size="l">
        <FormField label="Create alarm">
          <RadioGroup
            value={s.createAlarm ? 'yes' : 'no'}
            onChange={e => onChange({ createAlarm: e.detail.value === 'yes' })}
            items={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
          />
        </FormField>
        {s.createAlarm && (
          <>
            <FormField label="Send notification to">
              <RadioGroup
                value={s.topicMode}
                onChange={e => onChange({ topicMode: e.detail.value as 'existing' | 'new' })}
                items={[
                  { value: 'existing', label: 'Existing SNS topic' },
                  { value: 'new', label: 'New SNS topic' },
                ]}
              />
            </FormField>
            <Field field="sns_topic" errors={errors}>
              {s.topicMode === 'existing' ? (
                <FormField label="SNS topic" errorText={errors.sns_topic}>
                  <Select
                    selectedOption={s.existingTopic ? { value: s.existingTopic, label: s.existingTopic } : null}
                    onChange={e => onChange({ existingTopic: e.detail.selectedOption.value ?? '' })}
                    options={[...new Set([...MOCK_SNS_TOPICS, s.existingTopic].filter(Boolean))].map(t => ({ value: t, label: t }))}
                    placeholder="Choose topic"
                  />
                </FormField>
              ) : (
                <FormField label="Topic name" errorText={errors.sns_topic}>
                  <Input value={s.newTopic} onChange={e => onChange({ newTopic: e.detail.value })} placeholder="my-health-check-alerts" />
                </FormField>
              )}
            </Field>
            <Field field="emails" errors={errors}>
              <FormField
                label={s.topicMode === 'new' ? 'Recipient email addresses' : optional('Recipient email addresses')}
                description="Separate multiple addresses with commas."
                errorText={errors.emails}
              >
                <Textarea value={s.emails} onChange={e => onChange({ emails: e.detail.value })} placeholder="ops@example.com, oncall@example.com" rows={2} />
              </FormField>
            </Field>
          </>
        )}
      </SpaceBetween>
    </Container>
  );
}
