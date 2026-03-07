import Link from 'next/link';

export default function DataDesignerPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[var(--background)] text-[var(--foreground)]">
      <h1 className="text-xl font-semibold mb-2">Data Designer</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Coming soon
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
