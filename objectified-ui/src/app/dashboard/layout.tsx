import type { ReactNode } from 'react';
import { Suspense } from 'react';
import DashboardShellSkeleton from './components/DashboardShellSkeleton';
import DashboardLayoutInner from './DashboardLayoutInner';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
