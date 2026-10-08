'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useEffect, useState } from 'react';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { api, ApiError, errorMessage } from '@/lib/api';
import { dash, displayName } from '@/lib/format';
import type { ImportResponse } from '@/lib/types';
import { ValueList } from './recordItem';

interface Props {
  zoneId: string;
  zoneName: string;
  visible: boolean;
  onDismiss: () => void;
  onImported: () => void;
}

const EXAMPLE = `$ORIGIN example.com.
$TTL 300
www      IN A     192.0.2.10
mail     IN MX    10 mx.example.com.
@        IN TXT   "v=spf1 -all"`;

export function ImportZoneFileModal({ zoneId, zoneName, visible, onDismiss, onImported }: Props) {
  const notify = useNotify();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setText('');
      setFiles([]);
      setPreview(null);
      setError('');
      setBusy(false);
    }
  }, [visible]);

  const loadFile = async (picked: File[]) => {
    setFiles(picked);
    setPreview(null);
    if (picked[0]) setText(await picked[0].text());
  };

  const runPreview = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(await api.importZone(zoneId, text, true));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.importZone(zoneId, text, false);
      notify.success({
        header: `${res.record_sets.length} record${res.record_sets.length === 1 ? '' : 's'} imported into ${displayName(zoneName)}.`,
        timeout: 8000,
      });
      if (res.change_info) notify.trackChange(res.change_info);
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      size="large"
      header="Import zone file"
      closeAriaLabel="Close dialog"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            {preview ? (
              <Button variant="primary" onClick={() => void runImport()} loading={busy} disabled={!preview.record_sets.length}>
                Import
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void runPreview()} loading={busy} disabled={!text.trim()}>
                Preview records
              </Button>
            )}
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">
        <Box variant="p">
          Paste the contents of a BIND-formatted zone file or upload one. Route 53 skips the SOA record and the NS
          record at the zone apex, and creates all other records in a single change batch.
        </Box>
        <FormField label="Zone file" description="Upload a file or paste the zone file in the text box below.">
          <FileUpload
            value={files}
            onChange={e => void loadFile(e.detail.value)}
            accept=".txt,.zone,.db,.bind,text/plain"
            constraintText="Text files only, for example example.com.zone"
            showFileSize
            i18nStrings={{
              uploadButtonText: () => 'Choose file',
              dropzoneText: () => 'Drop file to upload',
              removeFileAriaLabel: i => `Remove file ${i + 1}`,
              limitShowFewer: 'Show fewer files',
              limitShowMore: 'Show more files',
              errorIconAriaLabel: 'Error',
            }}
          />
        </FormField>
        <FormField label="Zone file contents" stretch>
          <Textarea
            value={text}
            onChange={e => {
              setText(e.detail.value);
              setPreview(null);
            }}
            placeholder={EXAMPLE}
            rows={10}
            spellcheck={false}
          />
        </FormField>
        {error && (
          <Alert type="error" header="The zone file couldn't be imported">
            {error}
          </Alert>
        )}
        {preview && (
          <SpaceBetween size="s">
            <Table
              variant="container"
              header={<Box variant="h3">Records to import ({preview.record_sets.length})</Box>}
              items={preview.record_sets}
              wrapLines
              empty="No records found in the zone file."
              columnDefinitions={[
                { id: 'name', header: 'Record name', cell: r => displayName(r.name) },
                { id: 'type', header: 'Type', cell: r => r.type },
                { id: 'ttl', header: 'TTL (seconds)', cell: r => dash(r.ttl) },
                { id: 'value', header: 'Value', cell: r => <ValueList lines={r.values} /> },
              ]}
            />
            {preview.skipped.length > 0 && (
              <ExpandableSection headerText={`Skipped records (${preview.skipped.length})`}>
                <ul>
                  {preview.skipped.map(s => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </ExpandableSection>
            )}
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Modal>
  );
}
