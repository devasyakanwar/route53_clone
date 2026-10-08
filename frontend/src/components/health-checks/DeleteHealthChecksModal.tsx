'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useEffect, useState } from 'react';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { HealthCheck } from '@/lib/types';

export function DeleteHealthChecksModal({
  checks,
  visible,
  onDismiss,
  onDeleted,
}: {
  checks: HealthCheck[];
  visible: boolean;
  onDismiss: () => void;
  onDeleted: (ids: string[]) => void;
}) {
  const notify = useNotify();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setConfirm('');
      setBusy(false);
      setErrors([]);
    }
  }, [visible]);

  const single = checks.length === 1;
  const submit = async () => {
    if (confirm !== 'delete') return;
    setBusy(true);
    setErrors([]);
    try {
      await api.deleteHealthChecks(checks.map(c => c.id));
      notify.success({
        header: single ? `Health check ${checks[0].name} was successfully deleted.` : `${checks.length} health checks were successfully deleted.`,
        timeout: 8000,
      });
      onDeleted(checks.map(c => c.id));
    } catch (e) {
      setErrors(e instanceof ApiError && e.errors.length ? e.errors.map(x => x.message) : [errorMessage(e)]);
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={single ? 'Delete health check?' : 'Delete health checks?'}
      closeAriaLabel="Close dialog"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={confirm !== 'delete'} loading={busy}>
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
          <Box variant="span">
            {single ? (
              <>
                Permanently delete health check <b>{checks[0]?.name}</b>?
              </>
            ) : (
              <>Permanently delete {checks.length} health checks: {checks.map(c => c.name).join(', ')}?</>
            )}{' '}
            If records use {single ? 'this health check' : 'these health checks'} for failover, Route 53 can&apos;t
            delete {single ? 'it' : 'them'}. You can&apos;t undo this action.
          </Box>
          {errors.length > 0 && (
            <Alert type="error" header="Health checks weren't deleted">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {errors.map(e => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}
          <FormField label='To confirm deletion, type "delete" in the field.'>
            <Input value={confirm} onChange={e => setConfirm(e.detail.value)} placeholder="delete" autoFocus />
          </FormField>
        </SpaceBetween>
      </form>
    </Modal>
  );
}
