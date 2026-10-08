'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Tiles from '@cloudscape-design/components/tiles';
import Wizard from '@cloudscape-design/components/wizard';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InfoLink } from '@/components/common/InfoLink';
import { ROUTING_POLICY_LABELS, displayName } from '@/lib/format';
import type { HostedZoneDetail, RoutingPolicy } from '@/lib/types';
import { RecordFields } from './RecordFields';
import { emptyRow, rowFullName, validateRow, type RecordRowState } from './recordRow';
import { ROUTING_POLICY_DESCRIPTIONS } from './recordTypes';
import { useRecordSubmit } from './useRecordSubmit';

const POLICIES = Object.keys(ROUTING_POLICY_LABELS) as RoutingPolicy[];

/** "Switch to wizard": Choose routing policy → Configure records → Review and create. */
export function RecordWizard({ zone }: { zone: HostedZoneDetail }) {
  const router = useRouter();
  const zoneHref = `/route53/v2/hostedzones/${zone.id}`;
  const [step, setStep] = useState(0);
  const [policy, setPolicy] = useState<RoutingPolicy>('SIMPLE');
  const [rows, setRows] = useState<RecordRowState[]>([emptyRow('SIMPLE')]);
  const { errors, setErrors, formError, busy, submit } = useRecordSubmit(zone);

  const choosePolicy = (p: RoutingPolicy) => {
    setPolicy(p);
    setRows(rows.map(r => ({ ...r, routingPolicy: p, alias: p === 'MULTIVALUE' ? false : r.alias })));
  };

  const validateStep2 = () => {
    const next: typeof errors = {};
    rows.forEach((r, i) => {
      const e = validateRow(r, zone.name);
      if (Object.keys(e).length) next[i] = e;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  return (
    <Wizard
      activeStepIndex={step}
      isLoadingNextStep={busy}
      onNavigate={e => {
        if (e.detail.requestedStepIndex === 2 && step === 1 && !validateStep2()) return;
        setStep(e.detail.requestedStepIndex);
      }}
      onCancel={() => router.push(zoneHref)}
      onSubmit={() => void submit(rows)}
      submitButtonText="Create records"
      i18nStrings={{
        stepNumberLabel: n => `Step ${n}`,
        collapsedStepsLabel: (n, total) => `Step ${n} of ${total}`,
        navigationAriaLabel: 'Steps',
        cancelButton: 'Cancel',
        previousButton: 'Previous',
        nextButton: 'Next',
        optional: 'optional',
      }}
      secondaryActions={
        <Link
          href={`${zoneHref}/records/create`}
          onFollow={e => {
            e.preventDefault();
            router.push(`${zoneHref}/records/create`);
          }}
        >
          Switch to quick create
        </Link>
      }
      steps={[
        {
          title: 'Choose routing policy',
          info: <InfoLink topic="routingPolicy" />,
          description: 'The routing policy determines how Route 53 responds to queries.',
          content: (
            <Container header={<Header variant="h2">Routing policy</Header>}>
              <Tiles
                value={policy}
                onChange={e => choosePolicy(e.detail.value as RoutingPolicy)}
                columns={2}
                items={POLICIES.map(p => ({
                  value: p,
                  label: p === 'SIMPLE' ? 'Simple routing' : ROUTING_POLICY_LABELS[p],
                  description: ROUTING_POLICY_DESCRIPTIONS[p],
                }))}
              />
            </Container>
          ),
        },
        {
          title: 'Configure records',
          info: <InfoLink topic="createRecord" />,
          description: `Define ${policy === 'SIMPLE' ? 'simple' : ROUTING_POLICY_LABELS[policy].toLowerCase()} records for ${displayName(zone.name)}.`,
          content: (
            <SpaceBetween size="l">
              {rows.map((row, i) => (
                <Container
                  key={row.key}
                  header={
                    <Header
                      variant="h2"
                      actions={
                        rows.length > 1 && (
                          <Button onClick={() => setRows(rows.filter((_, j) => j !== i))}>Delete</Button>
                        )
                      }
                    >
                      Record {i + 1}
                    </Header>
                  }
                >
                  <RecordFields
                    row={row}
                    zoneName={zone.name}
                    errors={errors[i] ?? {}}
                    onChange={patch => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))}
                    policyLocked
                  />
                </Container>
              ))}
              <Button iconName="add-plus" onClick={() => setRows([...rows, emptyRow(policy)])}>
                Define another record
              </Button>
            </SpaceBetween>
          ),
        },
        {
          title: 'Review and create',
          content: (
            <SpaceBetween size="l">
              {!!formError && <Alert type="error">{formError}</Alert>}
              {Object.keys(errors).length > 0 && (
                <Alert type="error" header="Some records have errors">
                  Go back to Configure records to fix them.
                </Alert>
              )}
              <Table
                header={<Header variant="h2" counter={`(${rows.length})`}>Records to create</Header>}
                items={rows}
                trackBy="key"
                wrapLines
                columnDefinitions={[
                  { id: 'name', header: 'Record name', cell: r => rowFullName(r, zone.name) },
                  { id: 'type', header: 'Type', cell: r => r.type },
                  { id: 'policy', header: 'Routing policy', cell: r => ROUTING_POLICY_LABELS[r.routingPolicy] },
                  {
                    id: 'value',
                    header: 'Value/Route traffic to',
                    cell: r => (r.alias ? r.aliasTarget : r.value.split('\n').filter(Boolean).join(', ')),
                  },
                  { id: 'ttl', header: 'TTL (seconds)', cell: r => (r.alias ? '-' : r.ttl) },
                  { id: 'id', header: 'Record ID', cell: r => r.setIdentifier || '-' },
                ]}
              />
            </SpaceBetween>
          ),
        },
      ]}
    />
  );
}
