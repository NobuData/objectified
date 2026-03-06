'use client';

import TopHeader from './components/TopHeader';
import ProjectVersionBar from './components/ProjectVersionBar';
import DesignCanvasSidebar from './components/DesignCanvasSidebar';
import DesignCanvas from './components/DesignCanvas';

export default function DashboardPage() {
  return (
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
  );
}
