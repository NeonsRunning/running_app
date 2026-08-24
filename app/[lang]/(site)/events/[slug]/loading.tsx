import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="border-b-2 border-line px-4 py-14 sm:px-6 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-[1600px]">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-6 h-20 w-full max-w-2xl" />
          <Skeleton className="mt-6 h-4 w-96 max-w-full" />
        </div>
      </div>
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-ink px-6 py-6">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-8 lg:px-10">
        <SkeletonText lines={5} />
      </div>
    </div>
  );
}
