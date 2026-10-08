'use client';

import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tabs from '@cloudscape-design/components/tabs';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { InfoLink } from '@/components/common/InfoLink';
import { DeleteZoneModal } from '@/components/hosted-zones/DeleteZoneModal';
import { ZoneDetails } from '@/components/hosted-zones/ZoneDetails';
import { ZoneLoadState } from '@/components/hosted-zones/ZoneLoadState';
import { AcceleratedRecoveryTab, DnssecTab, TagsTab } from '@/components/hosted-zones/ZoneTabs';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { toRecordItem, type RecordItem } from '@/components/records/recordItem';
import { RecordSplitPanel } from '@/components/records/RecordSplitPanel';
import { RecordsTable } from '@/components/records/RecordsTable';
import { TestRecordModal } from '@/components/records/TestRecordModal';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { useRecords } from '@/hooks/useRecords';
import { useZone, useZones } from '@/hooks/useZones';
import { displayName } from '@/lib/format';

function ZoneDetailContent() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const notify = useNotify();
  const { zone, error: zoneError, mutate: mutateZone } = useZone(zoneId);
  const { records, error: recordsError, isLoading, isValidating, mutate: mutateRecords } = useRecords(zone ? zoneId : undefined);
  const { mutate: mutateZones } = useZones();
  const [selected, setSelected] = useState<RecordItem[]>([]);
  const [splitOpen, setSplitOpen] = useState(false);
  const [deleteZoneVisible, setDeleteZoneVisible] = useState(false);
  const [testVisible, setTestVisible] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'records');

  const items = useMemo(() => records?.map(toRecordItem), [records]);

  // Keep the selection pointing at fresh objects after a refetch; drop records that no longer exist.
  useEffect(() => {
    if (!items) return;
    setSelected(prev => {
      const next = prev.map(p => items.find(i => i.id === p.id)).filter((i): i is RecordItem => !!i);
      return next.length === prev.length && next.every((n, i) => n === prev[i]) ? prev : next;
    });
  }, [items]);

  const onSelectionChange = (next: RecordItem[]) => {
    setSelected(next);
    if (next.length === 1) setSplitOpen(true);
    if (next.length === 0) setSplitOpen(false);
  };

  const refreshAll = () => Promise.all([mutateRecords(), mutateZone()]);
  const name = zone ? displayName(zone.name) : zoneId;
  const base = `/route53/v2/hostedzones/${zoneId}`;

  return (
    <ConsolePage
      breadcrumbs={[
        { text: 'Hosted zones', href: '/route53/v2/hostedzones' },
        { text: name, href: base },
      ]}
      helpKey="hostedZoneDetails"
      splitPanel={zone && activeTab === 'records' && selected.length > 0 ? <RecordSplitPanel zoneId={zoneId} records={selected} /> : undefined}
      splitPanelOpen={splitOpen && selected.length > 0}
      onSplitPanelToggle={setSplitOpen}
    >
      {!zone ? (
        <ZoneLoadState error={zoneError} zoneId={zoneId} onRetry={() => void mutateZone()} />
      ) : (
        <ContentLayout
          header={
            <Header
              variant="h1"
              info={<InfoLink topic="hostedZoneDetails" />}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={() => setDeleteZoneVisible(true)}>Delete zone</Button>
                  <Button onClick={() => setTestVisible(true)}>Test record</Button>
                  <Button
                    onClick={() =>
                      notify.info({
                        header: 'Query logging is coming soon.',
                        content: 'Query logging would send DNS query logs to CloudWatch Logs.',
                        timeout: 5000,
                      })
                    }
                  >
                    Configure query logging
                  </Button>
                </SpaceBetween>
              }
            >
              {name}
            </Header>
          }
        >
          <SpaceBetween size="l">
            <ZoneDetails zone={zone} />
            <Tabs
              activeTabId={activeTab}
              onChange={e => setActiveTab(e.detail.activeTabId)}
              ariaLabel="Hosted zone tabs"
              tabs={[
                {
                  id: 'records',
                  label: `Records (${records?.length ?? zone.record_count})`,
                  content: (
                    <RecordsTable
                      zone={zone}
                      records={items}
                      loading={isLoading || !records}
                      refreshing={isValidating}
                      error={recordsError}
                      refresh={refreshAll}
                      selected={selected}
                      onSelectionChange={onSelectionChange}
                      onRecordsDeleted={ids => {
                        setSelected([]);
                        setSplitOpen(false);
                        void mutateRecords(
                          data => (data ? { ...data, items: data.items.filter(r => !ids.includes(r.id)) } : data),
                          { revalidate: true },
                        );
                        void mutateZone();
                        void mutateZones();
                      }}
                      onImported={() => {
                        void refreshAll();
                        void mutateZones();
                      }}
                    />
                  ),
                },
                { id: 'dnssec', label: 'DNSSEC signing', content: <DnssecTab zone={zone} /> },
                { id: 'tags', label: `Hosted zone tags (${zone.tags.length})`, content: <TagsTab zone={zone} /> },
                { id: 'recovery', label: 'Accelerated recovery', content: <AcceleratedRecoveryTab /> },
              ]}
            />
          </SpaceBetween>
          <DeleteZoneModal
            zones={[zone]}
            visible={deleteZoneVisible}
            onDismiss={() => setDeleteZoneVisible(false)}
            onDeleted={([deleted]) => {
              setDeleteZoneVisible(false);
              void mutateZones(
                data => (data ? { ...data, items: data.items.filter(z => z.id !== deleted.id), total: data.total - 1 } : data),
                { revalidate: true },
              );
              router.push('/route53/v2/hostedzones');
            }}
          />
          <TestRecordModal
            visible={testVisible}
            onDismiss={() => setTestVisible(false)}
            zoneName={zone.name}
            records={records ?? []}
          />
        </ContentLayout>
      )}
    </ConsolePage>
  );
}

export default function HostedZoneDetailPage() {
  return (
    <Suspense>
      <ZoneDetailContent />
    </Suspense>
  );
}
