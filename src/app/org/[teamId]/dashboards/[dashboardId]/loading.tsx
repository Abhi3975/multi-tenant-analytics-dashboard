export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse p-6">
      <div className="mb-6 h-8 w-56 rounded bg-muted" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-48 rounded-xl bg-muted" />
        <div className="h-48 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
