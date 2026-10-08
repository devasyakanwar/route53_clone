'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from '@cloudscape-design/components/collection-preferences';
import type { PropertyFilterProps } from '@cloudscape-design/components/property-filter';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export interface TablePreferences {
  pageSize: number;
  wrapLines: boolean;
  stripedRows: boolean;
  contentDensity: 'comfortable' | 'compact';
  contentDisplay: ReadonlyArray<CollectionPreferencesProps.ContentDisplayItem>;
}

export function useTablePreferences(storageKey: string, columns: { id: string; visible?: boolean }[]) {
  const defaults: TablePreferences = {
    pageSize: 10,
    wrapLines: false,
    stripedRows: false,
    contentDensity: 'comfortable',
    contentDisplay: columns.map(c => ({ id: c.id, visible: c.visible ?? true })),
  };
  const [prefs, setPrefs] = useLocalStorage<TablePreferences>(storageKey, defaults);
  // Keep columns added after the preferences were saved.
  const known = new Set(prefs.contentDisplay.map(c => c.id));
  const contentDisplay = [
    ...prefs.contentDisplay.filter(c => columns.some(col => col.id === c.id)),
    ...defaults.contentDisplay.filter(c => !known.has(c.id)),
  ];
  return [{ ...prefs, contentDisplay }, setPrefs] as const;
}

export function TablePreferencesControl({
  preferences,
  onChange,
  columnOptions,
  resourceName,
}: {
  preferences: TablePreferences;
  onChange: (p: TablePreferences) => void;
  columnOptions: { id: string; label: string; alwaysVisible?: boolean }[];
  resourceName: string;
}) {
  return (
    <CollectionPreferences
      title="Preferences"
      confirmLabel="Confirm"
      cancelLabel="Cancel"
      preferences={preferences}
      onConfirm={e => onChange({ ...preferences, ...(e.detail as Partial<TablePreferences>) })}
      pageSizePreference={{
        title: 'Page size',
        options: [10, 25, 50, 100].map(n => ({ value: n, label: `${n} ${resourceName}` })),
      }}
      wrapLinesPreference={{ label: 'Wrap lines', description: 'Select to see all the text and wrap the lines' }}
      stripedRowsPreference={{ label: 'Striped rows', description: 'Select to add alternating shaded rows' }}
      contentDensityPreference={{ label: 'Compact mode', description: 'Select to display content in a denser, more compact mode' }}
      contentDisplayPreference={{
        title: 'Column preferences',
        description: 'Customize the columns visibility and order.',
        options: columnOptions,
      }}
    />
  );
}

export function EmptyState({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <Box textAlign="center" color="inherit" padding={{ vertical: 's' }}>
      <SpaceBetween size="xxs">
        <Box variant="strong" color="inherit">
          {title}
        </Box>
        <Box variant="p" color="inherit" padding={{ bottom: 's' }}>
          {subtitle}
        </Box>
        {action}
      </SpaceBetween>
    </Box>
  );
}

export function NoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      title="No matches"
      subtitle="We can't find a match."
      action={<Button onClick={onClear}>Clear filter</Button>}
    />
  );
}

export const STRING_OPERATORS = ['=', '!=', ':', '!:'] as const;

export const propertyFilterI18n: PropertyFilterProps.I18nStrings = {
  filteringAriaLabel: 'Filter',
  dismissAriaLabel: 'Dismiss',
  clearAriaLabel: 'Clear',
  groupValuesText: 'Values',
  groupPropertiesText: 'Properties',
  operatorsText: 'Operators',
  operationAndText: 'and',
  operationOrText: 'or',
  operatorLessText: 'Less than',
  operatorLessOrEqualText: 'Less than or equal',
  operatorGreaterText: 'Greater than',
  operatorGreaterOrEqualText: 'Greater than or equal',
  operatorContainsText: 'Contains',
  operatorDoesNotContainText: 'Does not contain',
  operatorEqualsText: 'Equals',
  operatorDoesNotEqualText: 'Does not equal',
  editTokenHeader: 'Edit filter',
  propertyText: 'Property',
  operatorText: 'Operator',
  valueText: 'Value',
  cancelActionText: 'Cancel',
  applyActionText: 'Apply',
  allPropertiesLabel: 'All properties',
  tokenLimitShowMore: 'Show more',
  tokenLimitShowFewer: 'Show fewer',
  clearFiltersText: 'Clear filters',
  removeTokenButtonAriaLabel: token => `Remove token ${token.propertyKey} ${token.operator} ${token.value}`,
  enteredTextLabel: text => `Use: "${text}"`,
};

const EMPTY_QUERY: PropertyFilterProps.Query = { tokens: [], operation: 'and' };

/** Keeps a property-filter query in the URL (?filter=...) so it survives reloads and can be shared. */
export function useUrlFilterQuery(param = 'filter') {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(param);

  const query = useMemo<PropertyFilterProps.Query>(() => {
    if (!raw) return EMPTY_QUERY;
    try {
      const parsed = JSON.parse(raw) as PropertyFilterProps.Query;
      return Array.isArray(parsed.tokens) ? parsed : EMPTY_QUERY;
    } catch {
      return EMPTY_QUERY;
    }
  }, [raw]);

  const setQuery = useCallback(
    (q: PropertyFilterProps.Query) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.tokens.length) params.set(param, JSON.stringify({ tokens: q.tokens, operation: q.operation }));
      else params.delete(param);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, param],
  );

  return [query, setQuery] as const;
}
