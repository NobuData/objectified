import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../../../components/DashboardPageSkeleton';

const TenantAdministratorsPageClient = dynamic(
  () => import('./TenantAdministratorsPageClient'),
  {
    ssr: true,
    loading: () => <DashboardPageSkeleton />,
  }
);

export default function TenantAdministratorsPage() {
  return <TenantAdministratorsPageClient />;
}
