import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="mt-4 h-12 w-96 max-w-full" />
      <div className="mt-10 grid grid-cols-2 gap-0.5 bg-line lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-ink px-6 py-7">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-72" />
        <div className="border-2 border-line p-5">
          <SkeletonText lines={6} />
        </div>
      </div>
    </div>
  );
}
