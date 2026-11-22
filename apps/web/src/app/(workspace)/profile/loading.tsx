import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function ProfileLoading() {
  return <div className="mx-auto max-w-3xl px-5 py-9 sm:px-8" aria-busy="true"><LoadingSkeleton label="Loading your profile" count={2} /></div>;
}
