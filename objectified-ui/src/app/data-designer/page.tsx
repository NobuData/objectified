'use client';

import TopHeader from '@/app/dashboard/components/TopHeader';
import ProjectVersionBar from '@/app/dashboard/components/ProjectVersionBar';
import DesignCanvasSidebar from '@/app/dashboard/components/DesignCanvasSidebar';
import DesignCanvas from '@/app/dashboard/components/DesignCanvas';
import StudioVersionSync from '@/app/dashboard/components/StudioVersionSync';
import StudioToolbar from '@/app/dashboard/components/StudioToolbar';
import StudioUrlLoader from '@/app/dashboard/components/StudioUrlLoader';
import { WorkspaceProvider } from '@/app/contexts/WorkspaceContext';
import { StudioProvider } from '@/app/contexts/StudioContext';
import { CanvasSettingsProvider } from '@/app/contexts/CanvasSettingsContext';
import { CanvasGroupProvider } from '@/app/contexts/CanvasGroupContext';
import { EditClassRequestProvider } from '@/app/contexts/EditClassRequestContext';

export default function DataDesignerPage() {
  return (
    <WorkspaceProvider>
      <StudioProvider>
        <CanvasSettingsProvider>
          <CanvasGroupProvider>
          <EditClassRequestProvider>
          <StudioVersionSync />
          <StudioUrlLoader />
        <div className="flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          <TopHeader />
          <div className="flex items-center justify-between shrink-0">
            <ProjectVersionBar />
            <StudioToolbar />
          </div>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <DesignCanvasSidebar />
            <main className="flex-1 min-w-0 min-h-0 relative">
              <DesignCanvas />
            </main>
          </div>
        </div>
          </EditClassRequestProvider>
          </CanvasGroupProvider>
        </CanvasSettingsProvider>
      </StudioProvider>
    </WorkspaceProvider>
  );
}
