'use client';

import { useCollection } from '@cloudscape-design/collection-hooks';
import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import PropertyFilter from '@cloudscape-design/components/property-filter';
import Select, { type SelectProps } from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { InfoLink } from '@/components/common/InfoLink';
import {
  EmptyState,
  NoMatchState,
  propertyFilterI18n,
  STRING_OPERATORS,
  TablePreferencesControl,
  useTablePreferences,
  useUrlFilterQuery,
} from '@/components/common/tableConfig';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { useShortcuts } from '@/components/shell/ShortcutsProvider';
import { api, errorMessage } from '@/lib/api';
import { displayName, ROUTING_POLICY_LABELS } from '@/lib/format';
import type { HostedZoneDetail, RoutingPolicy } from '@/lib/types';
import { DeleteRecordsModal } from './DeleteRecordsModal';
import { ImportZoneFileModal } from './ImportZoneFileModal';
import { ValueList, type RecordItem } from './recordItem';
import { RECORD_TYPE_INFO } from './recordTypes';

const COLUMNS: { id: string; label: string; alwaysVisible?: boolean; visible?: boolean }[] = [
  { id: 'name', label: 'Record name', alwaysVisible: true },
  { id: 'type', label: 'Type' },
  { id: 'policy', label: 'Routing policy' },
  { id: 'differentiator', label: 'Differentiator' },
  { id: 'alias', label: 'Alias' },
  { id: 'value', label: 'Value/Route traffic to' },
  { id: 'ttl', label: 'TTL (seconds)' },
  { id: 'healthCheck', label: 'Health check ID' },
  { id: 'evaluateTargetHealth', label: 'Evaluate target health' },
  { id: 'recordId', label: 'Record ID' },
];

const FILTERING_PROPERTIES = [
  { key: 'displayName', propertyLabel: 'Record name', groupValuesLabel: 'Record name values', operators: [...STRING_OPERATORS] },
  { key: 'type', propertyLabel: 'Type', groupValuesLabel: 'Type values', operators: ['=', '!='] },
  { key: 'policyLabel', propertyLabel: 'Routing policy', groupValuesLabel: 'Routing policy values', operators: ['=', '!='] },
  { key: 'aliasLabel', propertyLabel: 'Alias', groupValuesLabel: 'Alias values', operators: ['=', '!='] },
  { key: 'valueText', propertyLabel: 'Value/Route traffic to', groupValuesLabel: 'Values', operators: [':', '!:', '=', '!='] },
  { key: 'ttlText', propertyLabel: 'TTL (seconds)', groupValuesLabel: 'TTL values', operators: ['=', '!='] },
  { key: 'recordIdText', propertyLabel: 'Record ID', groupValuesLabel: 'Record ID values', operators: [...STRING_OPERATORS] },
];

const ANY = { value: '', label: 'Any' };
const TYPE_OPTIONS: SelectProps.Option[] = [
  { value: '', label: 'Any type' },
  ...RECORD_TYPE_INFO.map(t => ({ value: t.type, label: t.type })),
];
const POLICY_OPTIONS: SelectProps.Option[] = [
  { value: '', label: 'Any routing policy' },
  ...(Object.keys(ROUTING_POLICY_LABELS) as RoutingPolicy[]).map(p => ({ value: p, label: ROUTING_POLICY_LABELS[p] })),
];
const ALIAS_OPTIONS: SelectProps.Option[] = [
  { value: '', label: 'Alias: Any' },
  { value: 'Yes', label: 'Alias: Yes' },
  { value: 'No', label: 'Alias: No' },
];

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  zone: HostedZoneDetail;
  records: RecordItem[] | undefined;
  loading: boolean;
  refreshing: boolean;
  error: Error | undefined;
  refresh: () => Promise<unknown>;
  selected: RecordItem[];
  onSelectionChange: (items: RecordItem[]) => void;
  onRecordsDeleted: (ids: number[]) => void;
  onImported: () => void;
}

