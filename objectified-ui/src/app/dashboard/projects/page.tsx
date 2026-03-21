import dynamic from 'next/dynamic';
import DashboardPageSkeleton from '../components/DashboardPageSkeleton';

const ProjectsPageClient = dynamic(() => import('./ProjectsPageClient'), {
  ssr: true,
  loading: () => <DashboardPageSkeleton />,
});

export default function ProjectsPage() {
  return <ProjectsPageClient />;
}
