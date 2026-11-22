import { notFound } from "next/navigation";
import { LanguagesPreview } from "@/components/dev/languages-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Languages development preview", robots: { index: false, follow: false } };
export default function LanguagesPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LanguagesPreview />;
}
