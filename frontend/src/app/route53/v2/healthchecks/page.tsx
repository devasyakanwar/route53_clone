'use client';

import { Suspense, useEffect, useState } from 'react';
import { HealthCheckSplitPanel } from '@/components/health-checks/HealthCheckSplitPanel';
import { HealthChecksTable } from '@/components/health-checks/HealthChecksTable';
import { ConsolePage } from '@/components/shell/ConsolePage';
import { useHealthChecks } from '@/hooks/useHealthChecks';
import type { HealthCheck } from '@/lib/types';

function HealthChecksContent() {
  const { healthChecks, error, isLoading, isValidating, mutate } = useHealthChecks();
  const [selected, setSelected] = useState<HealthCheck[]>([]);
  const [splitOpen, setSplitOpen] = useState(false);

  // Keep selected items fresh after polling; drop deleted ones.
  useEffect(() => {
    if (!healthChecks) return;
    setSelected(prev => prev.map(p => healthChecks.find(h => h.id === p.id)).filter((h): h is HealthCheck => !!h));
  }, [healthChecks]);

  const onSelectionChange = (next: HealthCheck[]) => {
    setSelected(next);
    setSplitOpen(next.length > 0);
  };

  return (
    <ConsolePage
      breadcrumbs={[{ text: 'Health checks', href: '/route53/v2/healthchecks' }]}
      helpKey="healthChecks"
      contentType="table"
      splitPanel={selected.length ? <HealthCheckSplitPanel selected={selected} all={healthChecks ?? []} /> : undefined}
      splitPanelOpen={splitOpen && selected.length > 0}
      onSplitPanelToggle={setSplitOpen}
    >
      <HealthChecksTable
        checks={healthChecks}
        loading={isLoading}
        refreshing={isValidating}
        error={error}
        refresh={() => mutate()}
        selected={selected}
        onSelectionChange={onSelectionChange}
        onDeleted={ids => {
          setSelected([]);
          setSplitOpen(false);
          void mutate(data => (data ? { ...data, items: data.items.filter(h => !ids.includes(h.id)), total: data.total - ids.length } : data), {
            revalidate: true,
          });
        }}
      />
    </ConsolePage>
  );
}

export default function HealthChecksPage() {
  return (
    <Suspense>
      <HealthChecksContent />
    </Suspense>
  );
}
