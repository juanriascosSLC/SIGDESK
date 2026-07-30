export function LoadingSkeleton({ type }: { type: 'card' | 'list' | 'detail' }) {
  if (type === 'card') {
    return (
      <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 animate-pulse">
        <div className="w-12 h-12 rounded-2xl bg-surface-container-high mb-6" />
        <div className="h-4 bg-surface-container-high rounded w-3/4 mb-2" />
        <div className="h-3 bg-surface-container rounded w-1/2" />
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-surface-container-low border border-border/40 rounded-xl flex items-center px-6 gap-4">
             <div className="w-4 h-4 rounded bg-surface-container-high" />
             <div className="flex-1 space-y-2">
                <div className="h-3 bg-surface-container-high rounded w-1/3" />
                <div className="h-2 bg-surface-container rounded w-1/4" />
             </div>
             <div className="w-20 h-6 rounded-full bg-surface-container-high" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-pulse max-w-4xl">
      <div className="flex gap-4 items-center">
         <div className="w-16 h-16 rounded-2xl bg-surface-container-high" />
         <div className="space-y-3 flex-1">
            <div className="h-6 bg-surface-container-high rounded w-2/3" />
            <div className="h-4 bg-surface-container rounded w-1/3" />
         </div>
      </div>
      <div className="space-y-3">
         <div className="h-3 bg-surface-container rounded w-full" />
         <div className="h-3 bg-surface-container rounded w-full" />
         <div className="h-3 bg-surface-container rounded w-5/6" />
         <div className="h-3 bg-surface-container rounded w-4/6" />
      </div>
    </div>
  );
}
