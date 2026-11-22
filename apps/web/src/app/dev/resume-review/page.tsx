import { notFound } from "next/navigation";
import { ResumeReviewPreview } from "@/components/dev/resume-review-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Resume review development preview", robots: { index: false, follow: false } };
export default function ResumeReviewPreviewPage(){if(process.env.NODE_ENV!=="development")notFound();return <ResumeReviewPreview/>;}
