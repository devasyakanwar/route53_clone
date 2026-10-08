'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useEffect, useState } from 'react';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { api, errorMessage } from '@/lib/api';
import { recordToInput, ValueList, type RecordItem } from './recordItem';

interface Props {
  zoneId: string;
  zoneName: string;
  records: RecordItem[];
  visible: boolean;
  onDismiss: () => void;
  onDeleted: (ids: number[]) => void;
}

export function DeleteRecordsModal({ zoneId, zoneName, records, visible, onDismiss, onDeleted }: Props) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setBusy(false);
      setError('');
    }
  }, [visible]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.changeRecords(
        zoneId,
        records.map(r => ({ action: 'DELETE', record_set: recordToInput(r) })),
      );
      notify.success({
        header:
          records.length === 1
            ? `Record ${records[0].displayName} was successfully deleted.`
            : `${records.length} records for ${zoneName} were successfully deleted.`,
        timeout: 8000,
      });
      notify.trackChange(res.change_info);
      onDeleted(records.map(r => r.id));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={records.length === 1 ? 'Delete record?' : 'Delete records?'}
      size="large"
      closeAriaLabel="Close dialog"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!records.length}>
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box variant="span">
          Deleting {records.length === 1 ? 'this record' : `these ${records.length} records`} is permanent. Route 53
          will stop responding to DNS queries for {records.length === 1 ? 'it' : 'them'}.
        </Box>
        {error && <Alert type="error">{error}</Alert>}
        <Table
          variant="embedded"
          items={records}
          trackBy="id"
          wrapLines
          columnDefinitions={[
            { id: 'name', header: 'Record name', cell: r => r.displayName },
            { id: 'type', header: 'Type', cell: r => r.type },
            { id: 'value', header: 'Value/Route traffic to', cell: r => <ValueList lines={r.valueText.split('\n')} /> },
          ]}
        />
      </SpaceBetween>
    </Modal>
  );
}
