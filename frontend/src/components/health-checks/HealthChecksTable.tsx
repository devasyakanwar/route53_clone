'use client';

import { useCollection } from '@cloudscape-design/collection-hooks';
import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
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
import { errorMessage } from '@/lib/api';
import type { HealthCheck } from '@/lib/types';
import { DeleteHealthChecksModal } from './DeleteHealthChecksModal';
import { HealthStatusIndicator, monitorLabel } from './shared';

const COLUMNS = [
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'status', label: 'Status' },
  { id: 'description', label: 'Description' },
  { id: 'alarms', label: 'Alarms' },
  { id: 'id', label: 'ID' },
  { id: 'monitor', label: 'What to monitor', visible: false },
];

const FILTERING_PROPERTIES = [
  { key: 'name', propertyLabel: 'Name', groupValuesLabel: 'Name values', operators: [...STRING_OPERATORS] },
  { key: 'status', propertyLabel: 'Status', groupValuesLabel: 'Status values', operators: ['=', '!='] },
  { key: 'description', propertyLabel: 'Description', groupValuesLabel: 'Description values', operators: [...STRING_OPERATORS] },
  { key: 'alarms', propertyLabel: 'Alarms', groupValuesLabel: 'Alarms values', operators: [...STRING_OPERATORS] },
  { key: 'id', propertyLabel: 'ID', groupValuesLabel: 'ID values', operators: [...STRING_OPERATORS] },
];

interface Props {
  checks: HealthCheck[] | undefined;
  loading: boolean;
  refreshing: boolean;
  error: Error | undefined;
  refresh: () => Promise<unknown>;
  selected: HealthCheck[];
  onSelectionChange: (items: HealthCheck[]) => void;
  onDeleted: (ids: string[]) => void;
}

export function HealthChecksTable({ checks, loading, refreshing, error, refresh, selected, onSelectionChange, onDeleted }: Props) {
  const router = useRouter();
  const notify = useNotify();
  const [urlQuery, setUrlQuery] = useUrlFilterQuery();
  const [prefs, setPrefs] = useTablePreferences('r53.health-checks-table', COLUMNS);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const goCreate = () => router.push('/route53/v2/healthchecks/create');

  const { items, actions, filteredItemsCount, collectionProps, propertyFilterProps, paginationProps } = useCollection(
    checks ?? [],
    {
      propertyFiltering: {
        filteringProperties: FILTERING_PROPERTIES,
        defaultQuery: urlQuery,
        empty: (
          <EmptyState
            title="No health checks"
            subtitle="You don't have any health checks."
            action={<Button onClick={goCreate}>Create health check</Button>}
          />
        ),
        noMatch: <NoMatchState onClear={() => clearFilter()} />,
      },
      sorting: { defaultState: { sortingColumn: { sortingField: 'name' } } },
      pagination: { pageSize: prefs.pageSize },
    },
  );

  function clearFilter() {
    actions.setPropertyFiltering({ tokens: [], operation: 'and' });
    setUrlQuery({ tokens: [], operation: 'and' });
  }

  const doRefresh = async () => {
    try {
      await refresh();
    } catch (e) {
      notify.error({ header: 'Failed to refresh health checks.', content: errorMessage(e) });
    }
  };

  useShortcuts({
    create: goCreate,
    refresh: () => void doRefresh(),
    delete: () => selected.length > 0 && setDeleteVisible(true),
    escape: () => (deleteVisible ? setDeleteVisible(false) : onSelectionChange([])),
  });

  const columnDefinitions: TableProps.ColumnDefinition<HealthCheck>[] = [
    { id: 'name', header: 'Name', sortingField: 'name', isRowHeader: true, width: 220, cell: h => h.name },
    { id: 'status', header: 'Status', sortingField: 'status', width: 140, cell: h => <HealthStatusIndicator status={h.status} /> },
    { id: 'description', header: 'Description', sortingField: 'description', width: 360, cell: h => h.description },
    { id: 'alarms', header: 'Alarms', sortingField: 'alarms', width: 200, cell: h => h.alarms },
    { id: 'id', header: 'ID', sortingField: 'id', width: 330, cell: h => h.id },
    { id: 'monitor', header: 'What to monitor', width: 260, cell: h => monitorLabel(h) },
  ];

  const filteringOptions = useMemo(
    () =>
      FILTERING_PROPERTIES.flatMap(p =>
        [...new Set((checks ?? []).map(h => String(h[p.key as keyof HealthCheck] ?? '')).filter(Boolean))].map(value => ({
          propertyKey: p.key,
          value,
        })),
      ),
    [checks],
  );

  const single = selected.length === 1 ? selected[0] : undefined;

  return (
    <>
      <Table<HealthCheck>
        {...collectionProps}
        items={items}
        trackBy="id"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={e => onSelectionChange([...e.detail.selectedItems])}
        onRowClick={e => onSelectionChange([e.detail.item])}
        columnDefinitions={columnDefinitions}
        columnDisplay={prefs.contentDisplay}
        variant="full-page"
        stickyHeader
        resizableColumns
        wrapLines={prefs.wrapLines}
        stripedRows={prefs.stripedRows}
        contentDensity={prefs.contentDensity}
        loading={loading}
        loadingText="Loading health checks"
        ariaLabels={{
          selectionGroupLabel: 'Health checks selection',
          itemSelectionLabel: (_, h) => `Select ${h.name}`,
          allItemsSelectionLabel: () => 'Select all health checks',
          tableLabel: 'Health checks',
        }}
        empty={
          error ? (
            <EmptyState title="Unable to load health checks" subtitle={error.message} action={<Button onClick={() => void doRefresh()}>Retry</Button>} />
          ) : (
            collectionProps.empty
          )
        }
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={checks ? (selected.length ? `(${selected.length}/${checks.length})` : `(${checks.length})`) : undefined}
            info={<InfoLink topic="healthChecks" />}
            description="Route 53 health checks monitor the health and performance of your web applications, web servers, and other resources."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh health checks" loading={refreshing && !loading} onClick={() => void doRefresh()} />
                <Button disabled={!selected.length} onClick={() => setDeleteVisible(true)}>
                  Delete health check{selected.length > 1 ? 's' : ''}
                </Button>
                <Button
                  disabled={!single}
                  disabledReason="Select a single health check to edit."
                  onClick={() => single && router.push(`/route53/v2/healthchecks/${single.id}/edit`)}
                >
                  Edit health check
                </Button>
                <Button variant="primary" onClick={goCreate}>
                  Create health check
                </Button>
              </SpaceBetween>
            }
          >
            Health checks
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
              filteringPlaceholder="Filter health checks by property or value"
              filteringAriaLabel="Filter health checks"
              i18nStrings={propertyFilterI18n}
              countText={`${filteredItemsCount ?? 0} ${filteredItemsCount === 1 ? 'match' : 'matches'}`}
              expandToViewport
            />
          </div>
        }
        pagination={<Pagination {...paginationProps} />}
        preferences={<TablePreferencesControl preferences={prefs} onChange={setPrefs} columnOptions={COLUMNS} resourceName="health checks" />}
      />
      <DeleteHealthChecksModal
        checks={selected}
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        onDeleted={ids => {
          setDeleteVisible(false);
          onDeleted(ids);
        }}
      />
    </>
  );
}
