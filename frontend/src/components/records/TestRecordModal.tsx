'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Modal from '@cloudscape-design/components/modal';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useEffect, useState } from 'react';
import { displayName } from '@/lib/format';
import type { RecordSet, RecordType } from '@/lib/types';
import { recordTypeOptions } from './recordTypes';

interface Answer {
  code: 'NOERROR' | 'NXDOMAIN';
  values: string[];
  queried: string;
}

/** Mock of "Test record": answers from the records in this zone, wildcards included. Nothing is resolved for real. */
function resolve(records: RecordSet[], zoneName: string, sub: string, type: RecordType): Answer {
  const zone = displayName(zoneName);
  const queried = sub.trim() ? `${sub.trim().toLowerCase()}.${zone}` : zone;
  const matchName = (r: RecordSet) => displayName(r.name) === queried;
  const wildcard = (r: RecordSet) => {
    const n = displayName(r.name);
    return n.startsWith('*.') && queried.endsWith(n.slice(1)) && queried !== n.slice(2);
  };
  const exact = records.filter(matchName);
  const candidates = exact.length ? exact : records.filter(wildcard);
  if (!candidates.length) return { code: 'NXDOMAIN', values: [], queried };
  const sameType = candidates.filter(r => r.type === type);
  const cname = candidates.find(r => r.type === 'CNAME');
  const answer = sameType.length ? sameType : cname ? [cname] : [];
  // Weighted/latency/etc. are stored but not evaluated: answer with the first record set, like a single resolver hit.
  const chosen = answer[0];
  const values = chosen ? (chosen.alias_target ? [displayName(chosen.alias_target.dns_name)] : chosen.values) : [];
  return { code: 'NOERROR', values, queried };
}

export function TestRecordModal({
  visible,
  onDismiss,
  zoneName,
  records,
}: {
  visible: boolean;
  onDismiss: () => void;
  zoneName: string;
  records: RecordSet[];
}) {
  const [sub, setSub] = useState('');
  const [type, setType] = useState<RecordType>('A');
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (visible) setAnswer(null);
  }, [visible]);

  const options = recordTypeOptions(true).map(o => ({ value: o.value, label: o.value }));

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      size="large"
      header={<Header description="Check the response that Route 53 returns for a DNS query.">Test record</Header>}
      closeAriaLabel="Close dialog"
      footer={
        <Box float="right">
          <Button variant="link" onClick={onDismiss}>
            Close
          </Button>
        </Box>
      }
    >
      <SpaceBetween size="l">
        <ColumnLayout columns={2}>
          <FormField label="Record name" secondaryControl={<Box padding={{ top: 'xxs' }}>.{displayName(zoneName)}</Box>}>
            <Input value={sub} onChange={e => setSub(e.detail.value)} placeholder="www" />
          </FormField>
          <FormField label="Type">
            <Select
              selectedOption={options.find(o => o.value === type) ?? null}
              onChange={e => setType(e.detail.selectedOption.value as RecordType)}
              options={options}
            />
          </FormField>
        </ColumnLayout>
        <Button variant="primary" onClick={() => setAnswer(resolve(records, zoneName, sub, type))}>
          Get response
        </Button>
        {answer && (
          <Container header={<Header variant="h3">Response returned by Route 53</Header>}>
            <KeyValuePairs
              columns={2}
              items={[
                { label: 'DNS query sent to Route 53', value: `${answer.queried} ${type}` },
                { label: 'DNS response code', value: answer.code === 'NOERROR' ? 'No error (NOERROR)' : 'Non-existent domain (NXDOMAIN)' },
                { label: 'Protocol', value: 'UDP' },
                {
                  label: 'Response returned by Route 53',
                  value: answer.values.length ? (
                    <ul className="r53-values">
                      {answer.values.map(v => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  ) : (
                    '-'
                  ),
                },
              ]}
            />
          </Container>
        )}
      </SpaceBetween>
    </Modal>
  );
}
