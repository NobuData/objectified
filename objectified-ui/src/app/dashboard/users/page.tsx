import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const UsersPageClient = dynamic(() => import('./UsersPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function UsersPage() {
  return <UsersPageClient />;
}
