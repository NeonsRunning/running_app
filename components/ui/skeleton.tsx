import { cn } from "@/lib/cn";

/** Content-shaped loading placeholder. Preferred over spinners everywhere. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/** A block of skeleton lines that reads as a paragraph. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Matches the footprint of an EventCard so lists do not jump on load. */
export function SkeletonEventCard() {
  return (
    <div
      className="grid grid-cols-1 border-t-2 border-line md:grid-cols-[240px_1fr_180px_210px]"
      aria-hidden="true"
    >
      <Skeleton className="h-44" />
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-auto h-3 w-1/2" />
      </div>
      <div className="hidden flex-col items-center justify-center gap-2 border-l-2 border-line md:flex">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-10 w-14" />
      </div>
      <div className="hidden flex-col justify-center gap-3 border-l-2 border-line p-6 md:flex">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}
