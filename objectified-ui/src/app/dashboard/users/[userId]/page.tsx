import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../../components/DashboardPageSkeleton';

const UserDetailPageClient = dynamic(() => import('./UserDetailPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function UserDetailPage() {
  return <UserDetailPageClient />;
}
