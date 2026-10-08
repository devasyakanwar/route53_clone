'use client';

import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { InfoLink } from '@/components/common/InfoLink';
import { useShortcuts } from '@/components/shell/ShortcutsProvider';
import type { HostedZoneDetail, RecordSet } from '@/lib/types';
import { RecordFields } from './RecordFields';
import { emptyRow, recordToRow, type RecordRowState } from './recordRow';
import { useRecordSubmit } from './useRecordSubmit';

interface Props {
  zone: HostedZoneDetail;
  /** When set, the form edits this record (UPSERT); otherwise it is the multi-row Quick create form. */
  record?: RecordSet;
}

export function RecordForm({ zone, record }: Props) {
  const router = useRouter();
  const isEdit = !!record;
  const [rows, setRows] = useState<RecordRowState[]>(() => [record ? recordToRow(record, zone.name) : emptyRow()]);
  const { errors, setErrors, formError, busy, submit } = useRecordSubmit(zone, record);
  const zoneHref = `/route53/v2/hostedzones/${zone.id}`;

  useShortcuts({ escape: () => router.push(zoneHref) });

  const update = (index: number, patch: Partial<RecordRowState>) => {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    // Clear errors for the fields being edited.
    const fieldsTouched = Object.keys(patch);
    if (errors[index]) {
      const next = { ...errors[index] };
      if (fieldsTouched.includes('subdomain')) delete next.name;
      if (fieldsTouched.includes('value')) delete next.values;
      if (fieldsTouched.includes('ttl')) delete next.ttl;
      if (fieldsTouched.includes('setIdentifier')) delete next.set_identifier;
      if (fieldsTouched.includes('weight')) delete next.weight;
      if (fieldsTouched.some(f => f.startsWith('alias'))) delete next.alias_target;
      setErrors({ ...errors, [index]: next });
    }
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
    const next: typeof errors = {};
    Object.entries(errors).forEach(([k, v]) => {
      const i = Number(k);
      if (i < index) next[i] = v;
      if (i > index) next[i - 1] = v;
    });
    setErrors(next);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(rows);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Form
        header={
          <Header
            variant="h1"
            info={<InfoLink topic={isEdit ? 'editRecord' : 'createRecord'} />}
            actions={
              !isEdit && (
                <Link
                  href={`${zoneHref}/records/create?view=wizard`}
                  onFollow={e => {
                    e.preventDefault();
                    router.push(`${zoneHref}/records/create?view=wizard`);
                  }}
                >
                  Switch to wizard
                </Link>
              )
            }
          >
            {isEdit ? 'Edit record' : 'Quick create record'}
          </Header>
        }
        errorText={formError}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" formAction="none" onClick={() => router.push(zoneHref)}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={busy}>
              {isEdit ? 'Save' : 'Create records'}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {rows.map((row, i) => (
            <div key={row.key} data-testid={`record-row-${i}`}>
            <Container
              header={
                <Header
                  variant="h2"
                  actions={
                    !isEdit &&
                    rows.length > 1 && (
                      <Button formAction="none" onClick={() => removeRow(i)}>
                        Delete
                      </Button>
                    )
                  }
                >
                  {isEdit ? 'Record' : `Record ${i + 1}`}
                </Header>
              }
            >
              <RecordFields
                row={row}
                zoneName={zone.name}
                errors={errors[i] ?? {}}
                onChange={patch => update(i, patch)}
                identityLocked={isEdit}
                defaultRecord={record?.is_default}
              />
            </Container>
            </div>
          ))}
          {!isEdit && (
            <Button formAction="none" iconName="add-plus" onClick={() => setRows([...rows, emptyRow()])}>
              Add another record
            </Button>
          )}
        </SpaceBetween>
      </Form>
    </form>
  );
}
