'use client';

import { useCollection } from '@cloudscape-design/collection-hooks';
import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import Pagination from '@cloudscape-design/components/pagination';
import PropertyFilter from '@cloudscape-design/components/property-filter';
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
import { useZones } from '@/hooks/useZones';
import { api, errorMessage } from '@/lib/api';
import { dash, displayName } from '@/lib/format';
import type { HostedZone } from '@/lib/types';
import { DeleteZoneModal } from './DeleteZoneModal';

interface ZoneItem extends HostedZone {
  displayName: string;
  typeLabel: 'Public' | 'Private';
}

const COLUMNS: { id: string; label: string; alwaysVisible?: boolean }[] = [
  { id: 'name', label: 'Hosted zone name', alwaysVisible: true },
  { id: 'type', label: 'Type' },
  { id: 'createdBy', label: 'Created by' },
  { id: 'recordCount', label: 'Record count' },
  { id: 'description', label: 'Description' },
  { id: 'id', label: 'Hosted zone ID' },
];

const FILTERING_PROPERTIES = [
  { key: 'displayName', propertyLabel: 'Hosted zone name', groupValuesLabel: 'Hosted zone name values', operators: STRING_OPERATORS },
  { key: 'typeLabel', propertyLabel: 'Type', groupValuesLabel: 'Type values', operators: ['=', '!='] as const },
  { key: 'created_by', propertyLabel: 'Created by', groupValuesLabel: 'Created by values', operators: STRING_OPERATORS },
  { key: 'comment', propertyLabel: 'Description', groupValuesLabel: 'Description values', operators: STRING_OPERATORS },
  { key: 'id', propertyLabel: 'Hosted zone ID', groupValuesLabel: 'Hosted zone ID values', operators: STRING_OPERATORS },
].map(p => ({ ...p, operators: [...p.operators] }));

