import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const TenantsPageClient = dynamic(() => import('./TenantsPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function TenantsPage() {
  return <TenantsPageClient />;
}
