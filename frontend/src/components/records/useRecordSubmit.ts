'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { ApiError, api, errorMessage, keys } from '@/lib/api';
import { displayName } from '@/lib/format';
import type { Change, HostedZoneDetail, RecordSet } from '@/lib/types';
import { mapServerField, rowToInput, validateRow, type RecordRowState, type RowErrors } from './recordRow';
import { recordToInput } from './recordItem';

export function scrollToFirstError() {
  requestAnimationFrame(() => {
    const el = document.querySelector('[data-has-error="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  });
}

/** Validates rows client-side, submits one atomic change batch and maps API errors back onto rows. */
export function useRecordSubmit(zone: HostedZoneDetail | undefined, original?: RecordSet) {
  const router = useRouter();
  const notify = useNotify();
  const { mutate } = useSWRConfig();
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const validateAll = (rows: RecordRowState[]): boolean => {
    if (!zone) return false;
    const next: Record<number, RowErrors> = {};
    rows.forEach((r, i) => {
      const e = validateRow(r, zone.name);
      if (Object.keys(e).length) next[i] = e;
    });
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) {
      scrollToFirstError();
      return false;
    }
    return true;
  };

  const submit = async (rows: RecordRowState[]) => {
    if (!zone || !validateAll(rows)) return;
    const inputs = rows.map(r => rowToInput(r, zone.name));
    let changes: Change[];
    if (original) {
      const input = inputs[0];
      const sameIdentity = (original.set_identifier ?? '') === (input.set_identifier ?? '');
      changes = sameIdentity
        ? [{ action: 'UPSERT', record_set: input }]
        : [
            { action: 'DELETE', record_set: recordToInput(original) },
            { action: 'CREATE', record_set: input },
          ];
    } else {
      changes = inputs.map(record_set => ({ action: 'CREATE', record_set }));
    }

    setBusy(true);
    try {
      const res = await api.changeRecords(zone.id, changes);
      const zoneName = displayName(zone.name);
      if (original) {
        notify.success({ header: `Record ${displayName(original.name)} was successfully updated.`, timeout: 10000 });
      } else {
        notify.success({
          header:
            inputs.length === 1
              ? `Record for ${zoneName} was successfully created.`
              : `${inputs.length} records for ${zoneName} were successfully created.`,
          content: 'Route 53 propagates your changes to all of the Route 53 authoritative DNS servers within 60 seconds.',
          timeout: 10000,
        });
      }
      notify.trackChange(res.change_info);
      await Promise.all([mutate(keys.records(zone.id)), mutate(keys.zone(zone.id)), mutate(keys.zones)]);
      router.push(`/route53/v2/hostedzones/${zone.id}`);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.errors.length) {
        const next: Record<number, RowErrors> = {};
        const unmapped: string[] = [];
        for (const fe of e.errors) {
          const mapped = mapServerField(fe.field);
          // In edit mode a DELETE+CREATE batch puts the edited record at index 1.
          const row = mapped ? (original && changes.length === 2 ? Math.max(0, mapped.row - 1) : mapped.row) : -1;
          if (mapped && row < rows.length) {
            const valueIndex = /values\[(\d+)\]/.exec(fe.field ?? '');
            const message = valueIndex && rows[row].value.split('\n').filter(Boolean).length > 1 ? `Line ${Number(valueIndex[1]) + 1}: ${fe.message}` : fe.message;
            next[row] = { ...next[row], [mapped.field]: next[row]?.[mapped.field] ?? message };
          } else {
            unmapped.push(fe.message);
          }
        }
        setErrors(next);
        setFormError(unmapped.join(' ') || (Object.keys(next).length ? '' : e.message));
        scrollToFirstError();
      } else {
        setFormError(errorMessage(e));
      }
    }
  };

  return { errors, setErrors, formError, busy, submit };
}
