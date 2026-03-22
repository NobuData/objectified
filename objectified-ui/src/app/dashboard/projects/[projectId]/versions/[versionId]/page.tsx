import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../../../../components/DashboardPageSkeleton';

const ProjectVersionPageClient = dynamic(
  () => import('./ProjectVersionPageClient'),
  {
    ssr: true,
    loading: () => <DashboardPageSkeleton />,
  }
);

export default function ProjectVersionPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <ProjectVersionPageClient />
    </Suspense>
  );
}
