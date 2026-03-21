import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const PublishedPageClient = dynamic(() => import('./PublishedPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function PublishedPage() {
  return <PublishedPageClient />;
}
