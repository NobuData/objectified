import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../../../components/DashboardPageSkeleton';

const TenantSettingsPageClient = dynamic(
  () => import('./TenantSettingsPageClient'),
  {
    ssr: true,
    loading: () => <DashboardPageSkeleton />,
  }
);

export default function TenantSettingsPage() {
  return <TenantSettingsPageClient />;
}
