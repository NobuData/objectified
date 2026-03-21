import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../../../components/DashboardPageSkeleton';

const TenantMembersPageClient = dynamic(
  () => import('./TenantMembersPageClient'),
  {
    ssr: true,
    loading: () => <DashboardPageSkeleton />,
  }
);

export default function TenantMembersPage() {
  return <TenantMembersPageClient />;
}
