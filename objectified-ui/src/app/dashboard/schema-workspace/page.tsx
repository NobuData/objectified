import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const SchemaWorkspacePageClient = dynamic(
  () => import('./SchemaWorkspacePageClient'),
  {
    ssr: true,
    loading: () => <DashboardPageSkeleton />,
  }
);

export default function SchemaWorkspacePage() {
  return <SchemaWorkspacePageClient />;
}
