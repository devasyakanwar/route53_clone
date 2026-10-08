'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SplitPanel from '@cloudscape-design/components/split-panel';
import { useRouter } from 'next/navigation';
import { aliasEndpoint } from './recordTypes';
import { ValueList, type RecordItem } from './recordItem';
import { displayName, formatDate } from '@/lib/format';

const i18n = {
  closeButtonAriaLabel: 'Close panel',
  openButtonAriaLabel: 'Open panel',
  preferencesTitle: 'Split panel preferences',
  preferencesPositionLabel: 'Split panel position',
  preferencesPositionDescription: 'Choose the default split panel position for the service.',
  preferencesPositionSide: 'Side',
  preferencesPositionBottom: 'Bottom',
  preferencesConfirm: 'Confirm',
  preferencesCancel: 'Cancel',
  preferencesCloseAriaLabel: 'Close preferences',
  resizeHandleAriaLabel: 'Resize split panel',
};

export function RecordSplitPanel({ zoneId, records }: { zoneId: string; records: RecordItem[] }) {
  const router = useRouter();

  if (records.length !== 1) {
    return (
      <SplitPanel header={records.length ? `${records.length} records selected` : 'Record details'} i18nStrings={i18n} hidePreferencesButton={false}>
        <Box textAlign="center" color="inherit" padding="l">
          {records.length ? 'Select a single record to see its details.' : 'Select a record to see its details.'}
        </Box>
      </SplitPanel>
    );
  }

  const r = records[0];
  const editHref = `/route53/v2/hostedzones/${zoneId}/records/${r.id}/edit`;
  const alias = r.alias_target;
  return (
    <SplitPanel
      header="Record details"
      headerDescription={r.displayName}
      i18nStrings={i18n}
      headerActions={
        <Button onClick={() => router.push(editHref)} disabled={false}>
          Edit record
        </Button>
      }
    >
      <KeyValuePairs
        columns={3}
        items={[
          { label: 'Record name', value: r.displayName },
          { label: 'Record type', value: r.type },
          { label: 'Value', value: <ValueList lines={r.alias_target ? [] : r.values} /> },
          { label: 'Alias', value: r.aliasLabel },
          ...(alias
            ? [
                { label: 'Route traffic to', value: aliasEndpoint(alias.endpoint_type)?.label ?? 'Alias target' },
                { label: 'Alias target', value: displayName(alias.dns_name) },
                { label: 'Evaluate target health', value: r.evaluateTargetHealthText },
              ]
            : [{ label: 'TTL (seconds)', value: r.ttlText }]),
          { label: 'Routing policy', value: r.policyLabel },
          ...(r.routing_policy !== 'SIMPLE'
            ? [
                { label: 'Record ID', value: r.recordIdText },
                { label: 'Differentiator', value: r.differentiatorText },
                { label: 'Health check ID', value: r.healthCheckText },
              ]
            : []),
          { label: 'Last updated', value: formatDate(r.updated_at) },
        ]}
      />
      {r.is_default && (
        <Box padding={{ top: 'm' }} variant="small" color="text-body-secondary">
          Route 53 created this {r.type} record for the hosted zone. You can edit it, but you can&apos;t delete it.
        </Box>
      )}
    </SplitPanel>
  );
}