export function ZonesTable() {
  const router = useRouter();
  const notify = useNotify();
  const { zones, isLoading, isValidating, mutate, error } = useZones();
  const [urlQuery, setUrlQuery] = useUrlFilterQuery();
  const [prefs, setPrefs] = useTablePreferences('r53.zones-table', COLUMNS);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const items = useMemo<ZoneItem[]>(
    () =>
      (zones ?? []).map(z => ({
        ...z,
        displayName: displayName(z.name),
        typeLabel: z.private_zone ? 'Private' : 'Public',
      })),
    [zones],
  );

  const goCreate = () => router.push('/route53/v2/hostedzones/create');

  const { items: pageItems, actions, filteredItemsCount, collectionProps, propertyFilterProps, paginationProps } =
    useCollection(items, {
      propertyFiltering: {
        filteringProperties: FILTERING_PROPERTIES,
        defaultQuery: urlQuery,
        empty: (
          <EmptyState
            title="No hosted zones"
            subtitle="You don't have any hosted zones."
            action={<Button onClick={goCreate}>Create hosted zone</Button>}
          />
        ),
        noMatch: <NoMatchState onClear={() => clearFilter()} />,
      },
      sorting: { defaultState: { sortingColumn: { sortingField: 'displayName' } } },
      pagination: { pageSize: prefs.pageSize },
      selection: { trackBy: 'id', keepSelection: false },
    });

  function clearFilter() {
    actions.setPropertyFiltering({ tokens: [], operation: 'and' });
    setUrlQuery({ tokens: [], operation: 'and' });
  }

  const selectedItems = (collectionProps.selectedItems ?? []) as ZoneItem[];
  const selected = selectedItems.length === 1 ? selectedItems[0] : undefined;

  const exportZones = async (format: 'json' | 'bind') => {
    const ids = selectedItems.length ? selectedItems.map(z => z.id) : undefined;
    try {
      const data = await api.exportZones(format, ids);
      const name = ids?.length === 1 ? selectedItems[0].displayName : 'hosted-zones';
      const content = format === 'json' ? JSON.stringify(data, null, 2) : String(data);
      const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.${format === 'json' ? 'json' : 'zone'}`;
      a.click();
      URL.revokeObjectURL(url);
      const count = ids?.length ?? zones?.length ?? 0;
      notify.success({
        header: `Exported ${count} hosted zone${count === 1 ? '' : 's'} as ${format === 'json' ? 'JSON' : 'BIND zone files'}.`,
        timeout: 5000,
      });
    } catch (e) {
      notify.error({ header: 'Export failed.', content: errorMessage(e) });
    }
  };

  const refresh = async () => {
    try {
      await mutate();
    } catch {
      notify.error({ header: 'Failed to refresh hosted zones.' });
    }
  };

  useShortcuts({
    create: goCreate,
    refresh: () => void refresh(),
    delete: () => selectedItems.length > 0 && setDeleteVisible(true),
    escape: () => setDeleteVisible(false),
  });

  const columnDefinitions: TableProps.ColumnDefinition<ZoneItem>[] = [
    {
      id: 'name',
      width: 240,
      header: 'Hosted zone name',
      sortingField: 'displayName',
      isRowHeader: true,
      cell: z => (
        <Link
          href={`/route53/v2/hostedzones/${z.id}`}
          onFollow={e => {
            e.preventDefault();
            router.push(`/route53/v2/hostedzones/${z.id}`);
          }}
        >
          {z.displayName}
        </Link>
      ),
    },
    { id: 'type', width: 110, header: 'Type', sortingField: 'typeLabel', cell: z => z.typeLabel },
    { id: 'createdBy', width: 130, header: 'Created by', sortingField: 'created_by', cell: z => z.created_by },
    { id: 'recordCount', width: 140, header: 'Record count', sortingField: 'record_count', cell: z => z.record_count },
    { id: 'description', width: 240, header: 'Description', sortingField: 'comment', cell: z => dash(z.comment) },
    { id: 'id', width: 260, header: 'Hosted zone ID', sortingField: 'id', cell: z => z.id },
  ];

  const filteringOptions = useMemo(
    () =>
      FILTERING_PROPERTIES.flatMap(p =>
        [...new Set(items.map(i => String(i[p.key as keyof ZoneItem] ?? '')).filter(Boolean))].map(value => ({
          propertyKey: p.key,
          value,
        })),
      ),
    [items],
  );

  return (
    <>
      <Table<ZoneItem>
        {...collectionProps}
        items={pageItems}
        columnDefinitions={columnDefinitions}
        columnDisplay={prefs.contentDisplay}
        selectionType="multi"
        variant="full-page"
        stickyHeader
        resizableColumns
        wrapLines={prefs.wrapLines}
        stripedRows={prefs.stripedRows}
        contentDensity={prefs.contentDensity}
        loading={isLoading}
        loadingText="Loading hosted zones"
        enableKeyboardNavigation
        trackBy="id"
        ariaLabels={{
          selectionGroupLabel: 'Hosted zones selection',
          itemSelectionLabel: (_, z) => `Select ${z.displayName}`,
          allItemsSelectionLabel: () => 'Select all hosted zones',
          tableLabel: 'Hosted zones',
        }}
        empty={
          error ? (
            <EmptyState
              title="Unable to load hosted zones"
              subtitle={error.message}
              action={<Button onClick={() => void refresh()}>Retry</Button>}
            />
          ) : (
            collectionProps.empty
          )
        }
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={zones ? (selectedItems.length ? `(${selectedItems.length}/${zones.length})` : `(${zones.length})`) : undefined}
            info={<InfoLink topic="hostedZones" />}
            description="Hosted zones are containers for records that specify how to route traffic for a domain and its subdomains."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  iconName="refresh"
                  ariaLabel="Refresh hosted zones"
                  loading={isValidating && !isLoading}
                  onClick={() => void refresh()}
                />
                <Button
                  disabled={!selected}
                  disabledReason="Select a single hosted zone."
                  onClick={() => selected && router.push(`/route53/v2/hostedzones/${selected.id}`)}
                >
                  View details
                </Button>
                <Button
                  disabled={!selected}
                  disabledReason="Select a single hosted zone."
                  onClick={() => selected && router.push(`/route53/v2/hostedzones/${selected.id}/edit`)}
                >
                  Edit
                </Button>
                <Button disabled={!selectedItems.length} onClick={() => setDeleteVisible(true)}>
                  Delete
                </Button>
                <ButtonDropdown
                  items={[
                    {
                      id: 'json',
                      text: selectedItems.length ? `Export selected (${selectedItems.length}) as JSON` : 'Export all as JSON',
                    },
                    {
                      id: 'bind',
                      text: selectedItems.length ? `Export selected (${selectedItems.length}) as BIND` : 'Export all as BIND',
                    },
                  ]}
                  onItemClick={e => void exportZones(e.detail.id as 'json' | 'bind')}
                >
                  Export
                </ButtonDropdown>
                <Button variant="primary" onClick={goCreate}>
                  Create hosted zone
                </Button>
              </SpaceBetween>
            }
          >
            Hosted zones
          </Header>
        }
        filter={
          <div data-shortcut="filter">
            <PropertyFilter
              {...propertyFilterProps}
              onChange={e => {
                propertyFilterProps.onChange(e);
                setUrlQuery(e.detail);
              }}
              filteringOptions={filteringOptions}
              filteringPlaceholder="Filter hosted zones by property or value"
              filteringAriaLabel="Filter hosted zones"
              i18nStrings={propertyFilterI18n}
              countText={`${filteredItemsCount ?? 0} ${filteredItemsCount === 1 ? 'match' : 'matches'}`}
              expandToViewport
            />
          </div>
        }
        pagination={<Pagination {...paginationProps} />}
        preferences={
          <TablePreferencesControl preferences={prefs} onChange={setPrefs} columnOptions={COLUMNS} resourceName="hosted zones" />
        }
      />
      <DeleteZoneModal
        zones={selectedItems}
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        onDeleted={deleted => {
          setDeleteVisible(false);
          actions.setSelectedItems([]);
          const ids = new Set(deleted.map(z => z.id));
          void mutate(
            data => (data ? { ...data, items: data.items.filter(z => !ids.has(z.id)), total: data.total - ids.size } : data),
            { revalidate: true },
          );
        }}
      />
    </>
  );
}
