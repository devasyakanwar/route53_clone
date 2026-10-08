'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useEffect, useState } from 'react';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { api, errorMessage } from '@/lib/api';
import { displayName } from '@/lib/format';
import type { HostedZone } from '@/lib/types';

interface Props {
  zones: HostedZone[];
  visible: boolean;
  onDismiss: () => void;
  onDeleted: (zones: HostedZone[]) => void;
}

/** Cloudscape "delete with additional confirmation" pattern, for one or several hosted zones (bulk delete). */
export function DeleteZoneModal({ zones, visible, onDismiss, onDeleted }: Props) {
  const notify = useNotify();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setConfirm('');
      setError('');
      setBusy(false);
    }
  }, [visible]);

  if (!zones.length) return null;
  const single = zones.length === 1;
  const withRecords = zones.filter(z => z.record_count > 2);
  const blocked = withRecords.length > 0;
  const canDelete = !blocked && confirm === 'delete' && !busy;

  const submit = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError('');
    try {
      if (single) await api.deleteZone(zones[0].id);
      else await api.deleteZones(zones.map(z => z.id));
      notify.success({
        header: single
          ? `${displayName(zones[0].name)} was successfully deleted.`
          : `${zones.length} hosted zones were successfully deleted.`,
        timeout: 8000,
      });
      onDeleted(zones);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={single ? 'Delete hosted zone?' : `Delete ${zones.length} hosted zones?`}
      closeAriaLabel="Close dialog"
      size={single ? 'medium' : 'large'}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!canDelete} loading={busy} data-testid="confirm-delete-zone">
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <form
        onSubmit={e => {
          e.preventDefault();
          void submit();
        }}
      >
        <SpaceBetween size="m">
          {single ? (
            <Box variant="span">
              Deleting a hosted zone is permanent. If you delete <b>{displayName(zones[0].name)}</b>, Route 53 will stop
              responding to DNS queries for it. You can&apos;t undo this action.
            </Box>
          ) : (
            <>
              <Box variant="span">
                Deleting hosted zones is permanent. Route 53 will stop responding to DNS queries for these hosted zones.
                Either all of them are deleted or none are. You can&apos;t undo this action.
              </Box>
              <Table
                variant="embedded"
                items={zones}
                trackBy="id"
                columnDefinitions={[
                  { id: 'name', header: 'Hosted zone name', cell: z => displayName(z.name) },
                  { id: 'type', header: 'Type', cell: z => (z.private_zone ? 'Private' : 'Public') },
                  { id: 'records', header: 'Record count', cell: z => z.record_count },
                  { id: 'id', header: 'Hosted zone ID', cell: z => z.id },
                ]}
              />
            </>
          )}
          {blocked && (
            <Alert type="error" header={single ? 'This hosted zone contains records' : 'Some hosted zones contain records'}>
              Before you delete a hosted zone, you must delete all records except the default NS and SOA records.{' '}
              {single
                ? `This hosted zone has ${zones[0].record_count - 2} other record${zones[0].record_count === 3 ? '' : 's'}.`
                : `These hosted zones still have records: ${withRecords.map(z => displayName(z.name)).join(', ')}.`}
            </Alert>
          )}
          {error && <Alert type="error">{error}</Alert>}
          <FormField label='To confirm deletion, type "delete" in the field.'>
            <Input
              value={confirm}
              onChange={e => setConfirm(e.detail.value)}
              placeholder="delete"
              ariaRequired
              disabled={blocked}
              autoFocus={!blocked}
            />
          </FormField>
        </SpaceBetween>
      </form>
    </Modal>
  );
}
