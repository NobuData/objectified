export default function DashboardHomePage() {
  return (
    <div className="p-6 print:bg-white">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2 print:text-black">
        Dashboard
      </h1>
      <p className="text-slate-600 dark:text-slate-400 print:text-slate-800">
        Welcome. Use the sidebar to navigate to Projects, Versions, Publish, Published, Tenants,
        or your Profile.
      </p>
    </div>
  );
}
