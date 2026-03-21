import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const PublishPageClient = dynamic(() => import('./PublishPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function PublishPage() {
  return <PublishPageClient />;
}