export function RecordsTable({
  zone,
  records,
  loading,
  refreshing,
  error,
  refresh,
  selected,
  onSelectionChange,
  onRecordsDeleted,
  onImported,
}: Props) {
  const router = useRouter();
  const notify = useNotify();
  const [urlQuery, setUrlQuery] = useUrlFilterQuery();
  const [prefs, setPrefs] = useTablePreferences('r53.records-table', COLUMNS);
  const [typeFilter, setTypeFilter] = useState<SelectProps.Option>(TYPE_OPTIONS[0]);
  const [policyFilter, setPolicyFilter] = useState<SelectProps.Option>(POLICY_OPTIONS[0]);
  const [aliasFilter, setAliasFilter] = useState<SelectProps.Option>(ALIAS_OPTIONS[0]);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);

  const createHref = `/route53/v2/hostedzones/${zone.id}/records/create`;
  const zoneName = displayName(zone.name);

  const filtered = useMemo(
    () =>
      (records ?? []).filter(
        r =>
          (!typeFilter.value || r.type === typeFilter.value) &&
          (!policyFilter.value || r.routing_policy === policyFilter.value) &&
          (!aliasFilter.value || r.aliasLabel === aliasFilter.value),
      ),
    [records, typeFilter, policyFilter, aliasFilter],
  );

  const { items, actions, filteredItemsCount, collectionProps, propertyFilterProps, paginationProps } = useCollection(
    filtered,
    {
      propertyFiltering: {
        filteringProperties: FILTERING_PROPERTIES,
        defaultQuery: urlQuery,
        empty: (
          <EmptyState
            title="No records"
            subtitle={records?.length ? 'No records match the selected filters.' : "You don't have any records."}
            action={
              records?.length ? (
                <Button onClick={() => clearAll()}>Clear filters</Button>
              ) : (
                <Button onClick={() => router.push(createHref)}>Create record</Button>
              )
            }
          />
        ),
        noMatch: <NoMatchState onClear={() => clearAll()} />,
      },
      sorting: {},
      pagination: { pageSize: prefs.pageSize },
    },
  );

  function clearAll() {
    actions.setPropertyFiltering({ tokens: [], operation: 'and' });
    setUrlQuery({ tokens: [], operation: 'and' });
    setTypeFilter(TYPE_OPTIONS[0]);
    setPolicyFilter(POLICY_OPTIONS[0]);
    setAliasFilter(ALIAS_OPTIONS[0]);
  }

  const hasDefaultSelected = selected.some(r => r.is_default);
  const canDelete = selected.length > 0 && !hasDefaultSelected;

  const doRefresh = async () => {
    try {
      await refresh();
    } catch (e) {
      notify.error({ header: 'Failed to refresh records.', content: errorMessage(e) });
    }
  };

  useShortcuts({
    create: () => router.push(createHref),
    refresh: () => void doRefresh(),
    delete: () => canDelete && setDeleteVisible(true),
    escape: () => {
      if (deleteVisible || importVisible) {
        setDeleteVisible(false);
        setImportVisible(false);
      } else {
        onSelectionChange([]);
      }
    },
  });

  const exportZone = async (format: 'json' | 'bind') => {
    try {
      const data = await api.exportZone(zone.id, format);
      const base = zoneName;
      if (format === 'json') download(`${base}.json`, JSON.stringify(data, null, 2), 'application/json');
      else download(`${base}.zone`, String(data), 'text/plain');
      notify.success({ header: `Exported records for ${zoneName} as ${format === 'json' ? 'JSON' : 'a BIND zone file'}.`, timeout: 5000 });
    } catch (e) {
      notify.error({ header: 'Export failed.', content: errorMessage(e) });
    }
  };

  const columnDefinitions: TableProps.ColumnDefinition<RecordItem>[] = [
    { id: 'name', width: 220, header: 'Record name', sortingField: 'displayName', isRowHeader: true, cell: r => r.displayName },
    { id: 'type', width: 90, header: 'Type', sortingField: 'type', cell: r => r.type },
    { id: 'policy', width: 140, header: 'Routing policy', sortingField: 'policyLabel', cell: r => r.policyLabel },
    { id: 'differentiator', width: 140, header: 'Differentiator', sortingField: 'differentiatorText', cell: r => r.differentiatorText },
    { id: 'alias', width: 90, header: 'Alias', sortingField: 'aliasLabel', cell: r => r.aliasLabel },
    {
      id: 'value',
      width: 300,
      header: 'Value/Route traffic to',
      sortingField: 'valueText',
      cell: r => <ValueList lines={r.valueText ? r.valueText.split('\n') : []} />,
      minWidth: 240,
    },
    {
      id: 'ttl',
      width: 130,
      header: 'TTL (seconds)',
      sortingComparator: (a, b) => (a.ttl ?? -1) - (b.ttl ?? -1),
      cell: r => r.ttlText,
    },
    { id: 'healthCheck', width: 170, header: 'Health check ID', sortingField: 'healthCheckText', cell: r => r.healthCheckText },
    {
      id: 'evaluateTargetHealth',
      width: 200,
      header: 'Evaluate target health',
      sortingField: 'evaluateTargetHealthText',
      cell: r => r.evaluateTargetHealthText,
    },
    { id: 'recordId', width: 150, header: 'Record ID', sortingField: 'recordIdText', cell: r => r.recordIdText },
  ];

  const filteringOptions = useMemo(
    () =>
      FILTERING_PROPERTIES.flatMap(p =>
        [...new Set((records ?? []).map(i => String(i[p.key as keyof RecordItem] ?? '')).filter(v => v && v !== '-'))]
          .slice(0, 200)
          .map(value => ({ propertyKey: p.key, value })),
      ),
    [records],
  );

  return (
    <>
      <Table<RecordItem>
        {...collectionProps}
        items={items}
        trackBy="id"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={e => onSelectionChange([...e.detail.selectedItems])}
        onRowClick={e => onSelectionChange([e.detail.item])}
        columnDefinitions={columnDefinitions}
        columnDisplay={prefs.contentDisplay}
        variant="container"
        stickyHeader
        resizableColumns
        wrapLines={prefs.wrapLines}
        stripedRows={prefs.stripedRows}
        contentDensity={prefs.contentDensity}
        loading={loading}
        loadingText="Loading records"
        ariaLabels={{
          selectionGroupLabel: 'Records selection',
          itemSelectionLabel: (_, r) => `Select ${r.displayName} ${r.type}`,
          allItemsSelectionLabel: () => 'Select all records',
          tableLabel: 'Records',
        }}
        empty={
          error ? (
            <EmptyState
              title="Unable to load records"
              subtitle={error.message}
              action={<Button onClick={() => void doRefresh()}>Retry</Button>}
            />
          ) : (
            collectionProps.empty
          )
        }
        header={
          <Header
            variant="h2"
            counter={
              records ? (selected.length ? `(${selected.length}/${records.length})` : `(${records.length})`) : undefined
            }
            info={<InfoLink topic="records" />}
            description={
              hasDefaultSelected
                ? "You can't delete the NS and SOA records that Route 53 created for the hosted zone."
                : undefined
            }
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh records" loading={refreshing && !loading} onClick={() => void doRefresh()} />
                <Button
                  disabled={!canDelete}
                  disabledReason={
                    hasDefaultSelected
                      ? "You can't delete the NS and SOA records that Route 53 created for the hosted zone."
                      : 'Select one or more records to delete.'
                  }
                  onClick={() => setDeleteVisible(true)}
                >
                  Delete record{selected.length > 1 ? 's' : ''}
                </Button>
                <Button onClick={() => setImportVisible(true)}>Import zone file</Button>
                <ButtonDropdown
                  items={[
                    { id: 'json', text: 'Export as JSON', description: 'ListResourceRecordSets format' },
                    { id: 'bind', text: 'Export as BIND zone file', description: 'Standard zone file text' },
                  ]}
                  onItemClick={e => void exportZone(e.detail.id as 'json' | 'bind')}
                >
                  Export
                </ButtonDropdown>
                <Button variant="primary" onClick={() => router.push(createHref)}>
                  Create record
                </Button>
              </SpaceBetween>
            }
          >
            Records
          </Header>
        }
        filter={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            <div data-shortcut="filter" style={{ flex: '1 1 320px', minWidth: 0 }}>
              <PropertyFilter
                {...propertyFilterProps}
                onChange={e => {
                  propertyFilterProps.onChange(e);
                  setUrlQuery(e.detail);
                }}
                filteringOptions={filteringOptions}
                filteringPlaceholder="Filter records by property or value"
                filteringAriaLabel="Filter records"
                i18nStrings={propertyFilterI18n}
                countText={`${filteredItemsCount ?? 0} ${filteredItemsCount === 1 ? 'match' : 'matches'}`}
                expandToViewport
              />
            </div>
            <div style={{ width: 150 }}>
              <Select
                selectedOption={typeFilter}
                onChange={e => setTypeFilter(e.detail.selectedOption)}
                options={TYPE_OPTIONS}
                ariaLabel="Filter by type"
                expandToViewport
              />
            </div>
            <div style={{ width: 210 }}>
              <Select
                selectedOption={policyFilter}
                onChange={e => setPolicyFilter(e.detail.selectedOption)}
                options={POLICY_OPTIONS}
                ariaLabel="Filter by routing policy"
                expandToViewport
              />
            </div>
            <div style={{ width: 140 }}>
              <Select
                selectedOption={aliasFilter.value ? aliasFilter : { ...ANY, label: 'Alias: Any' }}
                onChange={e => setAliasFilter(e.detail.selectedOption)}
                options={ALIAS_OPTIONS}
                ariaLabel="Filter by alias"
                expandToViewport
              />
            </div>
          </div>
        }
        pagination={<Pagination {...paginationProps} />}
        preferences={
          <TablePreferencesControl preferences={prefs} onChange={setPrefs} columnOptions={COLUMNS} resourceName="records" />
        }
      />
      <DeleteRecordsModal
        zoneId={zone.id}
        zoneName={zoneName}
        records={selected}
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        onDeleted={ids => {
          setDeleteVisible(false);
          onRecordsDeleted(ids);
        }}
      />
      <ImportZoneFileModal
        zoneId={zone.id}
        zoneName={zone.name}
        visible={importVisible}
        onDismiss={() => setImportVisible(false)}
        onImported={() => {
          setImportVisible(false);
          onImported();
        }}
      />
    </>
  );
}
