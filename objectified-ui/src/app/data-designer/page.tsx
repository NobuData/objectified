'use client';

import { useRouter } from 'next/navigation';
import TopHeader from '@/app/dashboard/components/TopHeader';
import ProjectVersionBar from '@/app/dashboard/components/ProjectVersionBar';
import DesignCanvasSidebar from '@/app/dashboard/components/DesignCanvasSidebar';
import DesignCanvas from '@/app/dashboard/components/DesignCanvas';
import StudioVersionSync from '@/app/dashboard/components/StudioVersionSync';
import StudioToolbar from '@/app/dashboard/components/StudioToolbar';
import StudioUrlLoader from '@/app/dashboard/components/StudioUrlLoader';
import CodeGenerationPreviewPanel from '@/app/dashboard/components/CodeGenerationPreviewPanel';
import {
  CodeGenerationPanelProvider,
  useCodeGenerationPanelOptional,
} from '@/app/contexts/CodeGenerationPanelContext';
import { WorkspaceProvider } from '@/app/contexts/WorkspaceContext';
import { StudioProvider } from '@/app/contexts/StudioContext';
import { CanvasSettingsProvider } from '@/app/contexts/CanvasSettingsContext';
import { CanvasGroupProvider } from '@/app/contexts/CanvasGroupContext';
import { CanvasLayoutProvider } from '@/app/contexts/CanvasLayoutContext';
import { CanvasSearchProvider } from '@/app/contexts/CanvasSearchContext';
import { CanvasFocusModeProvider } from '@/app/contexts/CanvasFocusModeContext';
import { CanvasSidebarActionsProvider } from '@/app/contexts/CanvasSidebarActionsContext';
import { CanvasExportProvider } from '@/app/contexts/CanvasExportContext';
import { EditClassRequestProvider } from '@/app/contexts/EditClassRequestContext';
import CanvasSearchBar from '@/app/dashboard/components/CanvasSearchBar';
import { useDashboardKeyboardShortcuts } from '@/app/dashboard/hooks/useDashboardKeyboardShortcuts';

function DataDesignerLayoutBody() {
  const codegenPanel = useCodeGenerationPanelOptional();
  const router = useRouter();

  useDashboardKeyboardShortcuts(router, {});

  return (
    <>
      <StudioVersionSync />
      <StudioUrlLoader />

      <div className="relative flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 print:bg-white print:text-black">
        <a
          href="#data-designer-main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          Skip to main content
        </a>
        <TopHeader />
        <div className="flex items-center justify-between shrink-0 print:hidden">
          <ProjectVersionBar />
          <StudioToolbar />
        </div>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <DesignCanvasSidebar />
          <main
            id="data-designer-main-content"
            tabIndex={-1}
            className="flex-1 min-w-0 min-h-0 relative flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset dark:focus-visible:ring-offset-slate-900"
          >
            <CanvasSearchBar />
            <div className="flex-1 min-h-0">
              <DesignCanvas />
            </div>
          </main>
          {codegenPanel?.panelOpen && (
            <CodeGenerationPreviewPanel
              onClose={() => codegenPanel.setPanelOpen(false)}
              onOpenFullDialog={() => {
                codegenPanel.requestOpenGenerateCodeDialog();
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default function DataDesignerPage() {
  return (
    <WorkspaceProvider>
      <StudioProvider>
        <CanvasSettingsProvider>
          <CanvasExportProvider>
            <CanvasGroupProvider>
              <CanvasLayoutProvider>
                <CanvasSearchProvider>
                  <CanvasFocusModeProvider>
                    <CanvasSidebarActionsProvider>
                      <EditClassRequestProvider>
                        <CodeGenerationPanelProvider>
                          <DataDesignerLayoutBody />
                        </CodeGenerationPanelProvider>
                      </EditClassRequestProvider>
                    </CanvasSidebarActionsProvider>
                  </CanvasFocusModeProvider>
                </CanvasSearchProvider>
              </CanvasLayoutProvider>
            </CanvasGroupProvider>
          </CanvasExportProvider>
        </CanvasSettingsProvider>
      </StudioProvider>
    </WorkspaceProvider>
  );
}
