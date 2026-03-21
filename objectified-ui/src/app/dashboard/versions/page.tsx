import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const VersionsPageClient = dynamic(() => import('./VersionsPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function VersionsPage() {
  return <VersionsPageClient />;
}
