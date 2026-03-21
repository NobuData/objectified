import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../../../components/DashboardPageSkeleton';

const TenantSsoPageClient = dynamic(() => import('./TenantSsoPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function TenantSsoPage() {
  return <TenantSsoPageClient />;
}
