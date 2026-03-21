/**
 * Placeholder for dashboard main column while a route segment or lazy page chunk loads.
 * Uses slate/indigo palette to match the shell and respect light/dark themes.
 */
export default function DashboardPageSkeleton() {
  return (
    <div
      className="p-6 space-y-6 animate-pulse"
      aria-busy
      aria-label="Loading page content"
    >
      <div className="space-y-2">
        <div className="h-7 w-48 max-w-full rounded-md bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-96 max-w-full rounded-md bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-28 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-9 w-28 rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden">
        <div className="h-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50" />
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 items-center">
              <div className="h-4 flex-1 max-w-md rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800 hidden sm:block" />
              <div className="h-4 w-16 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
