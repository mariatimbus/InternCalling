import { notFound } from "next/navigation";
import { ProjectsPreview } from "@/components/dev/projects-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Projects development preview", robots: { index: false, follow: false } };
export default function ProjectsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ProjectsPreview />;
}
