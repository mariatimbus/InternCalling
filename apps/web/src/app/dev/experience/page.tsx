import { notFound } from "next/navigation";
import { ExperiencePreview } from "@/components/dev/experience-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Experience development preview", robots: { index: false, follow: false } };
export default function ExperiencePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ExperiencePreview />;
}
