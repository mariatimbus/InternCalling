import { notFound } from "next/navigation";
import { PublicationsPreview } from "@/components/dev/publications-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Publications development preview", robots: { index: false, follow: false } };
export default function PublicationsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PublicationsPreview />;
}
