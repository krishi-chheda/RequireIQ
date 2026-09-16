import { Card, SkeletonRows } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-6">
        <div className="space-y-3 border-b border-line pb-5">
          <div className="h-3 w-40 animate-pulse rounded-xs bg-overlay" />
          <div className="h-6 w-80 animate-pulse rounded-sm bg-overlay" />
          <div className="h-3 w-full max-w-2xl animate-pulse rounded-xs bg-overlay" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-line bg-surface" />
          ))}
        </div>
        <Card className="p-5">
          <SkeletonRows rows={5} />
        </Card>
      </div>
    </main>
  );
}
