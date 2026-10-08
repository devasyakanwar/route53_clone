'use client';

import Link from '@cloudscape-design/components/link';
import { useHelp } from '@/components/help/HelpPanelProvider';
import type { HelpKey } from '@/components/help/helpContent';

export function InfoLink({ topic, ariaLabel }: { topic: HelpKey; ariaLabel?: string }) {
  const { openHelp } = useHelp();
  return (
    <Link variant="info" onFollow={() => openHelp(topic)} ariaLabel={ariaLabel ?? 'Information'}>
      Info
    </Link>
  );
}
