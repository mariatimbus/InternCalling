import { JobsPreview } from "@/components/dev/jobs-preview";

export default async function JobsPage({ searchParams }: PageProps<"/preview/jobs">) {
  const query = await searchParams;
  const initialJobId = typeof query.job === "string" ? query.job : undefined;
  return <JobsPreview key={initialJobId ?? "recommended"} initialJobId={initialJobId} />;
}
