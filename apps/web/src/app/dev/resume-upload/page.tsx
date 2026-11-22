import { notFound } from "next/navigation";
import { ResumeUploadPreview } from "@/components/dev/resume-upload-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Resume PDF development preview", robots: { index: false, follow: false } };
export default function ResumeUploadPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ResumeUploadPreview />;
}
