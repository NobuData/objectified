/**
 * Full chrome placeholder while the authenticated dashboard layout resolves (session + shell).
 * Matches DashboardShell structure: header, breadcrumbs, sidebar strip, main column.
 */
export default function DashboardShellSkeleton() {
  return (
    <div className="relative flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 print:bg-white print:text-black animate-pulse">
      <header className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 print:hidden">
        <div className="flex items-center gap-4">
          <div className="h-8 w-24 rounded-md bg-slate-200 dark:bg-slate-700" />
          <div className="hidden md:flex gap-2">
            <div className="h-8 w-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 w-24 rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
      </header>

      <div className="shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:hidden">
        <div className="h-4 w-56 max-w-full rounded bg-slate-100 dark:bg-slate-800" />
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className="hidden md:flex flex-col shrink-0 w-[280px] border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:hidden p-4 space-y-3"
          aria-hidden
        >
          <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-200/80 dark:bg-slate-700/80" />
          ))}
        </aside>

        <main className="flex-1 min-w-0 min-h-0 overflow-auto bg-transparent print:overflow-visible">
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <div className="h-7 w-52 rounded-md bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-80 max-w-full rounded-md bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 h-64" />
          </div>
        </main>
      </div>
    </div>
  );
}
