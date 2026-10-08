'use client';

import { usePathname } from 'next/navigation';
import { ComingSoon } from '@/components/common/ComingSoon';
import { findNavTitle } from '@/components/shell/SideNav';

/** Every side-navigation section other than Hosted zones lands here. */
export default function ComingSoonPage() {
  const pathname = usePathname();
  const fallback = pathname.split('/').pop()?.replace(/-/g, ' ') ?? 'Route 53';
  const title = findNavTitle(pathname) ?? fallback.charAt(0).toUpperCase() + fallback.slice(1);
  return <ComingSoon title={title} href={pathname} />;
}
