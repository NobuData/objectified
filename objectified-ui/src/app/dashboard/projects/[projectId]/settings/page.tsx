import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../../../components/DashboardPageSkeleton';

const ProjectSettingsPageClient = dynamic(
  () => import('./ProjectSettingsPageClient'),
  {
    ssr: true,
    loading: () => <DashboardPageSkeleton />,
  }
);

export default function ProjectSettingsPage() {
  return <ProjectSettingsPageClient />;
}
