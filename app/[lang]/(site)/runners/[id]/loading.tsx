import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="border-b-2 border-line">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-7 px-4 py-10 sm:px-6 lg:flex-row lg:gap-9 lg:px-10 lg:py-14">
          <Skeleton className="h-28 w-28 shrink-0 sm:h-44 sm:w-44" />
          <div className="flex-1">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="mt-4 h-14 w-96 max-w-full" />
            <div className="mt-6 max-w-[56ch]">
              <SkeletonText lines={2} />
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-56">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-ink px-6 py-7">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[1fr_400px]">
        <div className="border-line lg:border-r-2">
          <div className="border-b-2 border-line px-4 py-10 sm:px-8 lg:px-10">
            <Skeleton className="h-3 w-32" />
            <div className="mt-6 grid gap-0.5 bg-line sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-ink p-5">
                  <SkeletonText lines={2} />
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 py-10 sm:px-8 lg:px-10">
            <Skeleton className="h-3 w-32" />
            <div className="mt-6 flex flex-col gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          </div>
        </div>
        <div className="border-t-2 border-line px-5 py-7 sm:px-7 lg:border-t-0">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-56" />
        </div>
      </div>
    </div>
  );
}
