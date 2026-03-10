'use client';

import TopHeader from '@/app/dashboard/components/TopHeader';
import ProjectVersionBar from '@/app/dashboard/components/ProjectVersionBar';
import DesignCanvasSidebar from '@/app/dashboard/components/DesignCanvasSidebar';
import DesignCanvas from '@/app/dashboard/components/DesignCanvas';
import { WorkspaceProvider } from '@/app/contexts/WorkspaceContext';

export default function DataDesignerPage() {
  return (
    <WorkspaceProvider>
      <div className="flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <TopHeader />
        <ProjectVersionBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <DesignCanvasSidebar />
          <main className="flex-1 min-w-0 min-h-0 relative">
            <DesignCanvas />
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
