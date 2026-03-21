import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const ProfilePageClient = dynamic(() => import('./ProfilePageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function ProfilePage() {
  return <ProfilePageClient />;
}
